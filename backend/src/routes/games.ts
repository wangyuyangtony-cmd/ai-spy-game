import { Router, Response, Request } from 'express';
import { getDB } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// ============================================================
// GET /:id - Get game details
// ============================================================
router.get('/:id', (req: Request, res: Response): void => {
  try {
    const db = getDB();
    const gameId = req.params.id;

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as any;
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Get game players with user info
    const players = db.prepare(`
      SELECT
        gp.id AS game_player_id,
        gp.user_id,
        gp.agent_id,
        gp.seat_index,
        gp.role,
        gp.word,
        gp.is_alive,
        gp.eliminated_round,
        gp.agent_config_snapshot,
        u.username,
        u.nickname,
        u.avatar_url,
        a.name AS agent_name,
        a.avatar AS agent_avatar
      FROM game_players gp
      JOIN users u ON u.id = gp.user_id
      JOIN agents a ON a.id = gp.agent_id
      WHERE gp.game_id = ?
      ORDER BY gp.seat_index ASC
    `).all(gameId);

    // Parse JSON fields
    const parsedPlayers = players.map((p: any) => ({
      ...p,
      agent_config_snapshot: JSON.parse(p.agent_config_snapshot || '{}'),
    }));

    // Get current round info
    const latestRound = db.prepare(`
      SELECT * FROM game_rounds
      WHERE game_id = ?
      ORDER BY round_number DESC
      LIMIT 1
    `).get(gameId) as any;

    let currentRound = null;
    if (latestRound) {
      currentRound = {
        ...latestRound,
        speeches: JSON.parse(latestRound.speeches || '[]'),
        votes: JSON.parse(latestRound.votes || '[]'),
      };
    }

    // Get room owner_id for confirmation flow
    const room = db.prepare('SELECT owner_id FROM rooms WHERE id = ?').get(game.room_id) as any;

    res.json({
      game: {
        ...game,
        config: JSON.parse(game.config || '{}'),
        word_pair: JSON.parse(game.word_pair || '{}'),
        players: parsedPlayers,
        current_round: currentRound,
        owner_id: room?.owner_id || null,
      },
    });
  } catch (err: any) {
    console.error('[GAMES] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /:id/replay - Get full game replay data (all rounds)
// ============================================================
router.get('/:id/replay', (req: Request, res: Response): void => {
  try {
    const db = getDB();
    const gameId = req.params.id;

    const game = db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) as any;
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }

    // Get all players
    const players = db.prepare(`
      SELECT
        gp.id AS game_player_id,
        gp.user_id,
        gp.agent_id,
        gp.seat_index,
        gp.role,
        gp.word,
        gp.is_alive,
        gp.eliminated_round,
        gp.agent_config_snapshot,
        u.username,
        u.nickname,
        a.name AS agent_name,
        a.avatar AS agent_avatar
      FROM game_players gp
      JOIN users u ON u.id = gp.user_id
      JOIN agents a ON a.id = gp.agent_id
      WHERE gp.game_id = ?
      ORDER BY gp.seat_index ASC
    `).all(gameId);

    const parsedPlayers = players.map((p: any) => ({
      ...p,
      agent_config_snapshot: JSON.parse(p.agent_config_snapshot || '{}'),
    }));

    // Get all rounds in order
    const rounds = db.prepare(`
      SELECT * FROM game_rounds
      WHERE game_id = ?
      ORDER BY round_number ASC
    `).all(gameId);

    const parsedRounds = rounds.map((r: any) => ({
      ...r,
      speeches: JSON.parse(r.speeches || '[]'),
      votes: JSON.parse(r.votes || '[]'),
    }));

    res.json({
      replay: {
        game: {
          ...game,
          config: JSON.parse(game.config || '{}'),
          word_pair: JSON.parse(game.word_pair || '{}'),
        },
        players: parsedPlayers,
        rounds: parsedRounds,
      },
    });
  } catch (err: any) {
    console.error('[GAMES] Replay error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
