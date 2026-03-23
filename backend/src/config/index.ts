import dotenv from 'dotenv';

dotenv.config();

export const config = {
  /** JWT secret for token signing */
  JWT_SECRET: process.env.JWT_SECRET || 'ai-spy-game-secret-key-change-in-production',

  /** Server port */
  PORT: parseInt(process.env.PORT || '3001', 10),

  /** CORS allowed origin */
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:3000',

  /** SQLite database file path */
  DB_PATH: process.env.DB_PATH || './data/spy-game.db',

  /** JWT token expiration */
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  /** Whether to use mock LLM mode (no real API key needed) */
  MOCK_MODE: process.env.MOCK_MODE !== 'false',

  /** OpenAI-compatible API base URL */
  LLM_API_BASE: process.env.LLM_API_BASE || 'https://api.openai.com/v1',

  /** OpenAI-compatible API key */
  LLM_API_KEY: process.env.LLM_API_KEY || '',

  /** Default LLM model */
  LLM_DEFAULT_MODEL: process.env.LLM_DEFAULT_MODEL || 'gpt-3.5-turbo',

  /** LLM call timeout in milliseconds */
  LLM_TIMEOUT: parseInt(process.env.LLM_TIMEOUT || '30000', 10),

  /** Bcrypt salt rounds */
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
};
