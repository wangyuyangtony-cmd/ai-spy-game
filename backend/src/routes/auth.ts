import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db';
import { config } from '../config';
import { authMiddleware, generateToken, AuthRequest } from '../middleware/auth';

const router = Router();

// ============================================================
// POST /register - Register a new user
// ============================================================
router.post('/register', (req: AuthRequest, res: Response): void => {
  try {
    const { username, password, nickname } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    if (username.length < 3 || username.length > 30) {
      res.status(400).json({ error: 'Username must be between 3 and 30 characters' });
      return;
    }

    if (password.length < 6) {
      res.status(400).json({ error: 'Password must be at least 6 characters' });
      return;
    }

    const db = getDB();

    // Check uniqueness
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) {
      res.status(409).json({ error: 'Username already exists' });
      return;
    }

    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, config.BCRYPT_SALT_ROUNDS);
    const userNickname = nickname || username;

    db.prepare(
      'INSERT INTO users (id, username, password_hash, nickname) VALUES (?, ?, ?, ?)'
    ).run(id, username, passwordHash, userNickname);

    const token = generateToken(id);

    res.status(201).json({
      token,
      user: {
        id,
        username,
        nickname: userNickname,
        avatar_url: null,
      },
    });
  } catch (err: any) {
    console.error('[AUTH] Register error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /login - Login with username and password
// ============================================================
router.post('/login', (req: AuthRequest, res: Response): void => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }

    const db = getDB();

    const user = db.prepare(
      'SELECT id, username, password_hash, nickname, avatar_url FROM users WHERE username = ?'
    ).get(username) as any;

    if (!user) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const isValid = bcrypt.compareSync(password, user.password_hash);
    if (!isValid) {
      res.status(401).json({ error: 'Invalid username or password' });
      return;
    }

    const token = generateToken(user.id);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar_url: user.avatar_url,
      },
    });
  } catch (err: any) {
    console.error('[AUTH] Login error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /me - Get current user info (requires auth)
// ============================================================
router.get('/me', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const user = db.prepare(
      'SELECT id, username, nickname, avatar_url, created_at, updated_at FROM users WHERE id = ?'
    ).get(req.user!.userId) as any;

    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    res.json({ user });
  } catch (err: any) {
    console.error('[AUTH] Get me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PUT /me - Update nickname / avatar (requires auth)
// ============================================================
router.put('/me', authMiddleware, (req: AuthRequest, res: Response): void => {
  try {
    const { nickname, avatar_url } = req.body;
    const db = getDB();
    const userId = req.user!.userId;

    // Build dynamic update
    const updates: string[] = [];
    const values: any[] = [];

    if (nickname !== undefined) {
      updates.push('nickname = ?');
      values.push(nickname);
    }
    if (avatar_url !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatar_url);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(userId);

    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const user = db.prepare(
      'SELECT id, username, nickname, avatar_url, created_at, updated_at FROM users WHERE id = ?'
    ).get(userId) as any;

    res.json({ user });
  } catch (err: any) {
    console.error('[AUTH] Update me error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
