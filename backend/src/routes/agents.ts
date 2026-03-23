import { Router, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getDB } from '../db';
import { authMiddleware, AuthRequest } from '../middleware/auth';

const router = Router();

// All agent routes require authentication
router.use(authMiddleware);

// ============================================================
// GET / - List all agents for the current user
// ============================================================
router.get('/', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const agents = db.prepare(
      'SELECT * FROM agents WHERE user_id = ? ORDER BY created_at DESC'
    ).all(req.user!.userId);

    res.json({ agents });
  } catch (err: any) {
    console.error('[AGENTS] List error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST / - Create a new agent
// ============================================================
router.post('/', (req: AuthRequest, res: Response): void => {
  try {
    const {
      name,
      avatar,
      model,
      system_prompt,
      temperature,
      top_p,
      max_tokens,
      strategy_template,
      description,
    } = req.body;

    if (!name) {
      res.status(400).json({ error: 'Agent name is required' });
      return;
    }

    const db = getDB();
    const id = uuidv4();
    const userId = req.user!.userId;

    db.prepare(`
      INSERT INTO agents (id, user_id, name, avatar, model, system_prompt, temperature, top_p, max_tokens, strategy_template, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      userId,
      name,
      avatar || null,
      model || null,
      system_prompt || null,
      temperature ?? 0.7,
      top_p ?? 0.9,
      max_tokens ?? 300,
      strategy_template || null,
      description || null,
    );

    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(id);
    res.status(201).json({ agent });
  } catch (err: any) {
    console.error('[AGENTS] Create error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// GET /:id - Get agent details (ownership check)
// ============================================================
router.get('/:id', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (agent.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'You do not own this agent' });
      return;
    }

    res.json({ agent });
  } catch (err: any) {
    console.error('[AGENTS] Get error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// PUT /:id - Update an agent (ownership check)
// ============================================================
router.put('/:id', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (agent.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'You do not own this agent' });
      return;
    }

    const {
      name,
      avatar,
      model,
      system_prompt,
      temperature,
      top_p,
      max_tokens,
      strategy_template,
      description,
    } = req.body;

    const updates: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { updates.push('name = ?'); values.push(name); }
    if (avatar !== undefined) { updates.push('avatar = ?'); values.push(avatar); }
    if (model !== undefined) { updates.push('model = ?'); values.push(model); }
    if (system_prompt !== undefined) { updates.push('system_prompt = ?'); values.push(system_prompt); }
    if (temperature !== undefined) { updates.push('temperature = ?'); values.push(temperature); }
    if (top_p !== undefined) { updates.push('top_p = ?'); values.push(top_p); }
    if (max_tokens !== undefined) { updates.push('max_tokens = ?'); values.push(max_tokens); }
    if (strategy_template !== undefined) { updates.push('strategy_template = ?'); values.push(strategy_template); }
    if (description !== undefined) { updates.push('description = ?'); values.push(description); }

    if (updates.length === 0) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    updates.push("updated_at = datetime('now')");
    values.push(req.params.id);

    db.prepare(`UPDATE agents SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    const updated = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
    res.json({ agent: updated });
  } catch (err: any) {
    console.error('[AGENTS] Update error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// DELETE /:id - Delete an agent (ownership check)
// ============================================================
router.delete('/:id', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (agent.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'You do not own this agent' });
      return;
    }

    // Check if agent is currently in any active room
    const inRoom = db.prepare(`
      SELECT rp.id FROM room_players rp
      JOIN rooms r ON r.id = rp.room_id
      WHERE rp.agent_id = ? AND r.status IN ('WAITING', 'PLAYING')
    `).get(req.params.id);

    if (inRoom) {
      res.status(400).json({ error: 'Cannot delete agent that is currently in an active room' });
      return;
    }

    db.prepare('DELETE FROM agents WHERE id = ?').run(req.params.id);
    res.json({ message: 'Agent deleted successfully' });
  } catch (err: any) {
    console.error('[AGENTS] Delete error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============================================================
// POST /:id/duplicate - Duplicate an agent (ownership check)
// ============================================================
router.post('/:id/duplicate', (req: AuthRequest, res: Response): void => {
  try {
    const db = getDB();
    const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id) as any;

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    if (agent.user_id !== req.user!.userId) {
      res.status(403).json({ error: 'You do not own this agent' });
      return;
    }

    const newId = uuidv4();
    const newName = `${agent.name} (Copy)`;

    db.prepare(`
      INSERT INTO agents (id, user_id, name, avatar, model, system_prompt, temperature, top_p, max_tokens, strategy_template, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      newId,
      req.user!.userId,
      newName,
      agent.avatar,
      agent.model,
      agent.system_prompt,
      agent.temperature,
      agent.top_p,
      agent.max_tokens,
      agent.strategy_template,
      agent.description,
    );

    const newAgent = db.prepare('SELECT * FROM agents WHERE id = ?').get(newId);
    res.status(201).json({ agent: newAgent });
  } catch (err: any) {
    console.error('[AGENTS] Duplicate error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
