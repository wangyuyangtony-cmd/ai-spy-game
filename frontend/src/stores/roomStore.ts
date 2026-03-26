import { create } from 'zustand';
import { roomApi } from '../services/api';
import { getSocket, connectSocket, trackRoom, untrackRoom } from '../services/socket';
import type { Room, RoomConfig } from '../types';

interface RoomState {
  rooms: Room[];
  currentRoom: Room | null;
  isLoading: boolean;
  error: string | null;

  // Set when game:start is received — non-owner players use this to navigate
  startedGameId: string | null;

  fetchRooms: (search?: string) => Promise<void>;
  createRoom: (name: string, config: RoomConfig, agentId?: string) => Promise<Room>;
  joinRoom: (id: string, agentId: string) => Promise<void>;
  addAgent: (id: string, agentId: string) => Promise<void>;
  removeAgent: (id: string, roomPlayerId: string) => Promise<void>;
  leaveRoom: (id: string) => Promise<void>;
  toggleReady: (id: string) => Promise<void>;
  startGame: (id: string) => Promise<string>;
  fetchRoom: (id: string) => Promise<void>;
  setCurrentRoom: (room: Room | null) => void;
  clearError: () => void;
  clearStartedGame: () => void;
  listenRoomEvents: (roomId: string) => () => void;
}

export const useRoomStore = create<RoomState>((set, get) => ({
  rooms: [],
  currentRoom: null,
  isLoading: false,
  error: null,
  startedGameId: null,

  fetchRooms: async (search) => {
    try {
      const res = await roomApi.list({ search, status: 'WAITING' });
      set({ rooms: res.rooms || [] });
    } catch (err: any) {
      console.error('Failed to fetch rooms:', err);
    }
  },

  createRoom: async (name, config, agentId) => {
    set({ isLoading: true, error: null });
    try {
      const backendConfig: any = {
        max_players: config.maxPlayers,
        min_players: config.minPlayers,
        spy_count: config.spyCount,
        has_blank: config.hasBlank,
        max_rounds: config.maxRounds,
      };

      const res = await roomApi.create({
        room_name: name,
        config: backendConfig,
        agent_id: agentId,
      });
      set({ isLoading: false });
      return res.room;
    } catch (err: any) {
      const message = err.message || '创建房间失败';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  joinRoom: async (id, agentId) => {
    set({ isLoading: true, error: null });
    try {
      await roomApi.join(id, { agent_id: agentId });
      const roomRes = await roomApi.get(id);
      set({ currentRoom: roomRes.room, isLoading: false });
      // Ensure socket is connected and join the room channel
      connectSocket();
      const socket = getSocket();
      socket.emit('room:join', { room_id: id });
    } catch (err: any) {
      const message = err.message || '加入房间失败';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  addAgent: async (id, agentId) => {
    set({ isLoading: true, error: null });
    try {
      await roomApi.join(id, { agent_id: agentId });
      const roomRes = await roomApi.get(id);
      set({ currentRoom: roomRes.room, isLoading: false });
    } catch (err: any) {
      const message = err.message || '添加 Agent 失败';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  removeAgent: async (id, roomPlayerId) => {
    set({ isLoading: true, error: null });
    try {
      await roomApi.removeAgent(id, roomPlayerId);
      const roomRes = await roomApi.get(id);
      set({ currentRoom: roomRes.room, isLoading: false });
    } catch (err: any) {
      const message = err.message || '移除 Agent 失败';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  leaveRoom: async (id) => {
    try {
      await roomApi.leave(id);
      const socket = getSocket();
      socket.emit('room:leave', { room_id: id });
      untrackRoom(id);
      set({ currentRoom: null });
    } catch (err: any) {
      console.error('Failed to leave room:', err);
    }
  },

  toggleReady: async (id) => {
    try {
      await roomApi.ready(id);
      const roomRes = await roomApi.get(id);
      set({ currentRoom: roomRes.room });
    } catch (err: any) {
      const message = err.message || '操作失败';
      throw new Error(message);
    }
  },

  startGame: async (id) => {
    try {
      const res = await roomApi.start(id);
      const gameId = res.gameId;
      // Fallback: if socket game:start event hasn't set startedGameId after 1.5s, set it directly
      // This ensures the owner always navigates even if the socket event is missed
      setTimeout(() => {
        if (!get().startedGameId && gameId) {
          console.log('[RoomStore] Fallback: setting startedGameId from API response');
          set({ startedGameId: gameId });
        }
      }, 1500);
      return gameId;
    } catch (err: any) {
      const message = err.message || '开始游戏失败';
      throw new Error(message);
    }
  },

  fetchRoom: async (id) => {
    set({ isLoading: true });
    try {
      const res = await roomApi.get(id);
      set({ currentRoom: res.room, isLoading: false });
    } catch (err: any) {
      set({ isLoading: false });
      throw new Error('获取房间信息失败');
    }
  },

  setCurrentRoom: (room) => set({ currentRoom: room }),

  clearError: () => set({ error: null }),

  clearStartedGame: () => set({ startedGameId: null }),

  listenRoomEvents: (roomId) => {
    // Ensure socket is connected and in the room channel
    connectSocket();
    const socket = getSocket();
    socket.emit('room:join', { room_id: roomId });
    trackRoom(roomId);

    const handleUserJoined = (_data: { user_id: string; socket_id: string }) => {
      get().fetchRoom(roomId).catch(console.error);
    };

    const handleUserLeft = (_data: { user_id: string; socket_id: string }) => {
      get().fetchRoom(roomId).catch(console.error);
    };

    // When the game starts, store the gameId so RoomPage can navigate all players
    const handleGameStart = (data: { game_id: string }) => {
      if (data.game_id) {
        console.log('[RoomStore] game:start received, gameId:', data.game_id);
        set({ startedGameId: data.game_id });
      }
    };

    const handleRoomUpdated = (_data: { room_id: string }) => {
      console.log('[RoomStore] room:updated received, refreshing room data');
      get().fetchRoom(roomId).catch(console.error);
    };

    socket.on('room:user_joined', handleUserJoined);
    socket.on('room:user_left', handleUserLeft);
    socket.on('game:start', handleGameStart);
    socket.on('room:updated', handleRoomUpdated);

    return () => {
      socket.off('room:user_joined', handleUserJoined);
      socket.off('room:user_left', handleUserLeft);
      socket.off('game:start', handleGameStart);
      socket.off('room:updated', handleRoomUpdated);
    };
  },
}));
