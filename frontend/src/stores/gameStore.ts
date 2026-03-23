import { create } from 'zustand';
import { gameApi } from '../services/api';
import { getSocket, connectSocket } from '../services/socket';
import type {
  Game,
  GamePhase,
  Speech,
  Vote,
  WinnerSide,
  PlayerRole,
} from '../types';

// ==================== Types ====================

export interface EliminationInfo {
  gamePlayerId: string;
  seatIndex: number;
  playerName: string;
  role: PlayerRole;
  word: string | null;
  votesReceived: number;
}

export interface VoteSummaryItem {
  seatIndex: number;
  votes: number;
}

export interface ConfirmNeeded {
  confirmType: 'pre_vote' | 'post_vote';
  message: string;
  roundNumber: number;
  timeout: number;
  receivedAt: number; // Date.now() when received, for countdown
}

interface GameStoreState {
  // Core game data
  game: Game | null;
  isLoading: boolean;

  // Real-time state
  currentRound: number;
  phase: GamePhase | null;
  currentSpeakerIndex: number | null;
  currentSpeakerName: string | null;
  winner: WinnerSide;

  // Owner confirmation
  ownerId: string | null;
  confirmNeeded: ConfirmNeeded | null;

  // Per-round accumulated data
  roundSpeeches: Record<number, Speech[]>;
  roundVotes: Record<number, Vote[]>;
  roundEliminations: Record<number, EliminationInfo>;
  roundVoteSummaries: Record<number, VoteSummaryItem[]>;

  // Track which rounds have entered voting phase (for feed rendering)
  roundVotingStarted: Record<number, boolean>;

  // Actions
  fetchGame: (id: string) => Promise<void>;
  restoreFromReplay: (id: string) => Promise<void>;
  reset: () => void;
  joinRoom: (roomId: string) => void;
  listenGameEvents: (gameId: string) => () => void;
  sendConfirmation: (gameId: string, confirmType: string) => void;
}

const initialState = {
  game: null as Game | null,
  isLoading: false,
  currentRound: 0,
  phase: null as GamePhase | null,
  currentSpeakerIndex: null as number | null,
  currentSpeakerName: null as string | null,
  winner: null as WinnerSide,
  ownerId: null as string | null,
  confirmNeeded: null as ConfirmNeeded | null,
  roundSpeeches: {} as Record<number, Speech[]>,
  roundVotes: {} as Record<number, Vote[]>,
  roundEliminations: {} as Record<number, EliminationInfo>,
  roundVoteSummaries: {} as Record<number, VoteSummaryItem[]>,
  roundVotingStarted: {} as Record<number, boolean>,
};

