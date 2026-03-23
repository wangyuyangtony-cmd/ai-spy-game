# 🎭 AI 谁是卧底 — 多人互动对战平台

一款多人在线 AI 对战平台。玩家各自配置并训练自己的 AI Agent，让 AI 代替玩家进行"谁是卧底"游戏中的发言、推理与投票。游戏过程中玩家仅可观战，最终由 AI 的策略水平决定胜负。

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + TypeScript + Vite + Tailwind CSS |
| 状态管理 | Zustand |
| 实时通信 | Socket.IO |
| 后端 | Node.js + Express + TypeScript |
| 数据库 | SQLite (sql.js) |
| 认证 | JWT (jsonwebtoken + bcryptjs) |
| LLM | Mock 模式内置 / 支持 OpenAI 兼容接口 |

## 📁 项目结构

```
ai-spy-game/
├── backend/                # 后端服务
│   ├── src/
│   │   ├── config/         # 配置
│   │   ├── db/             # 数据库初始化 & 8 张表
│   │   ├── middleware/      # JWT 认证中间件
│   │   ├── routes/          # REST API 路由
│   │   │   ├── auth.ts      # 注册/登录/个人信息
│   │   │   ├── agents.ts    # Agent CRUD + 复制
│   │   │   ├── rooms.ts     # 房间管理 + 开始游戏
│   │   │   ├── games.ts     # 游戏详情 + 回放
│   │   │   └── history.ts   # 历史记录 + 统计
│   │   ├── game/
│   │   │   ├── engine.ts    # 游戏引擎核心
│   │   │   └── llm-adapter.ts # LLM 调用适配器
│   │   ├── websocket/       # Socket.IO 服务
│   │   └── index.ts         # 主入口
│   ├── package.json
│   └── tsconfig.json
├── frontend/               # 前端应用
│   ├── src/
│   │   ├── components/      # 9 个通用组件
│   │   ├── pages/           # 9 个页面
│   │   ├── stores/          # Zustand 状态管理
│   │   ├── services/        # API + WebSocket 服务
│   │   ├── types/           # TypeScript 类型定义
│   │   └── hooks/           # 自定义 Hooks
│   ├── package.json
│   ├── vite.config.ts
│   └── tailwind.config.js
└── README.md
```

## 🚀 快速启动

### 环境要求
- Node.js >= 18
- npm >= 8

### 1. 安装依赖

```bash
# 后端
cd backend && npm install

# 前端
cd ../frontend && npm install
```

### 2. 启动后端

```bash
cd backend
npm run dev
# 服务启动在 http://localhost:3001
```

### 3. 启动前端

```bash
cd frontend
npm run dev
# 应用运行在 http://localhost:3000
```

### 4. 访问应用

打开浏览器访问 `http://localhost:3000`

## 🎮 游戏流程

1. **注册/登录** → 创建账号进入平台
2. **创建 Agent** → 配置 AI 的模型、System Prompt、策略模板和参数
3. **创建/加入房间** → 携带 Agent 进入对战房间
4. **准备就绪** → 所有玩家准备后房主开始游戏
5. **观战** → AI 自动进行发言和投票，玩家实时观看
6. **查看结果** → 游戏结束后查看角色揭示和回放

## 🤖 AI Agent 配置

| 配置项 | 说明 |
|--------|------|
| 模型 | gpt-4o / gpt-4o-mini / deepseek-v3 / claude-3.5-sonnet 等 |
| System Prompt | 自定义 AI 行为策略 |
| 策略模板 | 保守型 / 激进型 / 分析型 / 伪装型 / 自定义 |
| Temperature | 0~2，控制随机性 |
| Top-p | 0~1，核采样参数 |
| Max Tokens | 50~500，单次发言最大长度 |

## 🔧 LLM 配置

默认使用 **Mock 模式**（无需 API Key 即可完整运行游戏）。

如需使用真实 LLM：
1. 在 `backend/.env` 中设置 `MOCK_LLM=false`
2. 设置 `OPENAI_API_KEY=your-key`
3. 可选设置 `OPENAI_BASE_URL` 以使用其他 OpenAI 兼容接口

## 📊 API 概览

- **认证**: POST /api/auth/register, /login, GET /me
- **Agent**: GET/POST/PUT/DELETE /api/agents
- **房间**: GET/POST /api/rooms, /join, /leave, /ready, /start
- **游戏**: GET /api/games/:id, /replay
- **历史**: GET /api/history, /stats
- **WebSocket**: 12 种实时事件（game:start, speech:stream, vote:result 等）
