import { create } from 'zustand';
import { api, clearToken, getToken, setToken } from '../lib/api';
import type { User } from '../lib/types';

interface AuthState {
  user: User | null;
  ready: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  init: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  async login(username, password) {
    const { token, user } = await api.login(username, password);
    setToken(token);
    set({ user });
  },
  logout() {
    clearToken();
    set({ user: null });
  },
  async init() {
    if (!getToken()) {
      set({ ready: true });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, ready: true });
    } catch {
      clearToken();
      set({ user: null, ready: true });
    }
  },
}));
