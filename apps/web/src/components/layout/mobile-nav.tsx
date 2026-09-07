'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, ScanEye, TrendingUp, Zap, MessageSquare, Menu } from 'lucide-react';
import { useUIStore } from '@/stores/ui-store';

const MOBILE_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Scanner', href: '/scanner', icon: ScanEye },
  { label: 'Signals', href: '/signals', icon: TrendingUp },
  { label: 'Trades', href: '/trades', icon: Zap },
  { label: 'AI Chat', href: '/chat', icon: MessageSquare },
];

export default function MobileNav() {
  const pathname = usePathname();
  const { sidebarOpen, setSidebarOpen } = useUIStore();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-[#0c101a]/95 backdrop-blur-xl border-t border-[#1e293b] flex items-center justify-around px-2 z-40">
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1 flex-1 h-full py-1 text-[10px] font-medium transition-colors',
              isActive ? 'text-brand-400 font-semibold' : 'text-[#64748b] hover:text-[#94a3b8]'
            )}
          >
            <Icon className={cn('w-5 h-5 transition-transform', isActive ? 'text-brand-400 scale-105' : 'text-[#64748b]')} />
            <span className="truncate">{item.label}</span>
          </Link>
        );
      })}

      {/* Menu / More Drawer Trigger */}
      <button
        onClick={() => setSidebarOpen(!sidebarOpen)}
        className={cn(
          'flex flex-col items-center justify-center gap-1 flex-1 h-full py-1 text-[10px] font-medium transition-colors',
          sidebarOpen ? 'text-brand-400 font-semibold' : 'text-[#64748b] hover:text-[#94a3b8]'
        )}
        title="Open full menu"
      >
        <Menu className={cn('w-5 h-5 transition-transform', sidebarOpen ? 'text-brand-400 scale-105' : 'text-[#64748b]')} />
        <span>Menu</span>
      </button>
    </nav>
  );
}
