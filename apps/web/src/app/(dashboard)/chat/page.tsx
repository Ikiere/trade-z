'use client';

import { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, Sparkles, RefreshCw, Terminal } from 'lucide-react';
import { motion } from 'framer-motion';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg-init-1',
    sender: 'ai',
    text: 'Greetings. I am the Trade-Z Trading Assistant. Ask me to explain active signals, evaluate market support levels, or inspect scanning metrics.',
    timestamp: new Date().toISOString(),
  },
];

const SUGGESTIONS = [
  'Analyze EURUSD bias',
  'Why did USDJPY get rejected?',
  'Calculate lot size for $1k risk',
  'Inspect economic news volatility',
];

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  const handleSend = (textToSend: string) => {
    if (!textToSend.trim()) return;

    const userMsg: Message = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    // Mock AI reply simulating reasoning and explanation
    setTimeout(() => {
      let reply = 'I have evaluated your request against current market conditions. ';

      if (textToSend.toLowerCase().includes('eurusd')) {
        reply = 'EURUSD is displaying strong H4 bullish market structure. Liquidity pools swept. Active signal displays entry bounds at 1.08340 with Stop Loss at 1.07980. Trend and momentum filters are fully aligned.';
      } else if (textToSend.toLowerCase().includes('usdjpy') || textToSend.toLowerCase().includes('reject')) {
        reply = 'USDJPY short setup was rejected with 68% confidence score. Rejection reasons: 1. Trend alignment discrepancy (daily trend is bullish). 2. Upcoming high impact economic PCE index reports pose tail-risk volatility.';
      } else if (textToSend.toLowerCase().includes('lot') || textToSend.toLowerCase().includes('risk')) {
        reply = 'Assuming account equity is $105,642.50: A 1% risk allocation is $1,056.42. For a 36 pip stop loss on EURUSD, your calculated lot size should be 2.93 Lots.';
      } else if (textToSend.toLowerCase().includes('news') || textToSend.toLowerCase().includes('economic')) {
        reply = 'High impact PCE index reports are scheduled for release today at 12:30 UTC. Scanner checks show USD crosses will display wide spreads. Recommendation: Pause all automatic execution during the release window.';
      } else {
        reply = `I have scanned the financial markets for "${textToSend}". Active scanner reports show consolidated structures on indices and commodities. Recommend waiting for London open overlays to locate directional displacement.`;
      }

      const aiMsg: Message = {
        id: `msg-ai-${Date.now()}`,
        sender: 'ai',
        text: reply,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, aiMsg]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <div className="p-6 h-[calc(100vh-4rem)] flex flex-col justify-between gap-4">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">AI Assistant</h1>
          <p className="text-xs text-[#94a3b8] mt-1 font-mono">
            COMMAND CENTER BOT • STRATEGY EXPLANATIONS
          </p>
        </div>
      </div>

      {/* Main chat log container */}
      <div className="flex-1 bg-bg-secondary border border-[#1e293b] rounded-2xl p-4 overflow-y-auto no-scrollbar flex flex-col justify-between">
        <div className="space-y-4">
          {messages.map((msg) => {
            const isAI = msg.sender === 'ai';
            return (
              <div
                key={msg.id}
                className={`flex gap-3 max-w-[85%] ${isAI ? 'self-start' : 'self-end flex-row-reverse ml-auto'}`}
              >
                <div className={`w-8.5 h-8.5 rounded-lg flex items-center justify-center shrink-0 ${
                  isAI
                    ? 'bg-brand-600/10 text-brand-400 border border-brand-500/20'
                    : 'bg-bg-elevated text-[#94a3b8] border border-[#1e293b]'
                }`}>
                  {isAI ? <Bot className="w-5 h-5" /> : <User className="w-5 h-5" />}
                </div>

                <div className={`p-4.5 rounded-2xl text-xs leading-relaxed ${
                  isAI
                    ? 'bg-bg-card border border-[#1e293b] text-[#94a3b8]'
                    : 'bg-gradient-to-br from-brand-600 to-brand-500 text-white shadow-glow-sm'
                }`}>
                  <p>{msg.text}</p>
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div className="flex gap-3 max-w-[80%] self-start">
              <div className="w-8.5 h-8.5 rounded-lg bg-brand-600/10 text-brand-400 border border-brand-500/20 flex items-center justify-center shrink-0">
                <Bot className="w-5 h-5" />
              </div>
              <div className="p-4 bg-bg-card border border-[#1e293b] rounded-2xl text-xs text-[#64748b] font-mono flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Thinking...
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Suggestions row */}
        {messages.length === 1 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mt-6 shrink-0">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                onClick={() => handleSend(s)}
                className="p-3 text-left rounded-xl bg-bg-card border border-[#1e293b] text-[#94a3b8] hover:text-white hover:border-[#334155] transition-all hover:bg-bg-hover text-[11px]"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Input container */}
      <div className="shrink-0 flex gap-2">
        <input
          type="text"
          placeholder="Ask AI Strategy Room..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          className="input flex-1 py-3 px-4"
        />
        <button
          onClick={() => handleSend(input)}
          className="btn btn-primary px-5 shrink-0"
        >
          <Send className="w-4.5 h-4.5" />
        </button>
      </div>
    </div>
  );
}
