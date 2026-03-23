import { Server as HTTPServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { gameEventBus } from '../game/events';

let io: SocketIOServer | null = null;

interface JwtPayload {
  userId: string;
  iat?: number;
  exp?: number;
}

interface AuthenticatedSocket extends Socket {
  userId?: string;
}

/**
 * Initialize Socket.IO server with JWT authentication.
 */
export function initSocketIO(httpServer: HTTPServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: {
      origin: config.CORS_ORIGIN,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    transports: ['websocket', 'polling'],
  });

  // Authentication middleware for socket connections
  io.use((socket: AuthenticatedSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;

    if (!token || typeof token !== 'string') {
      return next(new Error('Authentication token is required'));
    }

    try {
      const decoded = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
      if (!decoded.userId) {
        return next(new Error('Invalid token payload'));
      }
      socket.userId = decoded.userId;
      next();
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        return next(new Error('Token has expired'));
      }
      return next(new Error('Invalid authentication token'));
    }
  });

  // Connection handler
  io.on('connection', (socket: AuthenticatedSocket) => {
    console.log(`[WS] User ${socket.userId} connected (socket: ${socket.id})`);

    // -------- room:join --------
    socket.on('room:join', (data: { room_id: string }) => {
      if (!data.room_id) {
        socket.emit('error', { message: 'room_id is required' });
        return;
      }

      socket.join(data.room_id);
      console.log(`[WS] User ${socket.userId} joined room channel: ${data.room_id}`);

      // Notify others in the room
      socket.to(data.room_id).emit('room:user_joined', {
        user_id: socket.userId,
        socket_id: socket.id,
      });
    });

    // -------- room:leave --------
    socket.on('room:leave', (data: { room_id: string }) => {
      if (!data.room_id) {
        socket.emit('error', { message: 'room_id is required' });
        return;
      }

      socket.leave(data.room_id);
      console.log(`[WS] User ${socket.userId} left room channel: ${data.room_id}`);

      socket.to(data.room_id).emit('room:user_left', {
        user_id: socket.userId,
        socket_id: socket.id,
      });
    });

    // -------- room:chat --------
    socket.on('room:chat', (data: { room_id: string; message: string }) => {
      if (!data.room_id || !data.message) {
        socket.emit('error', { message: 'room_id and message are required' });
        return;
      }

      io!.to(data.room_id).emit('room:chat_message', {
        user_id: socket.userId,
        message: data.message,
        timestamp: new Date().toISOString(),
      });
    });

    // -------- game:owner_confirm --------
    // Relays the room owner's confirmation to the game engine via event bus
    socket.on('game:owner_confirm', (data: { game_id: string; confirm_type: string }) => {
      if (!data.game_id || !data.confirm_type) {
        socket.emit('error', { message: 'game_id and confirm_type are required' });
        return;
      }

      console.log(`[WS] Owner confirm from user ${socket.userId}: game=${data.game_id} type=${data.confirm_type}`);

      // Emit to the internal event bus — the engine's waitForOwnerConfirm listens for this
      gameEventBus.emit(`confirm:${data.game_id}:${data.confirm_type}`);
    });

    // -------- disconnect --------
    socket.on('disconnect', (reason: string) => {
      console.log(`[WS] User ${socket.userId} disconnected (reason: ${reason})`);
    });

    // -------- error handling --------
    socket.on('error', (err: Error) => {
      console.error(`[WS] Socket error for user ${socket.userId}:`, err.message);
    });
  });

  console.log('[WS] Socket.IO server initialized');
  return io;
}

/**
 * Get the Socket.IO server instance.
 * Must be called after initSocketIO().
 */
export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initSocketIO() first.');
  }
  return io;
}

export default { initSocketIO, getIO };
