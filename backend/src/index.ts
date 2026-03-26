import express from 'express';
import cors from 'cors';
import http from 'http';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import { initDB } from './db';
import { initSocketIO } from './websocket';

// Import route modules
import authRoutes from './routes/auth';
import agentRoutes from './routes/agents';
import roomRoutes from './routes/rooms';
import gameRoutes from './routes/games';
import historyRoutes from './routes/history';

// ============================================================
// Bootstrap (async because sql.js WASM init is async)
// ============================================================

async function main(): Promise<void> {
  // ---- Initialize Database (must happen before routes handle requests) ----
  try {
    await initDB();
    console.log('[SERVER] Database initialized');
  } catch (err) {
    console.error('[SERVER] Failed to initialize database:', err);
    process.exit(1);
  }

  // ---- Initialize Express App ----
  const app = express();

  // Middleware
  app.use(cors({
    origin: config.CORS_ORIGIN,
    credentials: true,
  }));

  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // Health Check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      mock_mode: config.MOCK_MODE,
    });
  });

  // Register Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/agents', agentRoutes);
  app.use('/api/rooms', roomRoutes);
  app.use('/api/games', gameRoutes);
  app.use('/api/history', historyRoutes);

  // ============================================================
  // LLM Configuration endpoints
  // ============================================================
  app.get('/api/llm/config', (_req, res) => {
    res.json({
      mock_mode: config.MOCK_MODE,
      api_base: config.LLM_API_BASE,
      default_model: config.LLM_DEFAULT_MODEL,
      has_api_key: !!config.LLM_API_KEY,
      available_free_models: [
        { id: 'Qwen/Qwen2.5-7B-Instruct', name: 'Qwen2.5 7B (免费)', provider: 'SiliconFlow' },
        { id: 'THUDM/GLM-4-9B-0414', name: 'GLM-4 9B (免费)', provider: 'SiliconFlow' },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-7B', name: 'DeepSeek R1 7B (免费)', provider: 'SiliconFlow' },
        { id: 'deepseek-ai/DeepSeek-R1-Distill-Qwen-14B', name: 'DeepSeek R1 14B (免费)', provider: 'SiliconFlow' },
        { id: 'internlm/internlm2_5-7b-chat', name: 'InternLM2.5 7B (免费)', provider: 'SiliconFlow' },
        { id: 'Qwen/Qwen2.5-Coder-32B-Instruct', name: 'Qwen2.5 Coder 32B', provider: 'SiliconFlow' },
        { id: 'Qwen/Qwen2.5-32B-Instruct', name: 'Qwen2.5 32B', provider: 'SiliconFlow' },
        { id: 'deepseek-ai/DeepSeek-V2.5', name: 'DeepSeek V2.5', provider: 'SiliconFlow' },
      ],
    });
  });

  // ---- Serve Frontend Static Files (production) ----
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    console.log(`[SERVER] Serving frontend from ${frontendDist}`);
    app.use(express.static(frontendDist));

    // SPA fallback — all non-API routes return index.html
    app.get('*', (_req, res) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  } else {
    console.log('[SERVER] Frontend dist not found, API-only mode');
    // 404 Handler (API-only mode)
    app.use((_req, res) => {
      res.status(404).json({ error: 'Not found' });
    });
  }

  // Global Error Handler
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('[SERVER] Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  // ---- Create HTTP Server and Socket.IO ----
  const httpServer = http.createServer(app);
  initSocketIO(httpServer);

  // ---- Start Server ----
  httpServer.listen(config.PORT, () => {
    console.log(`[SERVER] AI Spy Game backend running on port ${config.PORT}`);
    console.log(`[SERVER] CORS origin: ${config.CORS_ORIGIN}`);
    console.log(`[SERVER] Mock mode: ${config.MOCK_MODE ? 'ENABLED' : 'DISABLED'}`);
    console.log(`[SERVER] API: http://localhost:${config.PORT}/api`);
  });
}

main().catch((err) => {
  console.error('[SERVER] Fatal startup error:', err);
  process.exit(1);
});
