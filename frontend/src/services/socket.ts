import { io, Socket } from 'socket.io-client';
import type { ServerToClientEvents, ClientToServerEvents } from '../types';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

let socket: TypedSocket | null = null;

// Track rooms to re-join on reconnect
const joinedRooms = new Set<string>();

export function getSocket(): TypedSocket {
  if (!socket) {
    const token = localStorage.getItem('token');
    const url = import.meta.env.VITE_API_URL || '/';
    socket = io(url, {
      path: '/socket.io',
      autoConnect: false,
      auth: {
        token,
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 20,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    }) as TypedSocket;

    // Re-join all room channels on reconnect
    socket.on('connect', () => {
      console.log('[Socket] Connected, id:', socket?.id);
      if (joinedRooms.size > 0) {
        console.log('[Socket] Re-joining rooms on reconnect:', [...joinedRooms]);
        for (const roomId of joinedRooms) {
          socket?.emit('room:join', { room_id: roomId });
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.log('[Socket] Disconnected, reason:', reason);
    });
  }
  return socket;
}

/** Track a room so it's auto-rejoined on reconnect */
export function trackRoom(roomId: string): void {
  joinedRooms.add(roomId);
}

/** Stop tracking a room */
export function untrackRoom(roomId: string): void {
  joinedRooms.delete(roomId);
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
  joinedRooms.clear();
}

export function resetSocket(): void {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  joinedRooms.clear();
}

export default {
  getSocket,
  connectSocket,
  disconnectSocket,
  resetSocket,
  trackRoom,
  untrackRoom,
};
