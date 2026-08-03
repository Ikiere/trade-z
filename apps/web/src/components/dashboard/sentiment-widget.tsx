'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import { Loader2, TrendingUp, TrendingDown, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';

interface SentimentItem {
  pair: string;
  sentiment: number;
  status: string;
  color: string;
  bg: string;
}

export default function MarketSentimentWidget() {
  const [data, setData] = useState<SentimentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchSentiment = async () => {
    const supabase = createClient();
    try {
      const apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const res = await fetch(`${apiBase}/api/v1/trades/sentiment`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.ok) {
        const body = await res.json();
        if (body?.success && Array.isArray(body.data)) {
          setData(body.data);
        }
      }
    } catch (err) {
      console.error('Error fetching market sentiment:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchSentiment();
    // Refresh sentiment every 5 minutes
    const interval = setInterval(fetchSentiment, 300000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex justify-between items-center border-b border-[#1e293b] pb-3">
        <div>
          <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
            Market Sentiment
          </h3>
          <p className="text-[9px] text-[#64748b] font-mono mt-0.5 uppercase tracking-wide">
            Platform AI &amp; Technical Confluence ratio
          </p>
        </div>
        <button
          onClick={() => { setRefreshing(true); fetchSentiment(); }}
          disabled={refreshing}
          className="p-1.5 rounded bg-bg-secondary hover:bg-bg-hover text-zinc-400 hover:text-white transition-colors border border-[#1e293b]"
          title="Refresh Sentiment"
        >
          {refreshing ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      <div className="space-y-4 font-mono">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-xs text-[#64748b] gap-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-brand-400" />
            Analyzing market order flows...
          </div>
        ) : data.length === 0 ? (
          <div className="text-center py-6 text-xs text-[#64748b]">
            No pairs in your watchlist. Configure your watchlist in Settings to view sentiment.
          </div>
        ) : (
          data.map((item) => {
            const isBullish = item.sentiment >= 50;
            return (
              <div key={item.pair} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-white font-mono">{item.pair}</span>
                    {isBullish ? (
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={item.color}>{item.sentiment}%</span>
                    <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${item.bg} ${item.color}`}>
                      {item.status}
                    </span>
                  </div>
                </div>
                <div className="w-full h-1.5 bg-[#0f172a] rounded-full overflow-hidden border border-[#1e293b]/40">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${
                      item.status.includes('Bullish') 
                        ? 'from-emerald-600 to-emerald-400' 
                        : item.status.includes('Bearish')
                        ? 'from-red-600 to-red-400'
                        : 'from-zinc-600 to-zinc-400'
                    }`}
                    initial={{ width: 0 }}
                    animate={{ width: `${item.sentiment}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                  />
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
