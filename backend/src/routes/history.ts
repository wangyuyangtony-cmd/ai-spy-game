import { Router, Response } from 'express';
import { getDB } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All history routes require authentication
router.use(authMiddleware);

// ============================================================
// GET / - Get user's game history (paginated, with win/loss filter)
// ============================================================
router.get('/', (req: AuthRequest, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const db = getDB();

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;
    const resultFilter = req.query.result as string; // 'WIN' | 'LOSE' | undefined

    // Build the query
    let whereClause = 'WHERE gp.user_id = ? AND g.status = ?';
    const params: any[] = [userId, 'FINISHED'];

    if (resultFilter === 'WIN') {
      whereClause += " AND g.result LIKE '%' || gp.role || '%'";
    } else if (resultFilter === 'LOSE') {
      whereClause += " AND g.result NOT LIKE '%' || gp.role || '%'";
    }

    // Count total
    const countResult = db.prepare(`
      SELECT COUNT(*) AS total
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      ${whereClause}
    `).get(...params) as any;

    const total = countResult.total;

    // Fetch games
    const games = db.prepare(`
      SELECT
        g.id AS game_id,
        g.room_id,
        g.status AS game_status,
        g.config AS game_config,
        g.word_pair,
        g.result,
        g.started_at,
        g.ended_at,
        gp.role,
        gp.word,
        gp.is_alive,
        gp.eliminated_round,
        gp.seat_index,
        gp.agent_id,
        a.name AS agent_name,
        r.room_name
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      JOIN agents a ON a.id = gp.agent_id
      JOIN rooms r ON r.id = g.room_id
      ${whereClause}
      ORDER BY g.started_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    const parsedGames = games.map((g: any) => {
      const wordPair = JSON.parse(g.word_pair || '{}');
      const gameConfig = JSON.parse(g.game_config || '{}');

      // Determine if user won
      let isWin = false;
      if (g.result) {
        // result is like "CIVILIAN_WIN" or "SPY_WIN" or "BLANK_WIN"
        if (g.role === 'CIVILIAN' && g.result === 'CIVILIAN_WIN') isWin = true;
        if (g.role === 'SPY' && g.result === 'SPY_WIN') isWin = true;
        if (g.role === 'BLANK' && g.result === 'BLANK_WIN') isWin = true;
      }

      return {
        game_id: g.game_id,
        room_id: g.room_id,
        room_name: g.room_name,
        game_status: g.game_status,
        result: g.result,
        is_win: isWin,
        role: g.role,
        word: g.word,
        word_pair: wordPair,
        is_alive: !!g.is_alive,
        eliminated_round: g.eliminated_round,
        seat_index: g.seat_index,
        agent_id: g.agent_id,
        agent_name: g.agent_name,
        started_at: g.started_at,
        ended_at: g.ended_at,
      };
    });

    res.json({
      games: parsedGames,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });
  } catch (err: any) {
    console.error('[HISTORY] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /stats - Get user statistics
// ============================================================
router.get('/stats', (req: AuthRequest, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const db = getDB();

    // Total games
    const totalGames = db.prepare(`
      SELECT COUNT(*) AS count
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = ? AND g.status = 'FINISHED'
    `).get(userId) as any;

    // Wins by role
    const civilianStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN g.result = 'CIVILIAN_WIN' THEN 1 ELSE 0 END) AS wins
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = ? AND g.status = 'FINISHED' AND gp.role = 'CIVILIAN'
    `).get(userId) as any;

    const spyStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN g.result = 'SPY_WIN' THEN 1 ELSE 0 END) AS wins
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = ? AND g.status = 'FINISHED' AND gp.role = 'SPY'
    `).get(userId) as any;

    const blankStats = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN g.result = 'BLANK_WIN' THEN 1 ELSE 0 END) AS wins
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = ? AND g.status = 'FINISHED' AND gp.role = 'BLANK'
    `).get(userId) as any;

    // Total wins
    const totalWins = (civilianStats.wins || 0) + (spyStats.wins || 0) + (blankStats.wins || 0);
    const total = totalGames.count || 0;
    const winRate = total > 0 ? (totalWins / total * 100).toFixed(1) : '0.0';

    // Best agent (most wins)
    const bestAgent = db.prepare(`
      SELECT
        a.id AS agent_id,
        a.name AS agent_name,
        COUNT(*) AS games_played,
        SUM(
          CASE
            WHEN (gp.role = 'CIVILIAN' AND g.result = 'CIVILIAN_WIN')
              OR (gp.role = 'SPY' AND g.result = 'SPY_WIN')
              OR (gp.role = 'BLANK' AND g.result = 'BLANK_WIN')
            THEN 1
            ELSE 0
          END
        ) AS wins
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      JOIN agents a ON a.id = gp.agent_id
      WHERE gp.user_id = ? AND g.status = 'FINISHED'
      GROUP BY a.id
      ORDER BY wins DESC, games_played ASC
      LIMIT 1
    `).get(userId) as any;

    // Survival rate (how often user's agent survives to the end)
    const survivalResult = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN gp.is_alive = 1 THEN 1 ELSE 0 END) AS survived
      FROM game_players gp
      JOIN games g ON g.id = gp.game_id
      WHERE gp.user_id = ? AND g.status = 'FINISHED'
    `).get(userId) as any;

    const survivalRate = survivalResult.total > 0
      ? (survivalResult.survived / survivalResult.total * 100).toFixed(1)
      : '0.0';

    res.json({
      stats: {
        total_games: total,
        total_wins: totalWins,
        win_rate: parseFloat(winRate),
        survival_rate: parseFloat(survivalRate),
        civilian: {
          total: civilianStats.total || 0,
          wins: civilianStats.wins || 0,
          win_rate: civilianStats.total > 0
            ? parseFloat(((civilianStats.wins || 0) / civilianStats.total * 100).toFixed(1))
            : 0,
        },
        spy: {
          total: spyStats.total || 0,
          wins: spyStats.wins || 0,
          win_rate: spyStats.total > 0
            ? parseFloat(((spyStats.wins || 0) / spyStats.total * 100).toFixed(1))
            : 0,
        },
        blank: {
          total: blankStats.total || 0,
          wins: blankStats.wins || 0,
          win_rate: blankStats.total > 0
            ? parseFloat(((blankStats.wins || 0) / blankStats.total * 100).toFixed(1))
            : 0,
        },
        best_agent: bestAgent
          ? {
              agent_id: bestAgent.agent_id,
              agent_name: bestAgent.agent_name,
              games_played: bestAgent.games_played,
              wins: bestAgent.wins,
              win_rate: bestAgent.games_played > 0
                ? parseFloat((bestAgent.wins / bestAgent.games_played * 100).toFixed(1))
                : 0,
            }
          : null,
      },
    });
  } catch (err: any) {
    console.error('[HISTORY] Stats error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
