'use client';

import { MOCK_ECONOMIC_EVENTS } from '@/lib/mock-data';
import { Calendar, Clock, AlertOctagon, RefreshCw } from 'lucide-react';

export default function CalendarPage() {
  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Economic Calendar</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          HIGH-IMPACT GLOBAL ECONOMIC RELEASES & VOLATILITY WARNINGS
        </p>
      </div>

      {/* Events listing */}
      <div className="card p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
          <h3 className="text-sm font-semibold text-white">Upcoming Volatility Catalyst Events</h3>
          <span className="text-[10px] text-[#64748b] font-mono">Auto-Syncs every 1m</span>
        </div>

        <div className="space-y-4">
          {MOCK_ECONOMIC_EVENTS.map((event) => {
            const isHigh = event.impact === 'high';
            const isMedium = event.impact === 'medium';

            return (
              <div
                key={event.id}
                className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 transition-colors ${
                  isHigh
                    ? 'bg-red-500/5 border-red-500/10'
                    : isMedium
                    ? 'bg-amber-500/5 border-amber-500/10'
                    : 'bg-bg-secondary border-[#1e293b]'
                }`}
              >
                {/* Details */}
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                    isHigh
                      ? 'bg-red-500/20 text-red-400'
                      : isMedium
                      ? 'bg-amber-500/20 text-amber-400'
                      : 'bg-zinc-500/20 text-zinc-400'
                  }`}>
                    <AlertOctagon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-white font-mono">{event.currency}</span>
                      <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold font-mono uppercase ${
                        isHigh ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                      }`}>
                        {event.impact} IMPACT
                      </span>
                    </div>
                    <p className="text-sm font-semibold text-white mt-1">{event.title}</p>
                    <div className="flex items-center gap-1.5 text-[10px] text-[#64748b] mt-1 font-mono">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{event.date} • {event.time} UTC</span>
                    </div>
                  </div>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-3 gap-6 text-center font-mono text-xs flex-1 max-w-xs md:justify-end">
                  <div>
                    <span className="text-[#64748b] text-[9px] uppercase block">ACTUAL</span>
                    <span className={`font-bold mt-0.5 block ${event.actual ? 'text-white' : 'text-[#475569]'}`}>
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
          })}
        </div>
      </div>
    </div>
  );
}
