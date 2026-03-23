# AI 谁是卧底 — 部署指南

本项目是一个完整的多人 AI 谁是卧底游戏平台，前后端合并为单一服务部署，只需暴露一个端口。

---

## 项目架构

```
浏览器 ──▶ :3001 ──┬──▶ /api/*        → Express API
                    ├──▶ /socket.io/*  → Socket.IO (WebSocket)
                    └──▶ /*            → React SPA (静态文件)
```

- **后端**: Node.js + Express + Socket.IO + SQLite
- **前端**: React 18 + Vite (构建后为静态文件，由后端托管)
- **数据库**: SQLite (单文件，无需额外数据库服务)

---

## 方案一：Docker 部署（推荐）

最简单的方式，适用于任何支持 Docker 的云平台。

### 1. 准备环境变量

```bash
cp .env.example .env
# 编辑 .env，至少修改 JWT_SECRET
```

### 2. 构建并启动

```bash
# 使用 docker-compose（推荐）
docker-compose up -d --build

# 或直接使用 docker
docker build -t ai-spy-game .
docker run -d \
  --name ai-spy-game \
  -p 3001:3001 \
  -e JWT_SECRET=your-secret-key \
  -e CORS_ORIGIN=* \
  -e MOCK_MODE=true \
  -v ai-spy-data:/app/backend/data \
  ai-spy-game
```

### 3. 访问

浏览器打开 `http://你的服务器IP:3001`

---

## 方案二：直接部署到云服务器（VPS）

适用于阿里云 ECS、腾讯云 CVM、AWS EC2 等。

### 1. 服务器要求

| 项目 | 最低要求 |
|------|---------|
| 系统 | Ubuntu 20.04+ / CentOS 8+ |
| CPU  | 1 核 |
| 内存 | 1 GB |
| 硬盘 | 10 GB |
| Node.js | v18+ |

### 2. 安装 Node.js

```bash
# Ubuntu / Debian
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# CentOS / RHEL
curl -fsSL https://rpm.nodesource.com/setup_20.x | sudo bash -
sudo yum install -y nodejs
```

### 3. 上传并部署

```bash
# 上传项目到服务器后
cd ai-spy-game

# 安装依赖
cd backend && npm install --omit=dev && cd ..
cd frontend && npm install && cd ..

# 构建
cd frontend && npm run build && cd ..
cd backend && npm run build && cd ..

# 配置环境变量
cp .env.example backend/.env
# 编辑 backend/.env，修改 JWT_SECRET 等

# 启动
cd backend && node dist/index.js
```

### 4. 使用 PM2 保持后台运行

```bash
# 安装 PM2
npm install -g pm2

# 启动
cd backend
pm2 start dist/index.js --name ai-spy-game

# 设置开机自启
pm2 startup
pm2 save

# 常用命令
pm2 status          # 查看状态
pm2 logs ai-spy-game # 查看日志
pm2 restart ai-spy-game # 重启
```

### 5. 配置 Nginx 反向代理（可选，支持域名 + HTTPS）

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

> **注意**: WebSocket 需要 `Upgrade` 和 `Connection` 头部，以及较长的 `proxy_read_timeout`。

配置 HTTPS（使用 Let's Encrypt 免费证书）:

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 方案三：一键部署到 PaaS 平台

### Railway

1. 在项目根目录创建 `Procfile`:
   ```
   web: cd backend && node dist/index.js
   ```
2. 推送到 GitHub
3. 在 [railway.app](https://railway.app) 导入仓库
4. 设置环境变量 `JWT_SECRET`, `PORT=3001`
5. 自动部署

### Render

1. 在 [render.com](https://render.com) 创建 Web Service
2. Build Command: `cd frontend && npm install && npm run build && cd ../backend && npm install && npm run build`
3. Start Command: `cd backend && node dist/index.js`
4. 设置环境变量

### Fly.io

```bash
# 安装 flyctl
curl -L https://fly.io/install.sh | sh

# 初始化（在项目根目录）
fly launch

# 部署
fly deploy

# 创建持久化存储（SQLite 需要）
fly volumes create data --size 1
```

---

## 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | `3001` | 服务端口 |
| `CORS_ORIGIN` | `*` | 允许的跨域来源，生产环境建议设为具体域名 |
| `JWT_SECRET` | (需修改) | JWT 签名密钥，**必须修改** |
| `MOCK_MODE` | `true` | `true`=AI 使用模拟回复；`false`=调用真实 LLM API |
| `LLM_API_BASE` | `https://api.openai.com/v1` | LLM API 地址 |
| `LLM_API_KEY` | (空) | LLM API Key |
| `LLM_DEFAULT_MODEL` | `gpt-3.5-turbo` | 默认模型 |
| `DB_PATH` | `./data/spy-game.db` | SQLite 数据库路径 |

---

## 防火墙配置

确保服务器的安全组 / 防火墙放行了对应端口:

```bash
# Ubuntu UFW
sudo ufw allow 3001/tcp

# 如果使用 Nginx
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp

# 阿里云 / 腾讯云
# 在控制台 → 安全组 → 添加入站规则 → TCP 3001
```

---

## 使用真实 AI（关闭 Mock 模式）

默认情况下 `MOCK_MODE=true`，AI agent 会使用模拟回复。要让 AI 真正"思考":

```bash
# 在 .env 中设置
MOCK_MODE=false
LLM_API_BASE=https://api.openai.com/v1   # 或其他 OpenAI 兼容 API
LLM_API_KEY=sk-your-key-here
LLM_DEFAULT_MODEL=gpt-4o-mini             # 推荐，性价比最高
```

支持所有 OpenAI 兼容的 API 服务商（如 DeepSeek、智谱、月之暗面等）。
