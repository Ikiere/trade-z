'use client';

import { MOCK_ECONOMIC_EVENTS } from '@/lib/mock-data';
import { AlertTriangle, Clock, Info } from 'lucide-react';

export default function EconomicCalendarWidget() {
  return (
    <div className="card p-5">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold text-white">Upcoming Events</h3>
        <span className="text-[10px] text-[#64748b] font-mono">Economic Calendar</span>
      </div>

      <div className="space-y-3.5">
        {MOCK_ECONOMIC_EVENTS.map((event) => {
          const isHigh = event.impact === 'high';
          const isMedium = event.impact === 'medium';
          
          return (
            <div
              key={event.id}
              className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                isHigh
                  ? 'bg-red-500/5 border-red-500/10'
                  : isMedium
                  ? 'bg-amber-500/5 border-amber-500/10'
                  : 'bg-bg-secondary border-[#1e293b]'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase font-mono ${
                    isHigh
                      ? 'bg-red-500/25 text-red-400'
                      : isMedium
                      ? 'bg-amber-500/25 text-amber-400'
                      : 'bg-zinc-500/25 text-zinc-400'
                  }`}>
                    {event.impact}
                  </span>
                  <span className="text-xs font-semibold text-white font-mono">{event.currency}</span>
                </div>
                <p className="text-xs font-medium text-[#94a3b8] leading-snug">{event.title}</p>
                <div className="flex items-center gap-1 text-[10px] text-[#64748b]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{event.time}</span>
                </div>
              </div>

              {/* Forecast Metrics */}
              <div className="text-right text-[10px] font-mono shrink-0">
                <p className="text-[#64748b]">FORECAST</p>
                <p className="font-semibold text-white mt-0.5">{event.forecast || '—'}</p>
                <p className="text-[#64748b] mt-1">PREVIOUS</p>
                <p className="text-white mt-0.5">{event.previous || '—'}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