export const useGameStore = create<GameStoreState>((set, get) => ({
  ...initialState,

  fetchGame: async (id) => {
    set({ isLoading: true });
    try {
      const res = await gameApi.get(id);
      const game = res.game;
      set({
        game,
        ownerId: game?.ownerId || get().ownerId || null,
        phase: game?.status === 'FINISHED' ? 'finished' : null,
        winner: (game?.result as WinnerSide) || null,
        isLoading: false,
      });
    } catch (err) {
      set({ isLoading: false });
      throw err;
    }
  },

  restoreFromReplay: async (id: string) => {
    try {
      const res = await gameApi.getReplay(id);
      const replay = res.replay;
      if (!replay || !replay.rounds || replay.rounds.length === 0) return;

      const roundSpeeches: Record<number, Speech[]> = {};
      const roundVotes: Record<number, Vote[]> = {};
      const roundEliminations: Record<number, EliminationInfo> = {};
      const roundVoteSummaries: Record<number, VoteSummaryItem[]> = {};
      const roundVotingStarted: Record<number, boolean> = {};

      let maxRound = 0;

      for (const round of replay.rounds) {
        const rn = round.roundNumber;
        if (rn > maxRound) maxRound = rn;

        // Map speeches (replay stores raw snake_case from engine)
        roundSpeeches[rn] = (round.speeches || []).map((s: any) => ({
          playerId: s.player_id,
          seatIndex: s.seat_index,
          playerName: s.player_name,
          content: s.content,
          timestamp: s.timestamp,
          round: rn,
        }));

        // Map votes
        roundVotes[rn] = (round.votes || []).map((v: any) => ({
          voterSeat: v.voter_seat,
          voterName: v.voter_name,
          targetSeat: v.target_seat,
          targetName: v.target_name,
        }));

        // Mark voting as started if votes exist
        if (roundVotes[rn].length > 0) {
          roundVotingStarted[rn] = true;
        }

        // Reconstruct elimination info from player data
        if (round.eliminatedPlayerId) {
          const elimPlayer = replay.players?.find(
            (p: any) => (p.gamePlayerId || p.game_player_id) === round.eliminatedPlayerId
          );
          if (elimPlayer) {
            // Count votes for this player
            const votesReceived = roundVotes[rn].filter(
              (v) => v.targetSeat === (elimPlayer.seatIndex ?? elimPlayer.seat_index)
            ).length;

            roundEliminations[rn] = {
              gamePlayerId: round.eliminatedPlayerId,
              seatIndex: elimPlayer.seatIndex ?? elimPlayer.seat_index,
              playerName: elimPlayer.agentName || elimPlayer.agent_name || elimPlayer.nickname || '',
              role: elimPlayer.role,
              word: elimPlayer.word ?? null,
              votesReceived,
            };

            // Build vote summary from votes
            const tally: Record<number, number> = {};
            for (const v of roundVotes[rn]) {
              tally[v.targetSeat] = (tally[v.targetSeat] || 0) + 1;
            }
            roundVoteSummaries[rn] = Object.entries(tally).map(([seat, votes]) => ({
              seatIndex: parseInt(seat),
              votes,
            }));
          }
        }
      }

      // Determine phase based on game status
      const game = get().game;
      let phase: GamePhase | null = get().phase;
      if (game?.status === 'FINISHED') {
        phase = 'finished';
      } else if (maxRound > 0) {
        // Game is in progress — set to speaking as default; real-time events will update
        phase = 'speaking';
      }

      console.log('[GameStore] Restored replay: rounds=', maxRound, 'speeches=',
        Object.values(roundSpeeches).flat().length);

      // MERGE with existing store data — don't overwrite live events
      const currentState = get();
      const mergedSpeeches = { ...roundSpeeches };
      const mergedVotes = { ...roundVotes };
      const mergedEliminations = { ...roundEliminations };
      const mergedVoteSummaries = { ...roundVoteSummaries };
      const mergedVotingStarted = { ...roundVotingStarted };

      // For each round already in store, keep the store version if it has more/equal data
      for (const [roundStr, speeches] of Object.entries(currentState.roundSpeeches)) {
        const rn = parseInt(roundStr);
        if (speeches.length >= (mergedSpeeches[rn]?.length || 0)) {
          mergedSpeeches[rn] = speeches;
        }
      }
      for (const [roundStr, votes] of Object.entries(currentState.roundVotes)) {
        const rn = parseInt(roundStr);
        if (votes.length >= (mergedVotes[rn]?.length || 0)) {
          mergedVotes[rn] = votes;
        }
      }
      for (const [roundStr, elim] of Object.entries(currentState.roundEliminations)) {
        mergedEliminations[parseInt(roundStr)] = elim;
      }
      for (const [roundStr, summary] of Object.entries(currentState.roundVoteSummaries)) {
        mergedVoteSummaries[parseInt(roundStr)] = summary;
      }
      for (const [roundStr, started] of Object.entries(currentState.roundVotingStarted)) {
        if (started) mergedVotingStarted[parseInt(roundStr)] = true;
      }

      // Use the higher round number between current state and replay
      const effectiveRound = Math.max(maxRound, currentState.currentRound);

      set({
        currentRound: effectiveRound,
        phase,
        roundSpeeches: mergedSpeeches,
        roundVotes: mergedVotes,
        roundEliminations: mergedEliminations,
        roundVoteSummaries: mergedVoteSummaries,
        roundVotingStarted: mergedVotingStarted,
      });
    } catch (err) {
      console.error('[GameStore] Failed to restore from replay:', err);
    }
  },

  reset: () => set(initialState),

  joinRoom: (roomId: string) => {
    connectSocket();
    const socket = getSocket();
    socket.emit('room:join', { room_id: roomId });
    console.log('[GameStore] Joined room channel:', roomId);
  },

  sendConfirmation: (gameId: string, confirmType: string) => {
    const socket = getSocket();
    console.log(`[GameStore] Sending owner confirm: game=${gameId} type=${confirmType}`);
    socket.emit('game:owner_confirm', { game_id: gameId, confirm_type: confirmType });
  },

  listenGameEvents: (gameId: string) => {
    connectSocket();
    const socket = getSocket();

    console.log('[GameStore] Setting up listeners for game:', gameId);

    // -------- game:start --------
    const handleStart = (data: any) => {
      if (data.game_id !== gameId) return;
      console.log('[GameStore] game:start received, owner_id:', data.owner_id);
      set({ ownerId: data.owner_id || null });
      get().fetchGame(gameId).catch(console.error);
    };

    // -------- game:round_start --------
    const handleRoundStart = (data: any) => {
      if (data.game_id !== gameId) return;
      const round = data.round_number;
      console.log(`[GameStore] Round ${round} started`);
      set((prev) => ({
        currentRound: round,
        phase: 'speaking',
        currentSpeakerIndex: null,
        currentSpeakerName: null,
        confirmNeeded: null,
        // Initialize empty arrays for this round
        roundSpeeches: { ...prev.roundSpeeches, [round]: [] },
        roundVotes: { ...prev.roundVotes, [round]: [] },
      }));
    };

    // -------- game:speech_phase_start --------
    const handleSpeechPhaseStart = (data: any) => {
      if (data.game_id !== gameId) return;
      set({ phase: 'speaking', currentSpeakerIndex: null, currentSpeakerName: null });
    };

    // -------- game:player_speaking --------
    const handlePlayerSpeaking = (data: any) => {
      if (data.game_id !== gameId) return;
      console.log(`[GameStore] Player speaking: seat ${data.seat_index} (${data.player_name})`);
      set({
        currentSpeakerIndex: data.seat_index,
        currentSpeakerName: data.player_name,
      });
    };

    // -------- game:speech --------
    const handleSpeech = (data: any) => {
      if (data.game_id !== gameId) return;
      const round = data.round_number;
      const speech: Speech = {
        playerId: data.speech.player_id,
        seatIndex: data.speech.seat_index,
        playerName: data.speech.player_name,
        content: data.speech.content,
        timestamp: data.speech.timestamp,
        round: round,
      };
      console.log(`[GameStore] Speech received: R${round} seat ${speech.seatIndex}`);
      set((prev) => {
        const existing = prev.roundSpeeches[round] || [];
        return {
          roundSpeeches: { ...prev.roundSpeeches, [round]: [...existing, speech] },
          // Clear current speaker since they finished
          currentSpeakerIndex: null,
          currentSpeakerName: null,
        };
      });
    };

    // -------- game:vote_phase_start --------
    const handleVotePhaseStart = (data: any) => {
      if (data.game_id !== gameId) return;
      const round = data.round_number;
      console.log(`[GameStore] Vote phase started for round ${round}`);
      set((prev) => ({
        phase: 'voting',
        currentSpeakerIndex: null,
        currentSpeakerName: null,
        confirmNeeded: null,
        roundVotingStarted: { ...prev.roundVotingStarted, [round]: true },
      }));
    };

    // -------- game:votes --------
    const handleVotes = (data: any) => {
      if (data.game_id !== gameId) return;
      const round = data.round_number;
      const votes: Vote[] = (data.votes || []).map((v: any) => ({
        voterSeat: v.voter_seat,
        voterName: v.voter_name,
        targetSeat: v.target_seat,
        targetName: v.target_name,
      }));
      console.log(`[GameStore] Votes received: R${round}, ${votes.length} votes`);
      set((prev) => ({
        roundVotes: { ...prev.roundVotes, [round]: votes },
      }));
    };

    // -------- game:elimination --------
    const handleElimination = (data: any) => {
      if (data.game_id !== gameId) return;
      const round = data.round_number;
      const elim = data.eliminated;
      console.log(`[GameStore] Elimination: R${round}, seat ${elim.seat_index} (${elim.player_name})`);

      const eliminationInfo: EliminationInfo = {
        gamePlayerId: elim.game_player_id,
        seatIndex: elim.seat_index,
        playerName: elim.player_name,
        role: elim.role,
        word: elim.word,
        votesReceived: elim.votes_received,
      };

      const voteSummary: VoteSummaryItem[] = (data.vote_summary || []).map((vs: any) => ({
        seatIndex: vs.seat_index,
        votes: vs.votes,
      }));

      set((prev) => {
        // Update player's isAlive in game state
        const game = prev.game;
        let updatedGame = game;
        if (game) {
          const updatedPlayers = (game.players || []).map((p) =>
            p.gamePlayerId === elim.game_player_id ? { ...p, isAlive: false } : p
          );
          updatedGame = { ...game, players: updatedPlayers };
        }
        return {
          game: updatedGame,
          phase: 'result',
          roundEliminations: { ...prev.roundEliminations, [round]: eliminationInfo },
          roundVoteSummaries: { ...prev.roundVoteSummaries, [round]: voteSummary },
        };
      });
    };

    // -------- game:confirm_needed --------
    const handleConfirmNeeded = (data: any) => {
      if (data.game_id !== gameId) return;
      console.log(`[GameStore] Confirm needed: type=${data.confirm_type}, msg=${data.message}, owner=${data.owner_id}`);
      set({
        ownerId: data.owner_id || get().ownerId || null,
        confirmNeeded: {
          confirmType: data.confirm_type,
          message: data.message,
          roundNumber: data.round_number,
          timeout: data.timeout || 120,
          receivedAt: Date.now(),
        },
      });
    };

    // -------- game:confirm_resolved --------
    const handleConfirmResolved = (data: any) => {
      if (data.game_id !== gameId) return;
      console.log(`[GameStore] Confirm resolved: type=${data.confirm_type}, auto=${data.auto}`);
      set({ confirmNeeded: null });
    };

    // -------- game:end --------
    const handleEnd = (data: any) => {
      if (data.game_id !== gameId) return;
      const result = data.result as WinnerSide;
      console.log(`[GameStore] Game ended: ${result}`);

      set((prev) => {
        const game = prev.game;
        let updatedGame = game;
        if (game) {
          const updatedPlayers = (data.players || []).map((p: any) => ({
            gamePlayerId: p.game_player_id,
            userId: p.user_id || '',
            agentId: p.agent_id || '',
            seatIndex: p.seat_index,
            role: p.role,
            word: p.word ?? null,
            isAlive: !!p.is_alive,
            eliminatedRound: p.eliminated_round ?? null,
            agentConfigSnapshot: {},
            username: '',
            nickname: p.player_name || '',
            agentName: p.player_name || '',
            agentAvatar: null,
          }));
          updatedGame = {
            ...game,
            result: data.result,
            status: 'FINISHED' as const,
            players: updatedPlayers.length > 0 ? updatedPlayers : game.players,
            wordPair: data.word_pair
              ? { civilianWord: data.word_pair.civilian_word || '', spyWord: data.word_pair.spy_word || '' }
              : game.wordPair,
          };
        }
        return {
          game: updatedGame,
          winner: result,
          phase: 'finished' as const,
          confirmNeeded: null,
        };
      });
    };

    // -------- game:error --------
    const handleError = (data: any) => {
      console.error('[GameStore] Game error:', data.message, data.error);
    };

    socket.on('game:start', handleStart);
    socket.on('game:round_start', handleRoundStart);
    socket.on('game:speech_phase_start', handleSpeechPhaseStart);
    socket.on('game:player_speaking', handlePlayerSpeaking);
    socket.on('game:speech', handleSpeech);
    socket.on('game:vote_phase_start', handleVotePhaseStart);
    socket.on('game:votes', handleVotes);
    socket.on('game:elimination', handleElimination);
    socket.on('game:confirm_needed', handleConfirmNeeded);
    socket.on('game:confirm_resolved', handleConfirmResolved);
    socket.on('game:end', handleEnd);
    socket.on('game:error', handleError);

    return () => {
      socket.off('game:start', handleStart);
      socket.off('game:round_start', handleRoundStart);
      socket.off('game:speech_phase_start', handleSpeechPhaseStart);
      socket.off('game:player_speaking', handlePlayerSpeaking);
      socket.off('game:speech', handleSpeech);
      socket.off('game:vote_phase_start', handleVotePhaseStart);
      socket.off('game:votes', handleVotes);
      socket.off('game:elimination', handleElimination);
      socket.off('game:confirm_needed', handleConfirmNeeded);
      socket.off('game:confirm_resolved', handleConfirmResolved);
      socket.off('game:end', handleEnd);
      socket.off('game:error', handleError);
    };
  },
}));
