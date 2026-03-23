import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';
import { config } from '../config';

/**
 * Thin wrapper around sql.js that exposes a better-sqlite3-compatible
 * synchronous API so all route / engine code can remain unchanged.
 */
class DatabaseWrapper {
  private sqlDb: SqlJsDatabase;
  private dbPath: string;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(sqlDb: SqlJsDatabase, dbPath: string) {
    this.sqlDb = sqlDb;
    this.dbPath = dbPath;
  }

  /** Persist the in-memory database to disk (debounced). */
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      try {
        const data = this.sqlDb.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(this.dbPath, buffer);
      } catch (err) {
        console.error('[DB] Failed to persist database:', err);
      }
    }, 200);
  }

  /** Force an immediate save to disk. */
  saveNow(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const data = this.sqlDb.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /** Execute raw SQL (no result). Supports multiple statements. */
  exec(sql: string): void {
    this.sqlDb.run(sql);
    this.scheduleSave();
  }

  /**
   * Set a PRAGMA value. sql.js does not support the better-sqlite3
   * `.pragma()` helper, so we emulate it.
   */
  pragma(statement: string): unknown {
    try {
      const results = this.sqlDb.exec(`PRAGMA ${statement}`);
      if (results.length > 0 && results[0].values.length > 0) {
        return results[0].values[0][0];
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Return a Statement-like object that mirrors the better-sqlite3
   * `prepare()` / `.run()` / `.get()` / `.all()` contract.
   */
  prepare(sql: string): StatementWrapper {
    return new StatementWrapper(this.sqlDb, sql, () => this.scheduleSave());
  }

  /**
   * Wrap a function in a transaction. Returns a callable that executes
   * the function inside BEGIN / COMMIT (ROLLBACK on error).
   */
  transaction<T extends (...args: any[]) => any>(fn: T): T {
    const self = this;
    const wrapped = ((...args: any[]) => {
      self.sqlDb.run('BEGIN');
      try {
        const result = fn(...args);
        self.sqlDb.run('COMMIT');
        self.scheduleSave();
        return result;
      } catch (err) {
        self.sqlDb.run('ROLLBACK');
        throw err;
      }
    }) as unknown as T;
    return wrapped;
  }
}

class StatementWrapper {
  private sqlDb: SqlJsDatabase;
  private sql: string;
  private onWrite: () => void;

  constructor(sqlDb: SqlJsDatabase, sql: string, onWrite: () => void) {
    this.sqlDb = sqlDb;
    this.sql = sql;
    this.onWrite = onWrite;
  }

  /** Execute the statement (INSERT / UPDATE / DELETE). */
  run(...params: any[]): { changes: number; lastInsertRowid: number } {
    // Flatten if first arg is an array
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = this.sqlDb.prepare(this.sql);
    stmt.bind(flat.length > 0 ? flat : undefined);
    stmt.step();
    stmt.free();
    this.onWrite();
    // sql.js doesn't expose changes/lastInsertRowid easily; approximate:
    const changesResult = this.sqlDb.exec('SELECT changes()');
    const changes = changesResult.length > 0 ? (changesResult[0].values[0][0] as number) : 0;
    const rowidResult = this.sqlDb.exec('SELECT last_insert_rowid()');
    const lastInsertRowid = rowidResult.length > 0 ? (rowidResult[0].values[0][0] as number) : 0;
    return { changes, lastInsertRowid };
  }

  /** Return the first matching row as a plain object, or undefined. */
  get(...params: any[]): any {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const stmt = this.sqlDb.prepare(this.sql);
    stmt.bind(flat.length > 0 ? flat : undefined);
    let row: any = undefined;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row || undefined;
  }

  /** Return all matching rows as an array of plain objects. */
  all(...params: any[]): any[] {
    const flat = params.length === 1 && Array.isArray(params[0]) ? params[0] : params;
    const results: any[] = [];
    const stmt = this.sqlDb.prepare(this.sql);
    stmt.bind(flat.length > 0 ? flat : undefined);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  }
}

// ============================================================
// Module-level singleton
// ============================================================

let db: DatabaseWrapper | null = null;

export function getDB(): DatabaseWrapper {
  if (!db) {
    throw new Error('Database not initialized. Call initDB() first.');
  }
  return db;
}

/**
 * Initialize the database **synchronously** after the one-time async
 * sql.js WASM bootstrap.  Call this once at startup (awaited).
 */
export async function initDB(): Promise<DatabaseWrapper> {
  // Ensure the data directory exists
  const dbDir = path.dirname(config.DB_PATH);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();

  // Load existing database file if present
  let sqlDb: SqlJsDatabase;
  if (fs.existsSync(config.DB_PATH)) {
    const fileBuffer = fs.readFileSync(config.DB_PATH);
    sqlDb = new SQL.Database(fileBuffer);
  } else {
    sqlDb = new SQL.Database();
  }

  db = new DatabaseWrapper(sqlDb, config.DB_PATH);

  // Enable foreign keys
  db.pragma('foreign_keys = ON');

  createTables();
  seedWordPairs();

  // Force an immediate save so the file is on disk
  db.saveNow();

  console.log('[DB] Database initialized successfully at', config.DB_PATH);
  return db;
}

// ============================================================
// Schema & seed helpers
// ============================================================

function createTables(): void {
  const database = getDB();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      avatar_url TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS agents (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      avatar TEXT,
      model TEXT,
      system_prompt TEXT,
      temperature REAL DEFAULT 0.7,
      top_p REAL DEFAULT 0.9,
      max_tokens INTEGER DEFAULT 300,
      strategy_template TEXT,
      description TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      owner_id TEXT NOT NULL,
      room_name TEXT NOT NULL,
      status TEXT DEFAULT 'WAITING',
      config TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS room_players (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      is_ready INTEGER DEFAULT 0,
      joined_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS games (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      status TEXT DEFAULT 'PLAYING',
      config TEXT DEFAULT '{}',
      word_pair TEXT DEFAULT '{}',
      result TEXT,
      started_at TEXT DEFAULT (datetime('now')),
      ended_at TEXT,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_players (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      agent_id TEXT NOT NULL,
      agent_config_snapshot TEXT DEFAULT '{}',
      seat_index INTEGER NOT NULL,
      role TEXT NOT NULL,
      word TEXT,
      is_alive INTEGER DEFAULT 1,
      eliminated_round INTEGER,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_rounds (
      id TEXT PRIMARY KEY,
      game_id TEXT NOT NULL,
      round_number INTEGER NOT NULL,
      speeches TEXT DEFAULT '[]',
      votes TEXT DEFAULT '[]',
      eliminated_player_id TEXT,
      FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS word_pairs (
      id TEXT PRIMARY KEY,
      civilian_word TEXT NOT NULL,
      spy_word TEXT NOT NULL,
      category TEXT,
      difficulty TEXT DEFAULT 'MEDIUM'
    );
  `);

  // Create indexes
  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_agents_user_id ON agents(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status)',
    'CREATE INDEX IF NOT EXISTS idx_rooms_owner_id ON rooms(owner_id)',
    'CREATE INDEX IF NOT EXISTS idx_room_players_room_id ON room_players(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_room_players_user_id ON room_players(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_games_status ON games(status)',
    'CREATE INDEX IF NOT EXISTS idx_game_players_game_id ON game_players(game_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_players_user_id ON game_players(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_game_rounds_game_id ON game_rounds(game_id)',
  ];

  for (const idx of indexes) {
    database.exec(idx);
  }
}

function seedWordPairs(): void {
  const database = getDB();

  const count = database.prepare('SELECT COUNT(*) as count FROM word_pairs').get() as any;
  if (count && count.count > 0) {
    return;
  }

  const { v4: uuidv4 } = require('uuid');

  const pairs = [
    { civilian_word: '苹果', spy_word: '梨', category: '水果', difficulty: 'EASY' },
    { civilian_word: '猫', spy_word: '狗', category: '动物', difficulty: 'EASY' },
    { civilian_word: '篮球', spy_word: '足球', category: '运动', difficulty: 'EASY' },
    { civilian_word: '包子', spy_word: '饺子', category: '食物', difficulty: 'MEDIUM' },
    { civilian_word: '手机', spy_word: '平板', category: '电子产品', difficulty: 'MEDIUM' },
    { civilian_word: '口红', spy_word: '唇膏', category: '化妆品', difficulty: 'HARD' },
    { civilian_word: '出租车', spy_word: '网约车', category: '交通', difficulty: 'HARD' },
    { civilian_word: '火锅', spy_word: '麻辣烫', category: '美食', difficulty: 'MEDIUM' },
    { civilian_word: '微信', spy_word: 'QQ', category: '社交', difficulty: 'EASY' },
    { civilian_word: '钢琴', spy_word: '吉他', category: '乐器', difficulty: 'MEDIUM' },
    { civilian_word: '冰淇淋', spy_word: '雪糕', category: '甜品', difficulty: 'HARD' },
    { civilian_word: '沙发', spy_word: '椅子', category: '家具', difficulty: 'MEDIUM' },
    { civilian_word: '拖鞋', spy_word: '凉鞋', category: '鞋类', difficulty: 'HARD' },
    { civilian_word: '地铁', spy_word: '公交', category: '交通', difficulty: 'EASY' },
    { civilian_word: '咖啡', spy_word: '奶茶', category: '饮品', difficulty: 'MEDIUM' },
    { civilian_word: '西瓜', spy_word: '哈密瓜', category: '水果', difficulty: 'MEDIUM' },
    { civilian_word: '筷子', spy_word: '叉子', category: '餐具', difficulty: 'EASY' },
    { civilian_word: '雨伞', spy_word: '遮阳伞', category: '日用品', difficulty: 'HARD' },
  ];

  const insert = database.prepare(
    'INSERT INTO word_pairs (id, civilian_word, spy_word, category, difficulty) VALUES (?, ?, ?, ?, ?)'
  );

  for (const item of pairs) {
    insert.run(uuidv4(), item.civilian_word, item.spy_word, item.category, item.difficulty);
  }

  console.log(`[DB] Seeded ${pairs.length} word pairs.`);
}

export default { initDB, getDB };
