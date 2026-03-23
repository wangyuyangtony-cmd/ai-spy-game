import { v4 as uuidv4 } from 'uuid';
import { Server as SocketIOServer } from 'socket.io';
import { getDB } from '../db';
import { callLLM, LLMMessage } from './llm-adapter';
import { gameEventBus } from './events';

// ============================================================
// Types
// ============================================================

interface RoomPlayer {
  id: string;
  room_id: string;
  user_id: string;
  agent_id: string;
  is_ready: number;
}

interface AgentConfig {
  id: string;
  name: string;
  avatar: string | null;
  model: string | null;
  system_prompt: string | null;
  temperature: number;
  top_p: number;
  max_tokens: number;
  strategy_template: string | null;
  description: string | null;
}

interface GamePlayer {
  id: string;
  game_id: string;
  user_id: string;
  agent_id: string;
  agent_config_snapshot: AgentConfig;
  seat_index: number;
  role: 'CIVILIAN' | 'SPY' | 'BLANK';
  word: string | null;
  is_alive: boolean;
  eliminated_round: number | null;
  username: string;
  nickname: string;
}

interface Speech {
  player_id: string;
  seat_index: number;
  player_name: string;
  content: string;
  timestamp: string;
}

interface Vote {
  voter_id: string;
  voter_seat: number;
  voter_name: string;
  target_seat: number;
  target_id: string;
  target_name: string;
}

interface GameState {
  game_id: string;
  room_id: string;
  owner_id: string;
  round_number: number;
  players: GamePlayer[];
  alive_players: GamePlayer[];
  rounds_history: Array<{
    round_number: number;
    speeches: Speech[];
    votes: Vote[];
    eliminated_player_id: string | null;
  }>;
  config: any;
  word_pair: { civilian_word: string; spy_word: string };
}

// ============================================================
// Timing Constants (milliseconds)
// ============================================================

const DELAY_GAME_START       = 2000;  // After game:start, before round 1
const DELAY_ROUND_START      = 1500;  // After round_start event
const DELAY_SPEECH_PHASE     = 1000;  // After speech_phase_start event
const DELAY_BETWEEN_SPEECHES = 2500;  // Between each speech (time to read)
const DELAY_PRE_CONFIRM      = 1500;  // Before emitting confirm_needed
const DELAY_VOTE_PHASE       = 1500;  // After vote_phase_start event
const DELAY_AFTER_VOTES      = 2500;  // After votes shown, before elimination
const DELAY_AFTER_ELIMINATION= 3000;  // After elimination shown
const DELAY_BETWEEN_ROUNDS   = 2000;  // After post_vote confirm, before next round
const CONFIRM_TIMEOUT        = 120;   // Owner confirm timeout in seconds

// ============================================================
// Owner Confirmation Helper
// ============================================================

/**
 * Pause the game and wait for the room owner to confirm before continuing.
 * Emits a 'game:confirm_needed' event and waits for the event bus signal.
 * Auto-continues after CONFIRM_TIMEOUT seconds.
 */
function waitForOwnerConfirm(
  io: SocketIOServer,
  roomId: string,
  gameId: string,
  ownerId: string,
  confirmType: 'pre_vote' | 'post_vote',
  message: string,
  roundNumber: number,
): Promise<void> {
  return new Promise((resolve) => {
    // Emit the confirmation request to all clients
    io.to(roomId).emit('game:confirm_needed', {
      game_id: gameId,
      confirm_type: confirmType,
      owner_id: ownerId,
      round_number: roundNumber,
      message,
      timeout: CONFIRM_TIMEOUT,
    });

    console.log(`[ENGINE] Game ${gameId} - Waiting for owner confirm: ${confirmType} (timeout: ${CONFIRM_TIMEOUT}s)`);

    // Auto-continue after timeout
    const timer = setTimeout(() => {
      gameEventBus.removeAllListeners(`confirm:${gameId}:${confirmType}`);
      console.log(`[ENGINE] Game ${gameId} - Confirm timeout for ${confirmType}, auto-continuing`);
      io.to(roomId).emit('game:confirm_resolved', {
        game_id: gameId,
        confirm_type: confirmType,
        auto: true,
      });
      resolve();
    }, CONFIRM_TIMEOUT * 1000);

    // Wait for owner confirmation via event bus
    gameEventBus.once(`confirm:${gameId}:${confirmType}`, () => {
      clearTimeout(timer);
      console.log(`[ENGINE] Game ${gameId} - Owner confirmed: ${confirmType}`);
      io.to(roomId).emit('game:confirm_resolved', {
        game_id: gameId,
        confirm_type: confirmType,
        auto: false,
      });
      resolve();
    });
  });
}

