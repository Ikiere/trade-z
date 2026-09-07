'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useUIStore } from '@/stores/ui-store';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  ScanEye,
  TrendingUp,
  Briefcase,
  History,
  BookOpen,
  Calendar,
  MessageSquare,
  Settings,
  CreditCard,
  Zap,
  ChevronLeft,
  ChevronRight,
  Shield,
  FlaskConical,
  X,
  LogOut,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';

const MENU_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Market Scanner', href: '/scanner', icon: ScanEye },
  { label: 'Signals', href: '/signals', icon: TrendingUp },
  { label: 'AI Backtester', href: '/backtest', icon: FlaskConical },
  { label: 'Portfolio', href: '/portfolio', icon: Briefcase },
  { label: 'Trades', href: '/trades', icon: Zap },
  { label: 'Trade History', href: '/history', icon: History },
  { label: 'Trade Journal', href: '/journal', icon: BookOpen },
  { label: 'Economic Calendar', href: '/calendar', icon: Calendar },
  { label: 'AI Chat', href: '/chat', icon: MessageSquare },
  { label: 'Billing & Plans', href: '/billing', icon: CreditCard },
  { label: 'Settings', href: '/settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, sidebarOpen, setSidebarOpen } = useUIStore();
  const { user, logout } = useAuthStore();

  return (
    <>
      {/* =========================================================================
          1. Desktop Collapsible Sidebar (visible on md+ screens)
         ========================================================================= */}
      <aside
        className={cn(
          'hidden md:flex flex-col h-screen fixed left-0 top-0 z-40 bg-bg-secondary border-r border-[#1e293b] transition-all duration-300',
          sidebarCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-[#1e293b]">
          <Link href="/dashboard" className="flex items-center gap-3 overflow-hidden">
            <div className="w-8.5 h-8.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center shrink-0 shadow-sm">
              <Zap className="w-5 h-5 text-white" />
            </div>
            {!sidebarCollapsed && (
              <motion.span
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="text-lg font-bold text-white whitespace-nowrap tracking-tight"
              >
                Trade<span className="text-brand-400">-Z</span>
              </motion.span>
            )}
          </Link>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="text-[#64748b] hover:text-white p-1.5 rounded-lg hover:bg-bg-hover transition-colors shrink-0"
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {sidebarCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        </div>

        {/* Nav Menu */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto no-scrollbar">
          {MENU_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all group relative',
                  isActive
                    ? 'bg-gradient-to-r from-brand-600/15 to-transparent text-brand-400 border-l-2 border-brand-500'
                    : 'text-[#94a3b8] hover:text-white hover:bg-bg-hover'
                )}
              >
                <Icon
                  className={cn(
                    'w-5 h-5 shrink-0 transition-transform group-hover:scale-105',
                    isActive ? 'text-brand-400' : 'text-[#64748b]'
                  )}
                />
                {!sidebarCollapsed && (
                  <motion.span
                    initial={{ opacity: 0, x: -5 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="whitespace-nowrap"
                  >
                    {item.label}
                  </motion.span>
                )}

                {/* Tooltip on collapse */}
                {sidebarCollapsed && (
                  <div className="absolute left-full ml-2 px-2.5 py-1.5 bg-bg-elevated border border-[#1e293b] rounded-md text-xs font-semibold text-white whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity shadow-lg z-50">
                    {item.label}
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        {/* AI Mode Footer Indicator & Sign Out */}
        <div className="p-3 border-t border-[#1e293b] space-y-2 bg-[#080c14]">
          <div className={cn('flex items-center gap-3', sidebarCollapsed ? 'justify-center' : '')}>
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0 border border-emerald-500/20">
              <Shield className="w-4 h-4 text-emerald-400" />
            </div>
            {!sidebarCollapsed && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-xs overflow-hidden"
              >
                <p className="font-semibold text-white truncate">AI Capital Shield</p>
                <p className="text-[#64748b] font-mono text-[10px]">Active (1-2% Risk Cap)</p>
              </motion.div>
            )}
          </div>

          <button
            onClick={() => logout()}
            className={cn(
              'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold text-red-400/90 hover:text-red-300 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 transition-all',
              sidebarCollapsed ? 'justify-center px-0' : ''
            )}
            title="Sign out of account"
          >
            <LogOut className="w-4 h-4 shrink-0 text-red-400" />
            {!sidebarCollapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      {/* =========================================================================
          2. Mobile Slide-out Drawer Sidebar (visible on mobile screens when open)
         ========================================================================= */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            {/* Backdrop Overlay */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 bg-black/75 backdrop-blur-sm z-50 md:hidden"
            />

            {/* Slide-out Drawer */}
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 26, stiffness: 280 }}
              className="fixed left-0 top-0 bottom-0 w-72 max-w-[82vw] bg-[#0b0f19] border-r border-[#1e293b] z-50 flex flex-col shadow-2xl md:hidden overflow-hidden"
            >
              {/* Drawer Header */}
              <div className="h-16 flex items-center justify-between px-5 border-b border-[#1e293b]">
                <Link
                  href="/dashboard"
                  onClick={() => setSidebarOpen(false)}
                  className="flex items-center gap-3"
                >
                  <div className="w-8.5 h-8.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center shrink-0 shadow-sm">
                    <Zap className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-lg font-bold text-white tracking-tight">
                    Trade<span className="text-brand-400">-Z</span>
                  </span>
                </Link>

                <button
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 rounded-lg bg-[#161d2d] hover:bg-[#20293d] text-[#94a3b8] hover:text-white transition-colors"
                  title="Close sidebar"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User mini profile card on mobile */}
              <div className="p-3 mx-3 my-2 rounded-xl bg-[#111728] border border-[#1e293b] flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white font-bold text-xs shrink-0">
                  {user?.fullName?.charAt(0).toUpperCase() || 'T'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{user?.fullName || 'Trader Account'}</p>
                  <p className="text-[10px] text-[#64748b] truncate font-mono">{user?.email || 'trader@tradez.app'}</p>
                </div>
              </div>

              {/* Full Navigation List */}
              <nav className="flex-1 py-2 px-3 space-y-1 overflow-y-auto no-scrollbar">
                {MENU_ITEMS.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.href;

                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setSidebarOpen(false)}
                      className={cn(
                        'flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all',
                        isActive
                          ? 'bg-gradient-to-r from-brand-600/20 to-transparent text-brand-400 border-l-2 border-brand-500 font-semibold'
                          : 'text-[#94a3b8] hover:text-white hover:bg-[#151c2e]'
                      )}
                    >
                      <Icon
                        className={cn(
                          'w-5 h-5 shrink-0',
                          isActive ? 'text-brand-400' : 'text-[#64748b]'
                        )}
                      />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </nav>

              {/* Drawer Footer */}
              <div className="p-4 border-t border-[#1e293b] space-y-3 bg-[#080c14]">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-[#94a3b8] font-mono text-[11px]">AI Capital Shield</span>
                  </div>
                  <span className="text-emerald-400 font-mono text-[10px] font-bold">1-2% CAP</span>
                </div>

                <button
                  onClick={() => {
                    setSidebarOpen(false);
                    logout();
                  }}
                  className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition-colors"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
