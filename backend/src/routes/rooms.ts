import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import { getIO } from '../websocket';

const router = Router();

// ============================================================
// GET / - List public rooms (WAITING status, with owner info and player count)
// ============================================================
router.get('/', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();

    const rooms = db.prepare(`
      SELECT
        r.id,
        r.room_name,
        r.status,
        r.config,
        r.created_at,
        r.updated_at,
        r.owner_id,
        u.username AS owner_username,
        u.nickname AS owner_nickname,
        u.avatar_url AS owner_avatar_url,
        (SELECT COUNT(*) FROM room_players WHERE room_id = r.id) AS player_count
      FROM rooms r
      JOIN users u ON u.id = r.owner_id
      WHERE r.status = 'WAITING'
      ORDER BY r.created_at DESC
    `).all();

    // Parse config JSON
    const parsed = rooms.map((r: any) => ({
      ...r,
      config: JSON.parse(r.config || '{}'),
    }));

    res.json({ rooms: parsed });
  } catch (err: any) {
    console.error('[ROOMS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST / - Create a new room (requires auth)
//   Accepts optional agent_id. When provided, the owner is
//   automatically inserted into room_players as the first player.
// ============================================================
router.post('/', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { room_name, config: roomConfig, agent_id } = req.body;

    if (!room_name) {
      res.status(400).json({ error: 'Room name is required' });
      return;
    }

    const db = getDB();
    const id = uuidv4();
    const userId = req.user!.userId;

    // Default room config
    const defaultConfig = {
      max_players: 6,
      min_players: 4,
      spy_count: 1,
      has_blank: false,
      speech_time_limit: 60,
      vote_time_limit: 30,
      max_rounds: 10,
      word_category: null,
      word_difficulty: null,
    };

    const mergedConfig = { ...defaultConfig, ...(roomConfig || {}) };

    // Create the room
    db.prepare(
      'INSERT INTO rooms (id, owner_id, room_name, config) VALUES (?, ?, ?, ?)'
    ).run(id, userId, room_name, JSON.stringify(mergedConfig));

    // If agent_id is provided, automatically add the owner as the first player
    let ownerRoomPlayerId: string | null = null;
    if (agent_id) {
      // Validate agent belongs to the user
      const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(agent_id, userId) as any;
      if (!agent) {
        // Room was already created; clean it up since the agent is invalid
        db.prepare('DELETE FROM rooms WHERE id = ?').run(id);
        res.status(400).json({ error: 'Agent not found or does not belong to you' });
        return;
      }

      ownerRoomPlayerId = uuidv4();
      db.prepare(
        'INSERT INTO room_players (id, room_id, user_id, agent_id) VALUES (?, ?, ?, ?)'
      ).run(ownerRoomPlayerId, id, userId, agent_id);
    }

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(id) as any;

    res.status(201).json({
      room: {
        ...room,
        config: JSON.parse(room.config),
      },
      owner_player_id: ownerRoomPlayerId,
    });
  } catch (err: any) {
    console.error('[ROOMS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});


// ============================================================
// GET /my-active - Get rooms/games where the current user is actively playing
// ============================================================
router.get('/my-active', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const userId = req.user!.userId;

    // Find PLAYING games where this user is a participant
    const activeGames = db.prepare(`
      SELECT
        g.id AS game_id,
        g.room_id,
        g.status AS game_status,
        g.started_at,
        r.room_name,
        r.owner_id,
        r.config,
        u.nickname AS owner_nickname,
        (SELECT COUNT(*) FROM game_players WHERE game_id = g.id) AS player_count
      FROM games g
      JOIN rooms r ON r.id = g.room_id
      JOIN users u ON u.id = r.owner_id
      WHERE g.status = 'PLAYING'
        AND EXISTS (
          SELECT 1 FROM game_players gp
          WHERE gp.game_id = g.id AND gp.user_id = ?
        )
      ORDER BY g.started_at DESC
    `).all(userId);

    const parsed = activeGames.map((g: any) => ({
      ...g,
      config: JSON.parse(g.config || '{}'),
    }));

    res.json({ active_games: parsed });
  } catch (err: any) {
    console.error('[ROOMS] My-active error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /:id - Get room details (with player list)
// ============================================================
router.get('/:id', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(req.params.id) as any;

    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    // Get player list with user and agent info
    const players = db.prepare(`
      SELECT
        rp.id AS room_player_id,
        rp.user_id,
        rp.agent_id,
        rp.is_ready,
        rp.joined_at,
        u.username,
        u.nickname,
        u.avatar_url,
        a.name AS agent_name,
        a.avatar AS agent_avatar,
        a.description AS agent_description
      FROM room_players rp
      JOIN users u ON u.id = rp.user_id
      JOIN agents a ON a.id = rp.agent_id
      WHERE rp.room_id = ?
      ORDER BY rp.joined_at ASC
    `).all(req.params.id);

    // Get owner info
    const owner = db.prepare(
      'SELECT id, username, nickname, avatar_url FROM users WHERE id = ?'
    ).get(room.owner_id);

    res.json({
      room: {
        ...room,
        config: JSON.parse(room.config || '{}'),
        owner,
        players,
        player_count: players.length,
      },
    });
  } catch (err: any) {
    console.error('[ROOMS] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/join - Join a room with an agent (requires auth)
//   A user can join multiple times with DIFFERENT agents.
//   The same agent cannot be added twice.
// ============================================================
router.post('/:id/join', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { agent_id } = req.body;
    const userId = req.user!.userId;
    const roomId = req.params.id;

    if (!agent_id) {
      res.status(400).json({ error: 'agent_id is required to join a room' });
      return;
    }

    const db = getDB();

    // Check room exists and is WAITING
    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }
    if (room.status !== 'WAITING') {
      res.status(400).json({ error: 'Room is not accepting new players' });
      return;
    }

    // Check agent belongs to user
    const agent = db.prepare('SELECT * FROM agents WHERE id = ? AND user_id = ?').get(agent_id, userId) as any;
    if (!agent) {
      res.status(400).json({ error: 'Agent not found or does not belong to you' });
      return;
    }

    // Check if the SAME AGENT is already in this room (prevent duplicates)
    const existingAgent = db.prepare(
      'SELECT id FROM room_players WHERE room_id = ? AND agent_id = ?'
    ).get(roomId, agent_id);
    if (existingAgent) {
      res.status(400).json({ error: 'This agent is already in the room' });
      return;
    }

    // Check room capacity
    const roomConfig = JSON.parse(room.config || '{}');
    const playerCount = db.prepare(
      'SELECT COUNT(*) AS count FROM room_players WHERE room_id = ?'
    ).get(roomId) as any;
    if (playerCount.count >= (roomConfig.max_players || 6)) {
      res.status(400).json({ error: 'Room is full' });
      return;
    }

    // Add player (one row per agent)
    const id = uuidv4();
    db.prepare(
      'INSERT INTO room_players (id, room_id, user_id, agent_id) VALUES (?, ?, ?, ?)'
    ).run(id, roomId, userId, agent_id);

    res.json({ message: 'Agent joined room successfully', room_player_id: id });

    // Notify all clients in the room about the update
    try { getIO().to(roomId).emit('room:updated', { room_id: roomId }); } catch(e) {}
  } catch (err: any) {
    console.error('[ROOMS] Join error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/leave - Leave a room (requires auth)
//   Optional body: { room_player_id } to remove a specific agent slot.
//   If omitted, removes ALL of the user's agents from the room.
// ============================================================
router.post('/:id/leave', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;
    const { room_player_id } = req.body || {};
    const db = getDB();

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.status !== 'WAITING') {
      res.status(400).json({ error: 'Cannot leave a room that is in progress' });
      return;
    }

    if (room_player_id) {
      // Remove a specific agent slot
      const player = db.prepare(
        'SELECT id, user_id FROM room_players WHERE id = ? AND room_id = ?'
      ).get(room_player_id, roomId) as any;
      if (!player) {
        res.status(400).json({ error: 'Player slot not found in this room' });
        return;
      }
      if (player.user_id !== userId) {
        res.status(403).json({ error: 'You can only remove your own agents' });
        return;
      }

      db.prepare('DELETE FROM room_players WHERE id = ?').run(room_player_id);

      // Check if user still has any agents left in the room
      const remaining = db.prepare(
        'SELECT COUNT(*) AS count FROM room_players WHERE room_id = ? AND user_id = ?'
      ).get(roomId, userId) as any;

      // If this was the owner's last agent and they have no more, handle ownership transfer
      if (remaining.count === 0 && room.owner_id === userId) {
        const nextPlayer = db.prepare(
          'SELECT user_id FROM room_players WHERE room_id = ? ORDER BY joined_at ASC LIMIT 1'
        ).get(roomId) as any;

        if (nextPlayer) {
          db.prepare("UPDATE rooms SET owner_id = ?, updated_at = datetime('now') WHERE id = ?")
            .run(nextPlayer.user_id, roomId);
        } else {
          db.prepare("UPDATE rooms SET status = 'CLOSED', updated_at = datetime('now') WHERE id = ?")
            .run(roomId);
        }
      }
    } else {
      // Remove ALL of this user's agents from the room
      const userPlayers = db.prepare(
        'SELECT id FROM room_players WHERE room_id = ? AND user_id = ?'
      ).all(roomId, userId);
      if (userPlayers.length === 0) {
        res.status(400).json({ error: 'You are not in this room' });
        return;
      }

      db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, userId);

      // If owner leaves, transfer or close
      if (room.owner_id === userId) {
        const nextPlayer = db.prepare(
          'SELECT user_id FROM room_players WHERE room_id = ? ORDER BY joined_at ASC LIMIT 1'
        ).get(roomId) as any;

        if (nextPlayer) {
          db.prepare("UPDATE rooms SET owner_id = ?, updated_at = datetime('now') WHERE id = ?")
            .run(nextPlayer.user_id, roomId);
        } else {
          db.prepare("UPDATE rooms SET status = 'CLOSED', updated_at = datetime('now') WHERE id = ?")
            .run(roomId);
        }
      }
    }

    res.json({ message: 'Left room successfully' });

    // Notify all clients in the room about the update
    try { getIO().to(roomId).emit('room:updated', { room_id: roomId }); } catch(e) {}
  } catch (err: any) {
    console.error('[ROOMS] Leave error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/ready - Toggle ready status (requires auth)
//   Optional body: { room_player_id } to toggle a specific agent slot.
//   If omitted, toggles ALL of the user's agents in the room.
// ============================================================
router.post('/:id/ready', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;
    const { room_player_id } = req.body || {};
    const db = getDB();

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.status !== 'WAITING') {
      res.status(400).json({ error: 'Room is not in waiting status' });
      return;
    }

    if (room_player_id) {
      // Toggle specific slot
      const player = db.prepare(
        'SELECT id, is_ready, user_id FROM room_players WHERE id = ? AND room_id = ?'
      ).get(room_player_id, roomId) as any;
      if (!player) {
        res.status(400).json({ error: 'Player slot not found' });
        return;
      }
      if (player.user_id !== userId) {
        res.status(403).json({ error: 'You can only toggle ready for your own agents' });
        return;
      }

      const newReady = player.is_ready ? 0 : 1;
      db.prepare('UPDATE room_players SET is_ready = ? WHERE id = ?').run(newReady, player.id);

      res.json({ is_ready: !!newReady, room_player_id: player.id });

      // Notify all clients in the room about the update
      try { getIO().to(roomId).emit('room:updated', { room_id: roomId }); } catch(e) {}
    } else {
      // Toggle ALL of user's agents in this room together
      const players = db.prepare(
        'SELECT id, is_ready FROM room_players WHERE room_id = ? AND user_id = ?'
      ).all(roomId, userId) as any[];

      if (players.length === 0) {
        res.status(400).json({ error: 'You are not in this room' });
        return;
      }

      // Determine new state: if ANY is not ready, set all to ready; otherwise unready all
      const anyNotReady = players.some((p: any) => !p.is_ready);
      const newReady = anyNotReady ? 1 : 0;

      for (const p of players) {
        db.prepare('UPDATE room_players SET is_ready = ? WHERE id = ?').run(newReady, p.id);
      }

      res.json({ is_ready: !!newReady });

      // Notify all clients in the room about the update
      try { getIO().to(roomId).emit('room:updated', { room_id: roomId }); } catch(e) {}
    }
  } catch (err: any) {
    console.error('[ROOMS] Ready error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/start - Start the game (requires auth, owner only, all must be ready)
// ============================================================
router.post('/:id/start', authMiddleware, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user!.userId;
    const roomId = req.params.id;
    const db = getDB();

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.owner_id !== userId) {
      res.status(403).json({ error: 'Only the room owner can start the game' });
      return;
    }

    if (room.status !== 'WAITING') {
      res.status(400).json({ error: 'Room is not in waiting status' });
      return;
    }

    // Check player count and readiness
    // Now each row in room_players is one "player slot" (one agent)
    const players = db.prepare(
      'SELECT * FROM room_players WHERE room_id = ?'
    ).all(roomId) as any[];

    const roomConfig = JSON.parse(room.config || '{}');
    const minPlayers = roomConfig.min_players || 4;

    if (players.length < minPlayers) {
      res.status(400).json({ error: `Need at least ${minPlayers} player slots to start` });
      return;
    }

    // Ensure the owner has at least one agent in the room
    const ownerInPlayers = players.some((p: any) => p.user_id === room.owner_id);
    if (!ownerInPlayers) {
      res.status(400).json({ error: 'Room owner must have at least one agent in the room' });
      return;
    }

    // All non-owner player slots must be ready; owner's slots are implicitly ready
    const allReady = players.every((p: any) => p.is_ready || p.user_id === room.owner_id);
    if (!allReady) {
      res.status(400).json({ error: 'Not all player slots are ready' });
      return;
    }

    // Update room status
    db.prepare("UPDATE rooms SET status = 'PLAYING', updated_at = datetime('now') WHERE id = ?")
      .run(roomId);

    // Generate game ID before starting engine so we can return it immediately
    const { v4: uuidv4 } = require('uuid');
    const gameId = uuidv4();

    // Respond immediately with game_id; game engine runs asynchronously
    res.json({ message: 'Game starting...', game_id: gameId });

    // Start game engine asynchronously (imported dynamically to avoid circular deps)
    const { startGame } = require('../game/engine');
    const { getIO } = require('../websocket');

    const io = getIO();
    startGame(roomId, io, gameId).catch((err: any) => {
      console.error('[ROOMS] Game engine error:', err);
    });
  } catch (err: any) {
    console.error('[ROOMS] Start error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/remove-agent/:roomPlayerId - Remove a specific agent slot
//   (requires auth, owner can remove anyone, users can remove their own)
// ============================================================
router.post('/:id/remove-agent/:roomPlayerId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const currentUserId = req.user!.userId;
    const roomId = req.params.id;
    const roomPlayerId = req.params.roomPlayerId;
    const db = getDB();

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.status !== 'WAITING') {
      res.status(400).json({ error: 'Cannot modify players while game is in progress' });
      return;
    }

    const player = db.prepare(
      'SELECT id, user_id FROM room_players WHERE id = ? AND room_id = ?'
    ).get(roomPlayerId, roomId) as any;
    if (!player) {
      res.status(400).json({ error: 'Player slot not found in this room' });
      return;
    }

    // Only the owner or the player's own user can remove
    if (player.user_id !== currentUserId && room.owner_id !== currentUserId) {
      res.status(403).json({ error: 'Only the room owner or the agent owner can remove agents' });
      return;
    }

    db.prepare('DELETE FROM room_players WHERE id = ?').run(roomPlayerId);

    // If we removed the last agent of the room owner, transfer ownership
    const ownerRemaining = db.prepare(
      'SELECT COUNT(*) AS count FROM room_players WHERE room_id = ? AND user_id = ?'
    ).get(roomId, player.user_id) as any;

    if (ownerRemaining.count === 0 && player.user_id === room.owner_id) {
      const nextPlayer = db.prepare(
        'SELECT user_id FROM room_players WHERE room_id = ? ORDER BY joined_at ASC LIMIT 1'
      ).get(roomId) as any;

      if (nextPlayer) {
        db.prepare("UPDATE rooms SET owner_id = ?, updated_at = datetime('now') WHERE id = ?")
          .run(nextPlayer.user_id, roomId);
      } else {
        db.prepare("UPDATE rooms SET status = 'CLOSED', updated_at = datetime('now') WHERE id = ?")
          .run(roomId);
      }
    }

    res.json({ message: 'Agent removed from room' });

    // Notify all clients in the room about the update
    try { getIO().to(roomId).emit('room:updated', { room_id: roomId }); } catch(e) {}
  } catch (err: any) {
    console.error('[ROOMS] Remove agent error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/kick/:userId - Kick ALL agents of a user (requires auth, owner only)
// ============================================================
router.post('/:id/kick/:userId', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const currentUserId = req.user!.userId;
    const roomId = req.params.id;
    const targetUserId = req.params.userId;
    const db = getDB();

    const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as any;
    if (!room) {
      res.status(404).json({ error: 'Room not found' });
      return;
    }

    if (room.owner_id !== currentUserId) {
      res.status(403).json({ error: 'Only the room owner can kick players' });
      return;
    }

    if (room.status !== 'WAITING') {
      res.status(400).json({ error: 'Cannot kick players while game is in progress' });
      return;
    }

    if (targetUserId === currentUserId) {
      res.status(400).json({ error: 'You cannot kick yourself' });
      return;
    }

    const players = db.prepare(
      'SELECT id FROM room_players WHERE room_id = ? AND user_id = ?'
    ).all(roomId, targetUserId);
    if (players.length === 0) {
      res.status(400).json({ error: 'Target user has no agents in this room' });
      return;
    }

    db.prepare('DELETE FROM room_players WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);

    res.json({ message: 'Player kicked successfully', removed_count: players.length });

    // Notify all clients in the room about the update
    try { getIO().to(roomId).emit('room:updated', { room_id: roomId }); } catch(e) {}
  } catch (err: any) {
    console.error('[ROOMS] Kick error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
