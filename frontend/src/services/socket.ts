import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

export function getSocket(): TypedSocket {
  if (!socket) {
    const token = localStorage.getItem('token');
    // In production, connect to same origin; in dev, Vite proxy handles it
    const url = import.meta.env.VITE_API_URL || '/';
    socket = io(url, {
      path: '/socket.io',
      autoConnect: false,
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    }) as TypedSocket;
  }
  return socket;
}

export function connectSocket(): void {
  const s = getSocket();
  const token = localStorage.getItem('token');
  if (token) {
    s.auth = { token };
  }
  if (!s.connected) {
    s.connect();
  }
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function resetSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}

export default {
  getSocket,
  connectSocket,
  disconnectSocket,
  resetSocket,
};
