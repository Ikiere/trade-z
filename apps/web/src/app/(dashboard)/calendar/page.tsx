'use client';

import { useEffect, useState } from 'react';
import { Calendar, Clock, AlertOctagon, RefreshCw, TrendingUp, ShieldAlert } from 'lucide-react';

import { getApiBaseUrl } from '@/lib/api';

export default function CalendarPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCalendar() {
      try {
        const apiUrl = `${getApiBaseUrl()}/api/v1/calendar`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const body = await res.json();
          if (body?.data) {
            setEvents(body.data);
          }
        }
      } catch (err) {
        console.error('Error loading economic calendar:', err);
      } finally {
        setLoading(false);
      }
    }

    loadCalendar();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl md:text-2xl font-bold text-white tracking-tight">Economic Calendar</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          HIGH-IMPACT GLOBAL ECONOMIC RELEASES & VOLATILITY WARNINGS
        </p>
      </div>

      {/* Events listing */}
      <div className="card p-4 md:p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
          <h3 className="text-sm font-semibold text-white">Upcoming Volatility Catalyst Events</h3>
          <span className="text-[10px] text-[#64748b] font-mono">Real-Time News Feed</span>
        </div>

        <div className="space-y-4">
          {loading ? (
            <div className="text-center py-12 text-xs text-[#64748b] font-mono animate-pulse">
              Synchronizing with global economic servers...
            </div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-xs text-[#64748b] font-mono">
              No economic events scheduled.
            </div>
          ) : (
            events.map((event) => {
              const isHigh = event.impact === 'high';
              const isMedium = event.impact === 'medium';
              const isProfitable = event.status === 'profitable';
              const isRisky = event.status === 'risky';

              return (
                <div
                  key={event.id}
                  className={`p-4 rounded-xl border flex flex-col lg:flex-row lg:items-center justify-between gap-4 transition-colors ${
                    isProfitable
                      ? 'bg-emerald-500/[0.02] border-emerald-500/10 hover:border-emerald-500/20'
                      : isRisky
                      ? 'bg-red-500/[0.02] border-red-500/10 hover:border-red-500/20'
                      : 'bg-bg-secondary border-[#1e293b] hover:border-[#334155]'
                  }`}
                >
                  {/* Details */}
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      isHigh
                        ? 'bg-red-500/20 text-red-400'
                        : isMedium
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-zinc-500/20 text-zinc-400'
                    }`}>
                      <AlertOctagon className="w-5 h-5" />
                    </div>
                    <div className="space-y-1 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-white font-mono">{event.currency}</span>
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase ${
                          isHigh 
                            ? 'bg-red-500/20 text-red-400' 
                            : isMedium 
                            ? 'bg-amber-500/20 text-amber-400' 
                            : 'bg-zinc-500/20 text-zinc-400'
                        }`}>
                          {event.impact} IMPACT
                        </span>

                        <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold font-mono flex items-center gap-1 ${
                          isProfitable
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : isRisky
                            ? 'bg-red-500/10 text-red-400'
                            : 'bg-zinc-500/10 text-zinc-400'
                        }`}>
                          {isProfitable ? (
                            <>
                              <TrendingUp className="w-2.5 h-2.5" />
                              Profitable
                            </>
                          ) : isRisky ? (
                            <>
                              <ShieldAlert className="w-2.5 h-2.5" />
                              Risky / Volatile
                            </>
                          ) : (
                            'Neutral'
                          )}
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{event.title}</p>
                      
                      {/* Live volatility/impact details */}
                      <p className="text-xs text-[#94a3b8] font-mono bg-bg-secondary/40 p-2 rounded max-w-2xl mt-1 leading-relaxed">
                        {event.description}
                      </p>

                      <div className="flex items-center gap-1.5 text-[10px] text-[#64748b] mt-1 font-mono">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{event.date} • {event.time} UTC</span>
                      </div>
                    </div>
                  </div>

                  {/* Metrics */}
                  <div className="grid grid-cols-3 gap-6 text-center font-mono text-xs w-full lg:max-w-xs shrink-0 border-t border-[#1e293b]/50 lg:border-t-0 pt-3 lg:pt-0">
                    <div>
                      <span className="text-[#64748b] text-[9px] uppercase block">ACTUAL</span>
                      <span className={`font-bold mt-0.5 block ${
                        event.actual 
                          ? (isProfitable ? 'text-emerald-400 font-extrabold' : isRisky ? 'text-red-400 font-extrabold' : 'text-white') 
                          : 'text-[#475569]'
                      }`}>
                        {event.actual || 'PENDING'}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748b] text-[9px] uppercase block">FORECAST</span>
                      <span className="font-semibold text-white mt-0.5 block">{event.forecast || '—'}</span>
                    </div>
                    <div>
                      <span className="text-[#64748b] text-[9px] uppercase block">PREVIOUS</span>
                      <span className="text-white mt-0.5 block">{event.previous || '—'}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