// ============================================================
// Main Game Loop
// ============================================================

/**
 * Start and run a complete game for the given room.
 * This function runs asynchronously and pushes all events via Socket.IO.
 */
export async function startGame(roomId: string, io: SocketIOServer, preGeneratedGameId?: string): Promise<string> {
  const db = getDB();

  console.log(`[ENGINE] Starting game for room ${roomId}`);

  try {
    // 1. Get room info and players
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    const roomConfig = JSON.parse(room.config || '{}');
    const ownerId: string = room.owner_id;

    const roomPlayers = db.prepare(`
      SELECT rp.*, u.username, u.nickname
      FROM room_players rp
      JOIN users u ON u.id = rp.user_id
      WHERE rp.room_id = ?
    `).all(roomId) as any[];

    if (roomPlayers.length < (roomConfig.min_players || 4)) {
      throw new Error('Not enough players');
    }

    // 2. Get agent configs for all players
    const agentConfigs: Map<string, AgentConfig> = new Map();
    for (const rp of roomPlayers) {
      const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(rp.agent_id) as any;
      if (agent) {
        agentConfigs.set(rp.agent_id, {
          id: agent.id,
          name: agent.name,
          avatar: agent.avatar,
          model: agent.model,
          system_prompt: agent.system_prompt,
          temperature: agent.temperature,
          top_p: agent.top_p,
          max_tokens: agent.max_tokens,
          strategy_template: agent.strategy_template,
          description: agent.description,
        });
      }
    }

    // 3. Select a random word pair
    let wordPairQuery = 'SELECT * FROM word_pairs';
    const queryParams: any[] = [];

    if (roomConfig.word_category) {
      wordPairQuery += ' WHERE category = ?';
      queryParams.push(roomConfig.word_category);
    }
    if (roomConfig.word_difficulty) {
      if (queryParams.length > 0) {
        wordPairQuery += ' AND difficulty = ?';
      } else {
        wordPairQuery += ' WHERE difficulty = ?';
      }
      queryParams.push(roomConfig.word_difficulty);
    }

    const wordPairs = db.prepare(wordPairQuery).all(...queryParams) as any[];
    if (wordPairs.length === 0) {
      const allPairs = db.prepare('SELECT * FROM word_pairs').all() as any[];
      if (allPairs.length === 0) {
        throw new Error('No word pairs available');
      }
      wordPairs.push(...allPairs);
    }

    const selectedPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    const wordPair = {
      civilian_word: selectedPair.civilian_word,
      spy_word: selectedPair.spy_word,
    };

    // 4. Assign roles
    const spyCount = roomConfig.spy_count || 1;
    const hasBlank = roomConfig.has_blank || false;
    const totalPlayers = roomPlayers.length;

    const shuffledPlayers = [...roomPlayers].sort(() => Math.random() - 0.5);

    const spyIndices = new Set<number>();
    while (spyIndices.size < Math.min(spyCount, Math.floor(totalPlayers / 3))) {
      spyIndices.add(Math.floor(Math.random() * totalPlayers));
    }

    let blankIndex = -1;
    if (hasBlank) {
      const nonSpyIndices = Array.from({ length: totalPlayers }, (_, i) => i)
        .filter(i => !spyIndices.has(i));
      if (nonSpyIndices.length > 0) {
        blankIndex = nonSpyIndices[Math.floor(Math.random() * nonSpyIndices.length)];
      }
    }

    // 5. Create game record
    const gameId = preGeneratedGameId || uuidv4();

    db.prepare(`
      INSERT INTO games (id, room_id, status, config, word_pair, started_at)
      VALUES (?, ?, 'PLAYING', ?, ?, datetime('now'))
    `).run(
      gameId,
      roomId,
      JSON.stringify(roomConfig),
      JSON.stringify(wordPair),
    );

    // 6. Create game_players records
    const gamePlayers: GamePlayer[] = [];

    const insertGamePlayer = db.prepare(`
      INSERT INTO game_players (id, game_id, user_id, agent_id, agent_config_snapshot, seat_index, role, word)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < shuffledPlayers.length; i++) {
      const rp = shuffledPlayers[i];
      const agentConfig = agentConfigs.get(rp.agent_id);

      let role: 'CIVILIAN' | 'SPY' | 'BLANK';
      let word: string | null;

      if (spyIndices.has(i)) {
        role = 'SPY';
        word = wordPair.spy_word;
      } else if (i === blankIndex) {
        role = 'BLANK';
        word = null;
      } else {
        role = 'CIVILIAN';
        word = wordPair.civilian_word;
      }

      const gpId = uuidv4();
      const seatIndex = i + 1;

      insertGamePlayer.run(
        gpId,
        gameId,
        rp.user_id,
        rp.agent_id,
        JSON.stringify(agentConfig || {}),
        seatIndex,
        role,
        word,
      );

      gamePlayers.push({
        id: gpId,
        game_id: gameId,
        user_id: rp.user_id,
        agent_id: rp.agent_id,
        agent_config_snapshot: agentConfig || {} as AgentConfig,
        seat_index: seatIndex,
        role,
        word,
        is_alive: true,
        eliminated_round: null,
        username: rp.username,
        nickname: rp.nickname,
      });
    }

    // 7. Emit game start event (includes owner_id so clients know who can confirm)
    io.to(roomId).emit('game:start', {
      game_id: gameId,
      owner_id: ownerId,
      players: gamePlayers.map(gp => ({
        game_player_id: gp.id,
        user_id: gp.user_id,
        agent_id: gp.agent_id,
        agent_name: gp.agent_config_snapshot.name,
        seat_index: gp.seat_index,
        nickname: gp.nickname,
      })),
      config: roomConfig,
    });

    // Wait for clients to navigate to GamePage and load
    await sleep(DELAY_GAME_START);

    // 8. Game loop
    const gameState: GameState = {
      game_id: gameId,
      room_id: roomId,
      owner_id: ownerId,
      round_number: 0,
      players: gamePlayers,
      alive_players: [...gamePlayers],
      rounds_history: [],
      config: roomConfig,
      word_pair: wordPair,
    };

    const maxRounds = roomConfig.max_rounds || 10;
    let gameResult: string | null = null;

    for (let round = 1; round <= maxRounds; round++) {
      gameState.round_number = round;
      gameState.alive_players = gameState.players.filter(p => p.is_alive);

      gameResult = checkWinCondition(gameState);
      if (gameResult) break;

      console.log(`[ENGINE] Game ${gameId} - Round ${round} starting with ${gameState.alive_players.length} alive players`);

      // Emit round start
      io.to(roomId).emit('game:round_start', {
        game_id: gameId,
        round_number: round,
        alive_players: gameState.alive_players.map(p => ({
          game_player_id: p.id,
          seat_index: p.seat_index,
          agent_name: p.agent_config_snapshot.name,
          nickname: p.nickname,
        })),
      });

      await sleep(DELAY_ROUND_START);

      // === Speech Phase ===
      const speeches: Speech[] = [];

      const speakOrder = [...gameState.alive_players];
      const startOffset = Math.floor(Math.random() * speakOrder.length);
      const rotatedOrder = [
        ...speakOrder.slice(startOffset),
        ...speakOrder.slice(0, startOffset),
      ];

      io.to(roomId).emit('game:speech_phase_start', {
        game_id: gameId,
        round_number: round,
        order: rotatedOrder.map(p => p.seat_index),
      });

      await sleep(DELAY_SPEECH_PHASE);

      for (const player of rotatedOrder) {
        const speechPrompt = buildSpeechPrompt(player, gameState, speeches);

        io.to(roomId).emit('game:player_speaking', {
          game_id: gameId,
          round_number: round,
          seat_index: player.seat_index,
          player_name: player.agent_config_snapshot.name || player.nickname,
        });

        let speechContent: string;
        try {
          const result = await callLLM({
            model: player.agent_config_snapshot.model || undefined,
            system_prompt: player.agent_config_snapshot.system_prompt || undefined,
            messages: speechPrompt,
            temperature: player.agent_config_snapshot.temperature,
            top_p: player.agent_config_snapshot.top_p,
            max_tokens: player.agent_config_snapshot.max_tokens,
          });
          speechContent = result.content;
        } catch (err) {
          console.error(`[ENGINE] LLM call failed for player ${player.seat_index}:`, err);
          speechContent = '我暂时想不到该说什么...';
        }

        const speech: Speech = {
          player_id: player.id,
          seat_index: player.seat_index,
          player_name: player.agent_config_snapshot.name || player.nickname,
          content: speechContent,
          timestamp: new Date().toISOString(),
        };
        speeches.push(speech);

        io.to(roomId).emit('game:speech', {
          game_id: gameId,
          round_number: round,
          speech,
        });

        // Pause between speeches for readability
        await sleep(DELAY_BETWEEN_SPEECHES);
      }

      // === Pre-Vote Confirmation ===
      // All speeches done — wait for owner to confirm before entering vote phase
      await sleep(DELAY_PRE_CONFIRM);
      await waitForOwnerConfirm(
        io, roomId, gameId, ownerId,
        'pre_vote',
        `第 ${round} 轮发言结束，确认进入投票阶段？`,
        round,
      );

      // === Vote Phase ===
      io.to(roomId).emit('game:vote_phase_start', {
        game_id: gameId,
        round_number: round,
      });

      await sleep(DELAY_VOTE_PHASE);

      const votes: Vote[] = [];

      const votePromises = gameState.alive_players.map(async (player) => {
        const votePrompt = buildVotePrompt(player, gameState, speeches);

        try {
          const result = await callLLM({
            model: player.agent_config_snapshot.model || undefined,
            system_prompt: player.agent_config_snapshot.system_prompt || undefined,
            messages: votePrompt,
            temperature: 0.3,
            top_p: player.agent_config_snapshot.top_p,
            max_tokens: 50,
          });

          const targetSeat = parseVoteResponse(result.content, gameState.alive_players, player.seat_index);
          const target = gameState.alive_players.find(p => p.seat_index === targetSeat);

          return {
            voter_id: player.id,
            voter_seat: player.seat_index,
            voter_name: player.agent_config_snapshot.name || player.nickname,
            target_seat: targetSeat,
            target_id: target?.id || '',
            target_name: target?.agent_config_snapshot.name || target?.nickname || '未知',
          } as Vote;
        } catch (err) {
          console.error(`[ENGINE] Vote failed for player ${player.seat_index}:`, err);
          const others = gameState.alive_players.filter(p => p.seat_index !== player.seat_index);
          const randomTarget = others[Math.floor(Math.random() * others.length)];
          return {
            voter_id: player.id,
            voter_seat: player.seat_index,
            voter_name: player.agent_config_snapshot.name || player.nickname,
            target_seat: randomTarget.seat_index,
            target_id: randomTarget.id,
            target_name: randomTarget.agent_config_snapshot.name || randomTarget.nickname,
          } as Vote;
        }
      });

      const voteResults = await Promise.all(votePromises);
      votes.push(...voteResults);

      // Emit all votes
      io.to(roomId).emit('game:votes', {
        game_id: gameId,
        round_number: round,
        votes: votes.map(v => ({
          voter_seat: v.voter_seat,
          voter_name: v.voter_name,
          target_seat: v.target_seat,
          target_name: v.target_name,
        })),
      });

      await sleep(DELAY_AFTER_VOTES);

      // === Tally votes and eliminate ===
      const voteCount: Map<number, number> = new Map();
      for (const vote of votes) {
        voteCount.set(vote.target_seat, (voteCount.get(vote.target_seat) || 0) + 1);
      }

      let maxVotes = 0;
      let eliminatedSeat = -1;
      let isTie = false;

      for (const [seat, count] of voteCount.entries()) {
        if (count > maxVotes) {
          maxVotes = count;
          eliminatedSeat = seat;
          isTie = false;
        } else if (count === maxVotes) {
          isTie = true;
        }
      }

      let eliminatedPlayer: GamePlayer | null = null;

      if (isTie) {
        const tiedSeats: number[] = [];
        for (const [seat, count] of voteCount.entries()) {
          if (count === maxVotes) tiedSeats.push(seat);
        }
        eliminatedSeat = tiedSeats[Math.floor(Math.random() * tiedSeats.length)];
      }

      if (eliminatedSeat > 0) {
        eliminatedPlayer = gameState.alive_players.find(p => p.seat_index === eliminatedSeat) || null;

        if (eliminatedPlayer) {
          eliminatedPlayer.is_alive = false;
          eliminatedPlayer.eliminated_round = round;

          db.prepare(
            'UPDATE game_players SET is_alive = 0, eliminated_round = ? WHERE id = ?'
          ).run(round, eliminatedPlayer.id);

          io.to(roomId).emit('game:elimination', {
            game_id: gameId,
            round_number: round,
            eliminated: {
              game_player_id: eliminatedPlayer.id,
              seat_index: eliminatedPlayer.seat_index,
              player_name: eliminatedPlayer.agent_config_snapshot.name || eliminatedPlayer.nickname,
              role: eliminatedPlayer.role,
              word: eliminatedPlayer.word,
              votes_received: maxVotes,
            },
            vote_summary: Array.from(voteCount.entries()).map(([seat, count]) => ({
              seat_index: seat,
              votes: count,
            })),
          });

          await sleep(DELAY_AFTER_ELIMINATION);
        }
      }

      // Save round data to database
      const roundId = uuidv4();
      db.prepare(`
        INSERT INTO game_rounds (id, game_id, round_number, speeches, votes, eliminated_player_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        roundId,
        gameId,
        round,
        JSON.stringify(speeches),
        JSON.stringify(votes),
        eliminatedPlayer?.id || null,
      );

      gameState.rounds_history.push({
        round_number: round,
        speeches,
        votes,
        eliminated_player_id: eliminatedPlayer?.id || null,
      });

      // Update alive players
      gameState.alive_players = gameState.players.filter(p => p.is_alive);

      // Check win condition after elimination
      gameResult = checkWinCondition(gameState);
      if (gameResult) break;

      // === Post-Vote Confirmation ===
      // Game continues — wait for owner to confirm before next round
      await waitForOwnerConfirm(
        io, roomId, gameId, ownerId,
        'post_vote',
        `第 ${round} 轮结束，确认开始下一轮？`,
        round,
      );

      await sleep(DELAY_BETWEEN_ROUNDS);
    }

    // If max rounds reached and no winner, civilians win
    if (!gameResult) {
      gameResult = 'CIVILIAN_WIN';
    }

    // 9. Finalize game
    db.prepare(`
      UPDATE games SET status = 'FINISHED', result = ?, ended_at = datetime('now') WHERE id = ?
    `).run(gameResult, gameId);

    db.prepare("UPDATE rooms SET status = 'WAITING', updated_at = datetime('now') WHERE id = ?")
      .run(roomId);

    db.prepare('UPDATE room_players SET is_ready = 0 WHERE room_id = ?').run(roomId);

    // Emit game end
    io.to(roomId).emit('game:end', {
      game_id: gameId,
      result: gameResult,
      word_pair: wordPair,
      players: gameState.players.map(p => ({
        game_player_id: p.id,
        seat_index: p.seat_index,
        player_name: p.agent_config_snapshot.name || p.nickname,
        role: p.role,
        word: p.word,
        is_alive: p.is_alive,
        eliminated_round: p.eliminated_round,
      })),
    });

    console.log(`[ENGINE] Game ${gameId} finished with result: ${gameResult}`);

    return gameId;
  } catch (err) {
    console.error(`[ENGINE] Fatal error in game for room ${roomId}:`, err);

    try {
      db.prepare("UPDATE rooms SET status = 'WAITING', updated_at = datetime('now') WHERE id = ?")
        .run(roomId);

      io.to(roomId).emit('game:error', {
        message: 'Game encountered an error and was terminated.',
        error: (err as Error).message,
      });
    } catch (cleanupErr) {
      console.error('[ENGINE] Cleanup also failed:', cleanupErr);
    }
  }
    return "";
}

