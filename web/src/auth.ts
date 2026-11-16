import { create } from "zustand";
import { api, type User } from "./api";

interface AuthState {
  user: User | null;
  ready: boolean; // false until we know whether a session cookie is valid
  init: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  user: null,
  ready: false,
  init: async () => {
    try {
      set({ user: (await api.me()).user, ready: true });
    } catch {
      // not signed in, or the server is unreachable — either way the app still works as a guest
      set({ user: null, ready: true });
    }
  },
  login: async (email, password) => set({ user: (await api.login(email, password)).user }),
  register: async (name, email, password) => set({ user: (await api.register(name, email, password)).user }),
  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null });
    }
  },
}));
