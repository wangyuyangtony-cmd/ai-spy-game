import { create } from 'zustand';
import { authApi } from '../services/api';
import { connectSocket, disconnectSocket } from '../services/socket';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;

  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, nickname?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
  updateUser: (data: { nickname?: string; avatar_url?: string }) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, _get) => ({
  user: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),
  isLoading: false,
  error: null,

  login: async (username, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.login({ username, password });
      const { user, token } = res;
      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true, isLoading: false });
      connectSocket();
    } catch (err: any) {
      const message = err.message || '登录失败，请检查用户名和密码';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  register: async (username, password, nickname) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authApi.register({ username, password, nickname });
      const { user, token } = res;
      localStorage.setItem('token', token);
      set({ user, token, isAuthenticated: true, isLoading: false });
      connectSocket();
    } catch (err: any) {
      const message = err.message || '注册失败，请稍后重试';
      set({ error: message, isLoading: false });
      throw new Error(message);
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    disconnectSocket();
    set({ user: null, token: null, isAuthenticated: false });
  },

  loadUser: async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      set({ isAuthenticated: false });
      return;
    }
    try {
      const res = await authApi.getMe();
      set({ user: res.user, isAuthenticated: true });
      connectSocket();
    } catch {
      localStorage.removeItem('token');
      set({ user: null, token: null, isAuthenticated: false });
    }
  },

  clearError: () => set({ error: null }),

  updateUser: async (data) => {
    try {
      const res = await authApi.updateMe(data);
      set({ user: res.user });
    } catch (err: any) {
      const message = err.message || '更新失败';
      throw new Error(message);
    }
  },
}));