// ============================================================
// Prompt Builders
// ============================================================

export function buildSpeechPrompt(
  player: GamePlayer,
  gameState: GameState,
  currentSpeeches: Speech[],
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  let systemContext = `你正在参加一个"谁是卧底"游戏。`;

  if (player.role === 'CIVILIAN') {
    systemContext += `\n你的身份是【平民】，你拿到的词语是"${player.word}"。`;
    systemContext += `\n你的目标是描述自己的词语，同时找出拿到不同词语的卧底。`;
    systemContext += `\n注意：不要直接说出你的词语，用间接的方式描述。`;
  } else if (player.role === 'SPY') {
    systemContext += `\n你的身份是【卧底】，你拿到的词语是"${player.word}"。`;
    systemContext += `\n你的词语和平民的词语很相似但不同。你的目标是伪装成平民，不被发现。`;
    systemContext += `\n注意：仔细听别人的描述，尽量让自己的描述也符合平民词语的特征。不要直接说出你的词语。`;
  } else {
    systemContext += `\n你的身份是【白板】，你没有拿到任何词语。`;
    systemContext += `\n你需要根据其他玩家的描述来猜测词语是什么，然后假装自己知道词语。`;
    systemContext += `\n你的目标是活到最后。`;
  }

  if (player.agent_config_snapshot.strategy_template) {
    systemContext += `\n\n你的策略指导：${player.agent_config_snapshot.strategy_template}`;
  }

  messages.push({ role: 'system', content: systemContext });

  let gameContext = `当前是第 ${gameState.round_number} 轮。`;
  gameContext += `\n场上存活的玩家有：`;

  for (const ap of gameState.alive_players) {
    const name = ap.agent_config_snapshot.name || ap.nickname;
    gameContext += `\n  - ${ap.seat_index}号: ${name}`;
  }

  if (gameState.rounds_history.length > 0) {
    gameContext += `\n\n【历史回顾】`;
    for (const rh of gameState.rounds_history) {
      gameContext += `\n第 ${rh.round_number} 轮：`;
      for (const s of rh.speeches) {
        gameContext += `\n  ${s.seat_index}号(${s.player_name}): "${s.content}"`;
      }
      if (rh.eliminated_player_id) {
        const eliminated = gameState.players.find(p => p.id === rh.eliminated_player_id);
        if (eliminated) {
          gameContext += `\n  → ${eliminated.seat_index}号(${eliminated.agent_config_snapshot.name || eliminated.nickname})被淘汰`;
        }
      }
    }
  }

  if (currentSpeeches.length > 0) {
    gameContext += `\n\n【本轮已有的发言】`;
    for (const s of currentSpeeches) {
      gameContext += `\n  ${s.seat_index}号(${s.player_name}): "${s.content}"`;
    }
  }

  messages.push({ role: 'user', content: gameContext });

  messages.push({
    role: 'user',
    content: `你是 ${player.seat_index}号玩家。现在轮到你发言了。请用一两句话描述你的词语（不要直接说出词语本身），尽量自然。只需要说你的发言内容，不要加任何前缀。`,
  });

  return messages;
}

