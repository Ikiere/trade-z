'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Clock, ShieldAlert, Sparkles, TrendingUp } from 'lucide-react';

export default function EconomicCalendarWidget() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadCalendar() {
      try {
        const apiUrl = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/v1/calendar`;
        const res = await fetch(apiUrl);
        if (res.ok) {
          const body = await res.json();
          if (body?.data) {
            setEvents(body.data.slice(0, 5)); // show first 5 major events
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
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
          <Sparkles className="w-4 h-4 text-brand-400" />
          News Safety Feed
        </h3>
        <span className="text-[10px] text-[#64748b] font-mono">Real-Time Calendar</span>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="text-center py-6 text-xs text-[#64748b] font-mono animate-pulse">
            Syncing global news parameters...
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-6 text-xs text-[#64748b] font-mono">
            No volatile events scheduled.
          </div>
        ) : (
          events.map((event) => {
            const isProfitable = event.status === 'profitable';
            const isRisky = event.status === 'risky';
            
            return (
              <div
                key={event.id}
                className={`p-3 rounded-lg border transition-all duration-300 ${
                  isProfitable
                    ? 'bg-emerald-500/[0.02] border-emerald-500/10 hover:border-emerald-500/20'
                    : isRisky
                    ? 'bg-red-500/[0.02] border-red-500/10 hover:border-red-500/20'
                    : 'bg-bg-secondary border-[#1e293b] hover:border-[#334155]'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold font-mono uppercase ${
                        event.impact === 'high'
                          ? 'bg-red-500/20 text-red-400'
                          : event.impact === 'medium'
                          ? 'bg-amber-500/20 text-amber-400'
                          : 'bg-zinc-500/20 text-zinc-400'
                      }`}>
                        {event.impact}
                      </span>
                      <span className="text-xs font-bold text-white font-mono">{event.currency}</span>
                    </div>

                    {/* PROFITABLE VS RISKY indicator */}
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

                  <p className="text-xs font-medium text-white leading-snug">{event.title}</p>
                  
                  {/* Real impact details */}
                  <p className="text-[10px] text-[#94a3b8] font-mono leading-relaxed bg-bg-secondary/40 p-1.5 rounded">
                    {event.description}
                  </p>

                  <div className="flex justify-between items-center text-[9px] font-mono text-[#64748b] pt-1">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {event.time} ({event.date})
                    </span>
                    <div className="flex gap-2">
                      <span>F: <strong className="text-[#94a3b8]">{event.forecast || '—'}</strong></span>
                      <span>A: <strong className={isProfitable ? 'text-emerald-400 font-bold' : isRisky ? 'text-red-400 font-bold' : 'text-white'}>{event.actual || '—'}</strong></span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
