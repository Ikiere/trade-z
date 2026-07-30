'use client';

import { useState, useEffect } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useNotificationStore } from '@/stores/notification-store';
import { formatCurrency, getCurrentTradingSession, isMarketOpen } from '@trade-z/utils';
import { Bell, Search, Activity, Sun, Moon, LogOut, ChevronDown, CheckCheck, Trash2 } from 'lucide-react';
import Link from 'next/link';

export default function Header() {
  const { user, logout } = useAuthStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead, removeNotification } = useNotificationStore();

  const [sessionInfo, setSessionInfo] = useState({ session: 'off_hours', isHighLiquidity: false, overlap: false });
  const [marketOpen, setMarketOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  useEffect(() => {
    setSessionInfo(getCurrentTradingSession());
    setMarketOpen(isMarketOpen());

    const timer = setInterval(() => {
      setSessionInfo(getCurrentTradingSession());
      setMarketOpen(isMarketOpen());
    }, 60000);

    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-16 bg-bg-secondary border-b border-[#1e293b] flex items-center justify-between px-6 sticky top-0 z-30">
      {/* Left side — Search & Session */}
      <div className="flex items-center gap-6 flex-1 max-w-lg">
        <div className="relative w-full hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#475569]" />
          <input
            type="text"
            placeholder="Search assets, signals, logs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input pl-10"
          />
        </div>

        {/* Trading Session Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-bg-elevated border border-[#1e293b] shrink-0 text-xs font-mono">
          <div className={`w-2 h-2 rounded-full ${marketOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`} />
          <span className="text-[#94a3b8]">
            {marketOpen ? `Session: ${sessionInfo.session.toUpperCase()}` : 'MARKET CLOSED'}
          </span>
          {sessionInfo.overlap && (
            <span className="bg-brand-500/20 text-brand-300 px-1.5 py-0.5 rounded text-[10px] font-bold">
              OVERLAP
            </span>
          )}
        </div>
      </div>

      {/* Right side — Notifications, Portfolio Quick stats, Profile */}
      <div className="flex items-center gap-4">
        {/* Mock Portfolio Equity Indicator */}
        <div className="hidden lg:flex flex-col text-right text-xs">
          <span className="text-[#64748b] uppercase tracking-wider font-mono">Total Equity</span>
          <span className="font-semibold text-white font-mono">$105,642.20</span>
        </div>

        {/* Notification Bell */}
        <div className="relative">
          <button
            onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
            className="p-2 text-[#94a3b8] hover:text-white rounded-lg hover:bg-bg-hover transition-colors relative"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-brand-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
                {unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown */}
          {notifDropdownOpen && (
            <div className="absolute right-0 mt-2 w-80 bg-bg-card border border-[#1e293b] rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 border-b border-[#1e293b] flex items-center justify-between">
                <span className="text-sm font-semibold text-white">Notifications</span>
                {unreadCount > 0 && (
                  <button
                    onClick={() => markAllAsRead()}
                    className="text-xs text-brand-400 hover:text-brand-300 flex items-center gap-1"
                  >
                    <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                  </button>
                )}
              </div>
              <div className="max-h-64 overflow-y-auto divide-y divide-[#1e293b] no-scrollbar">
                {notifications.length === 0 ? (
                  <div className="p-4 text-center text-xs text-[#64748b]">
                    No new alerts
                  </div>
                ) : (
                  notifications.map((notif) => (
                    <div
                      key={notif.id}
                      className={`p-3 text-xs transition-colors hover:bg-bg-hover ${
                        !notif.isRead ? 'bg-brand-500/5' : ''
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2">
                        <p className="font-semibold text-white">{notif.title}</p>
                        <button
                          onClick={() => removeNotification(notif.id)}
                          className="text-[#475569] hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                      <p className="text-[#94a3b8] mt-1 leading-relaxed">{notif.message}</p>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-[10px] text-[#475569]">Just now</span>
                        {!notif.isRead && (
                          <button
                            onClick={() => markAsRead(notif.id)}
                            className="text-[10px] text-brand-400 font-semibold"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Dropdown */}
        <div className="relative">
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-bg-hover transition-colors text-[#94a3b8] hover:text-white"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-brand-600 to-brand-400 flex items-center justify-center text-white font-bold text-sm shrink-0">
              {user?.fullName?.charAt(0).toUpperCase() || 'T'}
            </div>
            <ChevronDown className="w-4 h-4" />
          </button>

          {/* User Menu */}
          {userMenuOpen && (
            <div className="absolute right-0 mt-2 w-48 bg-bg-card border border-[#1e293b] rounded-xl shadow-xl z-50 overflow-hidden">
              <div className="p-3 border-b border-[#1e293b]">
                <p className="text-xs font-semibold text-white">{user?.fullName || 'Trader Account'}</p>
                <p className="text-[10px] text-[#64748b] truncate">{user?.email || 'trader@tradez.app'}</p>
              </div>
              <div className="p-1">
                <Link
                  href="/settings"
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-[#94a3b8] hover:text-white hover:bg-bg-hover transition-colors"
                >
                  Profile & Settings
                </Link>
                <button
                  onClick={() => logout()}
                  className="flex items-center gap-2 w-full text-left px-3 py-2 rounded-lg text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" /> Sign Out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