export function buildVotePrompt(
  player: GamePlayer,
  gameState: GameState,
  currentSpeeches: Speech[],
): LLMMessage[] {
  const messages: LLMMessage[] = [];

  let systemContext = `你正在参加"谁是卧底"游戏的投票环节。`;

  if (player.role === 'CIVILIAN') {
    systemContext += `\n你是平民，你的词语是"${player.word}"。你要投票淘汰你认为是卧底的玩家。`;
  } else if (player.role === 'SPY') {
    systemContext += `\n你是卧底，你的词语是"${player.word}"。你要假装是平民，投票淘汰一个平民来保护自己。`;
  } else {
    systemContext += `\n你是白板，你没有词语。根据其他人的描述来判断谁最可疑，投出你的一票。`;
  }

  if (player.agent_config_snapshot.strategy_template) {
    systemContext += `\n\n你的策略指导：${player.agent_config_snapshot.strategy_template}`;
  }

  messages.push({ role: 'system', content: systemContext });

  let voteContext = `第 ${gameState.round_number} 轮所有发言如下：\n`;
  for (const s of currentSpeeches) {
    voteContext += `  ${s.seat_index}号(${s.player_name}): "${s.content}"\n`;
  }

  if (gameState.rounds_history.length > 0) {
    voteContext += `\n历史轮次中被淘汰的玩家：`;
    for (const rh of gameState.rounds_history) {
      if (rh.eliminated_player_id) {
        const eliminated = gameState.players.find(p => p.id === rh.eliminated_player_id);
        if (eliminated) {
          voteContext += `\n  第${rh.round_number}轮: ${eliminated.seat_index}号(${eliminated.agent_config_snapshot.name || eliminated.nickname})`;
        }
      }
    }
  }

  voteContext += `\n\n你可以投票的玩家（不能投自己 ${player.seat_index}号）：`;
  const candidates = gameState.alive_players.filter(p => p.seat_index !== player.seat_index);
  for (const c of candidates) {
    voteContext += `\n  ${c.seat_index}号: ${c.agent_config_snapshot.name || c.nickname}`;
  }

  messages.push({ role: 'user', content: voteContext });

  messages.push({
    role: 'user',
    content: `你是 ${player.seat_index}号玩家。请从以上候选人中选择一个你认为最可疑的玩家进行投票淘汰。请直接回答"我投X号"，其中X是你要投票的玩家编号。`,
  });

  return messages;
}

