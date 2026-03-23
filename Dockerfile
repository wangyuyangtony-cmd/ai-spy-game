# ============================================================
# AI Spy Game — Multi-stage Docker Build
# ============================================================

# ---------- Stage 1: Build Frontend ----------
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY frontend/ ./
RUN npm run build

# ---------- Stage 2: Build Backend ----------
FROM node:20-alpine AS backend-build

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --ignore-scripts 2>/dev/null || npm install
COPY backend/ ./
RUN npm run build

# ---------- Stage 3: Production Runtime ----------
FROM node:20-alpine AS production

LABEL maintainer="AI Spy Game"
LABEL description="AI Who-is-the-Spy multiplayer game platform"

WORKDIR /app

# Install only production dependencies for backend
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --omit=dev --ignore-scripts 2>/dev/null || cd backend && npm install --omit=dev

# Copy compiled backend
COPY --from=backend-build /app/backend/dist ./backend/dist

# Copy built frontend into the expected location
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Create data directory for SQLite
RUN mkdir -p /app/backend/data

# Environment defaults (override at runtime)
ENV PORT=3001
ENV NODE_ENV=production
ENV CORS_ORIGIN=*
ENV JWT_SECRET=change-me-in-production
ENV MOCK_MODE=true
ENV DB_PATH=./data/spy-game.db

WORKDIR /app/backend

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

CMD ["node", "dist/index.js"]
