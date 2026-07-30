'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { LayoutDashboard, ScanEye, TrendingUp, Zap, MessageSquare } from 'lucide-react';

const MOBILE_ITEMS = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Scanner', href: '/scanner', icon: ScanEye },
  { label: 'Signals', href: '/signals', icon: TrendingUp },
  { label: 'Trades', href: '/trades', icon: Zap },
  { label: 'AI Chat', href: '/chat', icon: MessageSquare },
];

export default function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-bg-secondary/95 backdrop-blur-xl border-t border-[#1e293b] flex items-center justify-around px-4 z-40">
      {MOBILE_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex flex-col items-center justify-center gap-1.5 flex-1 h-full py-1 text-[10px] font-medium transition-colors',
              isActive ? 'text-brand-400' : 'text-[#64748b] hover:text-[#94a3b8]'
            )}
          >
            <Icon className={cn('w-5.5 h-5.5', isActive ? 'text-brand-400' : 'text-[#64748b]')} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
