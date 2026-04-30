import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface User {
  id: string;
  email: string;
  role: 'ADMIN' | 'EMPLOYEE' | 'SUPPLIER';
  firstName?: string;
  lastName?: string;
  locationId?: string | null;
}

interface AuthStore {
  user: User | null;
  token: string | null;
  login: (token: string, user: User) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set) => ({
      user: null,
      token: null,
      login: (token, user) => {
        set({ token, user });
        localStorage.setItem('token', token);
      },
      logout: () => {
        set({ token: null, user: null });
        localStorage.removeItem('token');
      },
    }),
    {
      name: 'auth-storage',
    }
  )
);
