import dotenv from 'dotenv';

dotenv.config();

export const config = {
  JWT_SECRET: process.env.JWT_SECRET || 'ai-spy-game-secret-key-change-in-production',
  PORT: parseInt(process.env.PORT || '3001', 10),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  DB_PATH: process.env.DB_PATH || './data/spy-game.db',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  /** Whether to use mock LLM mode (no real API key needed) */
  MOCK_MODE: process.env.MOCK_MODE !== 'false',
  
  /** OpenAI-compatible API base URL — default to SiliconFlow */
  LLM_API_BASE: process.env.LLM_API_BASE || 'https://api.siliconflow.cn/v1',
  
  /** API key */
  LLM_API_KEY: process.env.LLM_API_KEY || '',
  
  /** Default LLM model — use SiliconFlow free model */
  LLM_DEFAULT_MODEL: process.env.LLM_DEFAULT_MODEL || 'Qwen/Qwen2.5-7B-Instruct',
  
  /** LLM call timeout in milliseconds */
  LLM_TIMEOUT: parseInt(process.env.LLM_TIMEOUT || '60000', 10),
  
  BCRYPT_SALT_ROUNDS: parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10),
};
