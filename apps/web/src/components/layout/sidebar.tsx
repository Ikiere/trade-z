'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
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
} from 'lucide-react';

const MENU_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Market Scanner', href: '/scanner', icon: ScanEye },
  { label: 'Signals', href: '/signals', icon: TrendingUp },
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
  const { sidebarCollapsed, setSidebarCollapsed } = useUIStore();

  return (
    <aside
      className={cn(
        'hidden md:flex flex-col h-screen fixed left-0 top-0 z-40 bg-bg-secondary border-r border-[#1e293b] transition-all duration-300',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div className="h-16 flex items-center justify-between px-4 border-b border-[#1e293b]">
        <Link href="/" className="flex items-center gap-3 overflow-hidden">
          <div className="w-8.5 h-8.5 rounded-lg bg-gradient-to-br from-brand-600 to-brand-400 flex items-center justify-center shrink-0">
            <Zap className="w-5 h-5 text-white" />
          </div>
          {!sidebarCollapsed && (
            <motion.span
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="text-lg font-bold text-white whitespace-nowrap"
            >
              Trade<span className="text-brand-400">-Z</span>
            </motion.span>
          )}
        </Link>
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="text-[#64748b] hover:text-white p-1 rounded-lg hover:bg-bg-hover transition-colors shrink-0"
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
                'flex items-center gap-3 px-3.5 py-3 rounded-lg text-sm font-medium transition-all group relative',
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

      {/* AI Mode Footer Indicator */}
      <div className="p-4 border-t border-[#1e293b]">
        <div className={cn('flex items-center gap-3', sidebarCollapsed ? 'justify-center' : '')}>
          <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-emerald-400" />
          </div>
          {!sidebarCollapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-xs"
            >
              <p className="font-semibold text-white">Risk Protection</p>
              <p className="text-[#64748b] font-mono">Active (95% Thresh)</p>
            </motion.div>
          )}
        </div>
      </div>
    </aside>
  );
}
