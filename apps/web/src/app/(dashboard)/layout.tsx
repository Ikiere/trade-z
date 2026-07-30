'use client';

import Sidebar from '@/components/layout/sidebar';
import Header from '@/components/layout/header';
import MobileNav from '@/components/layout/mobile-nav';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { MOCK_ECONOMIC_EVENTS } from '@/lib/mock-data';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { sidebarCollapsed } = useUIStore();
  const pathname = usePathname();
  const setUser = useAuthStore((state) => state.setUser);
  const addNotification = useNotificationStore((state) => state.addNotification);

  // Set mock authenticated user & fire welcome signal notification for presentation
  useEffect(() => {
    setUser({
      id: 'usr-1',
      email: 'trader@tradez.app',
      fullName: 'Chief Institutional Trader',
      role: 'user',
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Seed mock alert
    const timer = setTimeout(() => {
      addNotification({
        id: 'notif-welcome',
        userId: 'usr-1',
        type: 'signal_new',
        title: 'New AI Trade Signal: EURUSD Long',
        message: 'AI Confidence score: 94%. Confirmed order block displacement on 4H. Setup details active.',
        isRead: false,
        createdAt: new Date().toISOString(),
      });
    }, 2000);

    return () => clearTimeout(timer);
  }, [setUser, addNotification]);

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
