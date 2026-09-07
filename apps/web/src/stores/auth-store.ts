import { create } from 'zustand';
import type { User, UserProfile, UserSettings } from '@trade-z/types';

interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  settings: UserSettings | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setProfile: (profile: UserProfile | null) => void;
  setSettings: (settings: UserSettings | null) => void;
  setLoading: (isLoading: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  profile: null,
  settings: null,
  isAuthenticated: false,
  isLoading: true,
  setUser: (user) => set({ user, isAuthenticated: !!user }),
  setProfile: (profile) => set({ profile }),
  setSettings: (settings) => set({ settings }),
  setLoading: (isLoading) => set({ isLoading }),
  logout: () => {
    // 1. Invalidate Supabase session asynchronously
    import('@/lib/supabase')
      .then(({ createClient }) => {
        const supabase = createClient();
        return supabase.auth.signOut();
      })
      .catch((err) => console.warn('Supabase sign out error:', err))
      .finally(() => {
        // 2. Clear client-side stored session tokens
        if (typeof window !== 'undefined') {
          try {
            localStorage.removeItem('trade-z-token');
            // Clear any supabase local keys
            Object.keys(localStorage).forEach((key) => {
              if (key.startsWith('sb-') || key.includes('auth')) {
                localStorage.removeItem(key);
              }
            });
            sessionStorage.clear();
          } catch (_) {}
          // 3. Force redirect to login
          window.location.href = '/login';
        }
      });

    // 4. Reset store state immediately
    set({
      user: null,
      profile: null,
      settings: null,
      isAuthenticated: false,
    });
  },
}));
