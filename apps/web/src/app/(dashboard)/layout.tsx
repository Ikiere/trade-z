'use client';

import Sidebar from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import MobileNav from '@/components/layout/mobile-nav';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { createClient } from '@/lib/supabase';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore();
  const pathname = usePathname();
  const router = useRouter();
  const setUser = useAuthStore((state) => state.setUser);
  const setProfile = useAuthStore((state) => state.setProfile);
  const setSettings = useAuthStore((state) => state.setSettings);
  const setLoading = useAuthStore((state) => state.setLoading);
  const logout = useAuthStore((state) => state.logout);
  const addNotification = useNotificationStore((state) => state.addNotification);

  useEffect(() => {
    const supabase = createClient();

    async function loadUser() {
      setLoading(true);
      try {
        const { data: { user: sbUser }, error: userError } = await supabase.auth.getUser();

        if (userError || !sbUser) {
          logout();
          router.push('/login');
          return;
        }

        // Load profile
        const { data: profileData } = await supabase
          .from('user_profiles')
          .select('*')
          .eq('user_id', sbUser.id)
          .maybeSingle();

        // Load settings
        const { data: settingsData } = await supabase
          .from('user_settings')
          .select('*')
          .eq('user_id', sbUser.id)
          .maybeSingle();

        setUser({
          id: sbUser.id,
          email: sbUser.email || '',
          fullName: profileData?.display_name || sbUser.user_metadata?.full_name || 'Trader',
          role: 'user',
          status: 'active',
          createdAt: sbUser.created_at,
          updatedAt: sbUser.updated_at || sbUser.created_at,
        });

        if (profileData) {
          setProfile(profileData);
        }
        if (settingsData) {
          setSettings(settingsData);
        }
      } catch (err) {
        console.error('Error loading user session:', err);
        logout();
        router.push('/login');
      } finally {
        setLoading(false);
      }
    }

    loadUser();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        logout();
        router.push('/login');
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        loadUser();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setProfile, setSettings, setLoading, logout, router]);

  return (
    <div className="min-h-screen bg-bg-primary flex">
      {/* Sidebar */}
      <Sidebar />

      {/* Main content wrapper */}
      <div
        className={cn(
          'flex-1 flex flex-col min-h-screen pb-16 md:pb-0 transition-all duration-300',
          sidebarCollapsed ? 'md:pl-20' : 'md:pl-64'
        )}
      >
        <Header />

        <main className="flex-1 overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="w-full h-full"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {/* Mobile nav bottom bar */}
      <MobileNav />
    </div>
  );
}
