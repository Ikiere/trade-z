'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase';
import type { JournalEntry, TradingMood } from '@trade-z/types';
import { BookOpen, Calendar, ShieldCheck, Heart, Frown, Smile, Trash2, Award, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

export default function JournalPage() {
  const [entries, setEntries] = useState<JournalEntry[]>([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [mood, setMood] = useState<TradingMood>('confident');
  const [rating, setRating] = useState(5);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  async function loadEntries() {
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('entry_date', { ascending: false });

      if (data) {
        // Map database schema to frontend model
        const mapped = data.map((entry: any) => ({
          id: entry.id,
          userId: entry.user_id,
          tradeId: entry.trade_id,
          title: entry.title,
          content: entry.content,
          mood: entry.mood as TradingMood,
          tags: entry.tags || [],
          screenshots: entry.screenshots || [],
          lessons: entry.lessons || [],
          rating: entry.rating || 5,
          date: entry.entry_date,
          createdAt: entry.created_at,
          updatedAt: entry.updated_at
        }));
        setEntries(mapped);
      }
    } catch (err) {
      console.error('Error loading journal entries:', err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEntries();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !content) return;

    setSubmitting(true);
    const supabase = createClient();
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('journal_entries')
        .insert({
          user_id: user.id,
          title,
          content,
          mood,
          rating,
          tags: ['Manual Journal'],
          entry_date: new Date().toISOString().split('T')[0]
        });

      if (error) throw error;

      setTitle('');
      setContent('');
      setMood('confident');
      setRating(5);
      await loadEntries();
    } catch (err) {
      console.error('Error adding journal entry:', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Trade Journal</h1>
        <p className="text-xs text-[#94a3b8] mt-1 font-mono">
          REFLECT ON EMOTIONS, STRATEGIES & LESSONS LEARNED
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Create Entry Form */}
        <div className="card p-5 lg:col-span-1 space-y-4">
          <h3 className="text-sm font-semibold text-white">New Entry</h3>
          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            {/* Title */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Entry Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Excellent H4 Order block bounce"
                className="input"
                required
              />
            </div>

            {/* Content */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Notes & Thoughts</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="What did you feel? Why did you enter?"
                rows={4}
                className="input resize-none"
                required
              />
            </div>

            {/* Mood */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Trading Mood</label>
              <select
                value={mood}
                onChange={(e) => setMood(e.target.value as TradingMood)}
                className="input"
              >
                {['confident', 'cautious', 'anxious', 'frustrated', 'disciplined', 'greedy', 'fearful', 'neutral'].map((m) => (
                  <option key={m} value={m}>
                    {m.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            {/* Rating */}
            <div>
              <label className="block text-[#94a3b8] mb-1.5 font-mono uppercase">Execution Rating (1-5)</label>
              <select
                value={rating}
                onChange={(e) => setRating(Number(e.target.value))}
                className="input"
              >
                {[5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>
                    {r} / 5 Stars
                  </option>
                ))}
              </select>
            </div>

            <button type="submit" disabled={submitting} className="btn btn-primary w-full py-2.5 flex items-center justify-center gap-1.5">
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              Add Journal Entry
            </button>
          </form>
        </div>

        {/* Entries List */}
        <div className="card p-5 lg:col-span-2 space-y-4">
          <h3 className="text-sm font-semibold text-white">Journal History</h3>

          {loading ? (
            <p className="text-xs text-[#64748b] text-center py-6">Loading journal logs...</p>
          ) : entries.length === 0 ? (
            <p className="text-xs text-[#64748b] text-center py-6">No journal logs recorded yet.</p>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <div key={entry.id} className="p-4 rounded-xl bg-bg-secondary border border-[#1e293b] space-y-2">
                  <div className="flex justify-between items-start gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-white leading-snug">{entry.title}</h4>
                      <p className="text-[10px] text-[#64748b] font-mono mt-0.5">{entry.date}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-[9px] bg-brand-600/20 text-brand-400 font-bold uppercase font-mono">
                        {entry.mood}
                      </span>
                      <span className="text-xs font-mono font-bold text-amber-400">
                        {'★'.repeat(entry.rating)}
                      </span>
                    </div>
                  </div>
                  <p className="text-xs text-[#94a3b8] leading-relaxed">{entry.content}</p>
                  <div className="flex justify-between items-center pt-2 text-[9px] font-mono text-[#64748b]">
                    <span>TAGS: {entry.tags.join(', ')}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
