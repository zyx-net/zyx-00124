import { create } from 'zustand';
import { api, clearToken, setToken } from '@/lib/api';
import type { User, SystemConfig } from '../../shared/types';

interface AuthState {
  token: string | null;
  user: Omit<User, 'password'> | null;
  config: SystemConfig | null;
  initialized: boolean;
  init: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  token: null,
  user: null,
  config: null,
  initialized: false,
  init: async () => {
    try {
      const { user, config } = await api.me();
      set({ user, config, initialized: true });
    } catch {
      set({ initialized: true });
    }
  },
  login: async (username, password) => {
    const { token, user } = await api.login(username, password);
    setToken(token);
    const { config } = await api.me();
    set({ token, user, config });
  },
  logout: async () => {
    try {
      await api.logout();
    } catch {}
    clearToken();
    set({ token: null, user: null, config: null });
  },
}));