// ============================================================
// Vote Parser
// ============================================================

export function parseVoteResponse(
  response: string,
  alivePlayers: GamePlayer[],
  selfSeatIndex: number,
): number {
  const patterns = [
    /投(\d+)号/,
    /选择?(\d+)号/,
    /淘汰(\d+)号/,
    /(\d+)号/,
    /投票给?\s*(\d+)/,
  ];

  for (const pattern of patterns) {
    const match = response.match(pattern);
    if (match) {
      const targetSeat = parseInt(match[1], 10);
      const isValid = alivePlayers.some(
        p => p.seat_index === targetSeat && p.seat_index !== selfSeatIndex
      );
      if (isValid) {
        return targetSeat;
      }
    }
  }

  const candidates = alivePlayers.filter(p => p.seat_index !== selfSeatIndex);
  if (candidates.length === 0) {
    return selfSeatIndex;
  }
  return candidates[Math.floor(Math.random() * candidates.length)].seat_index;
}

// ============================================================
// Win Condition Check
// ============================================================

function checkWinCondition(gameState: GameState): string | null {
  const alive = gameState.alive_players;
  const aliveSpies = alive.filter(p => p.role === 'SPY');
  const aliveCivilians = alive.filter(p => p.role === 'CIVILIAN');
  const aliveBlanks = alive.filter(p => p.role === 'BLANK');

  if (aliveSpies.length === 0) {
    return 'CIVILIAN_WIN';
  }

  if (aliveSpies.length >= aliveCivilians.length + aliveBlanks.length) {
    return 'SPY_WIN';
  }

  if (alive.length <= 2 && aliveSpies.length > 0) {
    return 'SPY_WIN';
  }

  return null;
}

// ============================================================
// Utilities
// ============================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
