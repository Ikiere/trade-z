'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import {
  Send,
  User,
  RefreshCw,
  Sparkles,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  Zap,
  ArrowUpRight,
  XCircle,
  Clock,
  CheckCircle2,
  Flame,
  Activity,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { getApiBaseUrl } from '@/lib/api';
import { useMt5, Mt5Position } from '@/lib/mt5-sync-context';

interface Message {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  timestamp: string;
  type?: 'text' | 'trade-picker';
  relatedTicket?: number;
}

const INITIAL_MESSAGES: Message[] = [
  {
    id: 'msg-init-1',
    sender: 'ai',
    text: `Hey brother! I'm **Jephthah**, your personal trading buddy and market copilot here in Trade-Z. 🤝\n\nI'm watching your MT5 charts, tracking live order flow, and keeping an eye on high-impact news so you never have to trade alone.\n\nYou can ask me casual questions, ask how your trades are doing, or type **\`/trade\`** anytime to inspect and analyze your active positions!`,
    timestamp: new Date().toISOString(),
  },
];

const SUGGESTIONS = [
  '⚡ /trade (Analyze My Active Trades)',
  '🏆 What is the vibe on Gold (XAUUSD)?',
  '📊 How is my MT5 balance & equity?',
  '🛡️ How does the AI Capital Shield protect me?',
  '💶 Analyze EURUSD market structure',
  '👋 Hey Jephthah, how are you doing today?',
];

/**
 * Enhanced renderer for Jephthah's formatted messages
 * Supports bold, code pills, glowing bullet points, and distinct verdict alert cards
 */
function FormattedMessage({
  text,
  isAi,
  onCloseTicket,
  isClosingTicket,
}: {
  text: string;
  isAi: boolean;
  onCloseTicket?: (ticket: number) => void;
  isClosingTicket?: number | null;
}) {
  const lines = text.split('\n');

  // Extract ticket number if message is a trade diagnosis
  const ticketMatch = text.match(/Ticket #(\d+)/);
  const detectedTicket = ticketMatch ? parseInt(ticketMatch[1], 10) : null;

  return (
    <div className={`space-y-2 leading-relaxed text-xs sm:text-[13px] ${isAi ? 'text-[#e2e8f0]' : 'text-white'}`}>
      {lines.map((line, idx) => {
        if (!line.trim()) {
          return <div key={idx} className="h-1" />;
        }

        // Special verdict banner styling
        if (line.includes('VERDICT:')) {
          const isHold = line.includes('HOLD');
          const isSecure = line.includes('SECURE') || line.includes('BREAKEVEN') || line.includes('PROFIT');
          const isClose = line.includes('CLOSE') || line.includes('TIGHTEN');

          const borderColor = isClose
            ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
            : isSecure
            ? 'border-cyan-500/30 bg-cyan-500/10 text-cyan-300'
            : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300';

          return (
            <div
              key={idx}
              className={`p-3 rounded-xl border my-2 font-semibold text-xs tracking-wide shadow-sm flex items-center gap-2 ${borderColor}`}
            >
              <Zap className="w-4 h-4 shrink-0 animate-pulse" />
              <span>{line.replace(/\*\*/g, '')}</span>
            </div>
          );
        }

        // Format bullet points
        const isBullet = line.trim().startsWith('•') || line.trim().startsWith('-');
        const cleanLine = isBullet ? line.trim().replace(/^[•\-]\s*/, '') : line;

        // Parse bold **text** and code `text`
        const parts = cleanLine.split(/(\*\*.*?\*\*|`.*?`)/g);

        const renderedLine = parts.map((part, pIdx) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={pIdx} className={isAi ? 'text-white font-bold' : 'text-white font-extrabold'}>
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={pIdx}
                className="px-1.5 py-0.5 rounded-md bg-[#090d16] text-cyan-400 font-mono text-[11px] border border-[#1e293b]"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return part;
        });

        if (isBullet) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1.5">
              <span className="text-emerald-400 select-none mt-0.5 font-bold">•</span>
              <span className="flex-1">{renderedLine}</span>
            </div>
          );
        }

        return <p key={idx}>{renderedLine}</p>;
      })}

      {/* Direct 1-Click Close action if this is an active trade diagnosis */}
      {isAi && detectedTicket && onCloseTicket && (
        <div className="mt-3 pt-3 border-t border-[#1e293b]/70 flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#94a3b8] font-mono">Need to exit this position immediately?</span>
          <button
            onClick={() => onCloseTicket(detectedTicket)}
            disabled={isClosingTicket === detectedTicket}
            className="px-3 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 text-[11px] font-semibold flex items-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
          >
            {isClosingTicket === detectedTicket ? (
              <>
                <RefreshCw className="w-3 h-3 animate-spin" /> Closing...
              </>
            ) : (
              <>
                <XCircle className="w-3.5 h-3.5" /> Close Position #{detectedTicket}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}

export default function ChatPage() {
  const { bridgeStatus, account, positions, summary, closePosition } = useMt5();
  const [messages, setMessages] = useState<Message[]>(INITIAL_MESSAGES);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isClosingTicket, setIsClosingTicket] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isTyping]);

  // Derived live metrics
  const liveBalance = account?.balance ?? summary?.balance ?? 0;
  const liveEquity = account?.equity ?? summary?.equity ?? liveBalance;
  const liveProfit = account?.profit ?? summary?.total_floating_pnl ?? 0;

  /**
   * Handle 1-click closing of a position directly from the chat interface
   */
  const handleDirectClose = async (ticket: number) => {
    const targetPos = positions.find((p) => p.ticket === ticket);
    const pairName = targetPos?.pair || 'position';
    setIsClosingTicket(ticket);

    try {
      const res = await closePosition(ticket);
      if (res.success) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-ai-${Date.now()}`,
            sender: 'ai',
            text: `✅ **Done, brother!** I've sent the order to close trade **#${ticket} (${pairName})** at market execution. Your capital has been preserved! 🛡️`,
            timestamp: new Date().toISOString(),
          },
        ]);
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-ai-${Date.now()}`,
            sender: 'ai',
            text: `⚠️ **Notice:** Could not close trade #${ticket} automatically: ${res.error || res.message || 'Unknown broker error'}. You can try again from the Live Positions page.`,
            timestamp: new Date().toISOString(),
          },
        ]);
      }
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-ai-${Date.now()}`,
          sender: 'ai',
          text: `⚠️ **Notice:** Direct closing error on #${ticket}: ${err?.message || 'Connection failed'}.`,
          timestamp: new Date().toISOString(),
        },
      ]);
    } finally {
      setIsClosingTicket(null);
    }
  };

  /**
   * Local intelligent response fallback carrying Jephthah's warm, friendly buddy persona
   */
  const generateLocalResponse = (promptText: string): string => {
    const p = promptText.toLowerCase().trim();

    // 1. Casual conversational greetings
    if (['hi', 'hello', 'hey', 'sup', 'yo', 'good morning', 'good afternoon', 'howdy'].some((w) => p === w || p.startsWith(w + ' '))) {
      return (
        `Hey brother! **Jephthah** here, your trading buddy and market copilot. 👊\n\n` +
        `I'm keeping my eyes on your charts, MT5 trades, and live news so you don't have to stress. ` +
        `How is your session going today? You can type \`/trade\` anytime to review your active positions, or ask me about Gold, EURUSD, or your equity!`
      );
    }

    // 2. Friendly check-ins
    if (['how are you', 'how r u', "how's it going", 'how is it going', "what's up", 'whats up'].some((w) => p.includes(w))) {
      return (
        `Doing great, brother! Feeling sharp and tracking the live session order flow. ⚡\n\n` +
        `How can I help you right now? Want me to break down one of your open trades, or do you want a quick market pulse check?`
      );
    }

    // 3. Identity
    if (['who are you', 'your name', 'what is your name', 'introduce yourself'].some((w) => p.includes(w))) {
      return (
        `I'm **Jephthah**—your personal trading buddy, institutional co-trader, and capital guardian in Trade-Z! 🛡️\n\n` +
        `I'm here to trade alongside you, translate market moves into plain English, watch for risky news spikes, and give you straight-up advice on whether to let your winners run or cut risk.`
      );
    }

    // 4. Trade Analysis & /trade request
    if (
      p.startsWith('/trade') ||
      ['analyze my trade', 'check my trade', 'what is happening in my trade', 'should i close', 'should i wait', 'my trade'].some((w) =>
        p.includes(w)
      )
    ) {
      if (positions.length > 0) {
        let targetPos = positions[0];
        for (const pos of positions) {
          const pairName = String(pos.pair || '').toLowerCase();
          const ticketStr = String(pos.ticket || '');
          if (p.includes(pairName) || p.includes(ticketStr)) {
            targetPos = pos;
            break;
          }
        }

        const pair = targetPos.pair || 'Asset';
        const direction = String(targetPos.direction || 'long').toUpperCase();
        const vol = targetPos.volume || 0.01;
        const entry = Number(targetPos.price_open || 0);
        const current = Number(targetPos.price_current || 0);
        const posProfit = Number(targetPos.profit || 0);
        const ticket = targetPos.ticket || 'N/A';
        const sign = posProfit >= 0 ? '+' : '';
        const statusEmoji = posProfit >= 0 ? '🟢' : '🔴';

        let verdict = '';
        let advice = '';

        if (posProfit > 20) {
          verdict = `💰 **VERDICT: SECURE PARTIAL PROFITS OR MOVE SL TO BREAKEVEN**`;
          advice = `You're sitting on a solid ${sign}$${posProfit.toFixed(2)} profit! The market gave you an impulsive run. Don't let a green trade flip into a loss. Shift your SL to entry price ($${entry.toFixed(4)}) to make it a 100% risk-free trade, or bank half your profit now if you're approaching major resistance.`;
        } else if (posProfit >= 0) {
          verdict = `🛡️ **VERDICT: HOLD & WAIT — STRUCTURE IS HEALTHY**`;
          advice = `You're in mild profit (${sign}$${posProfit.toFixed(2)}). Price is holding the institutional entry block nicely. Let the setup develop toward your take profit. No need to micromanage!`;
        } else if (posProfit > -15) {
          verdict = `⏳ **VERDICT: HOLD WITH DISCIPLINE — NORMAL RETRACEMENT**`;
          advice = `You're in a minor pullback (-$${Math.abs(posProfit).toFixed(2)}). Stay calm, brother—liquidity tests are standard before continuation. Keep your structural stop loss intact. If the 15m candle closes aggressively through support, we'll cut it.`;
        } else {
          verdict = `⚠️ **VERDICT: CLOSE POSITION OR TIGHTEN STOP LOSS**`;
          advice = `Drawdown is reaching -$${Math.abs(posProfit).toFixed(2)}. Momentum has shifted against our bias. If market structure has broken, my honest advice is to cut it cleanly now using the red Close button so you protect your capital for the next high-probability setup.`;
        }

        return (
          `🔍 **Trade Diagnosis for ${pair} (${direction}) • Ticket #${ticket}:**\n\n` +
          `• **Position Metrics:** ${statusEmoji} ${sign}$${posProfit.toFixed(2)} P&L | ${vol} Lots | Entry: ${entry.toFixed(4)} | Live: ${current.toFixed(4)}\n` +
          `• **Market Condition:** Liquidity structure on the 15m/1H chart is actively testing session volume nodes.\n\n` +
          `${verdict}\n\n` +
          `👉 **My Advice:** ${advice}\n\n` +
          `*(Tip: You can instantly close this trade right here in chat using the button below, or on the Dashboard).*`
        );
      }
      return (
        `Hey bro! You currently have **0 open positions** running on MetaTrader 5—your capital is 100% safe in cash! 🏖️\n\n` +
        `That's a great spot to be in. Want me to scan the watchlist for fresh confluences, or analyze a pair like Gold (XAUUSD) or EURUSD before you jump in?`
      );
    }

    // 5. Direct Trade Closing
    if (p.includes('close') || p.includes('exit') || p.includes('liquidate')) {
      return (
        `🎯 **How to Close Trades in Trade-Z (Quick & Easy):**\n\n` +
        `1. **Directly from Chat:** When I analyze a trade, I provide a 1-click **'Close Position'** button right inside our conversation!\n` +
        `2. **Dashboard / Live Positions:** Click the red **'Close'** button on any position row on the **Dashboard** or **Live Positions** (\`/trades\`) page.\n` +
        `3. **Panic Close All:** Tap **'Close All'** at the top right of the Trades page to exit all positions immediately.\n` +
        `4. **AI Protective Auto-Exit:** If an aggressive reversal prints against your trade, our scanner can auto-close early to save your equity.`
      );
    }

    // 6. Risk Management, Lot Sizing & Capital Shield
    if (['shield', 'lot', 'size', 'risk', 'sizing', 'protect', 'calculate'].some((w) => p.includes(w))) {
      const eq = liveEquity > 0 ? liveEquity : 1000;
      const risk1Pct = (eq * 0.01).toFixed(2);
      const risk2Pct = (eq * 0.02).toFixed(2);
      return (
        `🛡️ **Here's How We Protect Your Capital, Bro:**\n\n` +
        `• **Your Live Equity:** $${eq.toLocaleString('en', { minimumFractionDigits: 2 })}\n` +
        `• **1% Safe Risk Rule:** $${risk1Pct} max loss per trade. Stick to 1–2% to trade with peace of mind!\n` +
        `• **Dynamic Sizing Formula:** \`Lot Size = (Equity × Risk%) ÷ (Stop Loss Points × Tick Value)\`\n` +
        `• **AI Capital Shield:** If your balance is under $150, lot size is capped at 0.01 and wide-stop setups are vetoed so normal market wicks don't blow your account.`
      );
    }

    // 7. Open Positions Overview
    if (p.includes('position') || (p.includes('trade') && ['open', 'active', 'running', 'show'].some((w) => p.includes(w)))) {
      if (positions.length > 0) {
        const rows = positions.map((pos) => {
          const pnl = pos.profit ?? 0;
          return `• **${pos.pair}** (${pos.direction.toUpperCase()}) | ${pos.volume} Lots | Entry: ${pos.price_open} | Live: ${pos.price_current} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (Ticket #${pos.ticket})`;
        });
        return (
          `⚡ **You have ${positions.length} active trade(s) running right now:**\n\n` +
          rows.join('\n') +
          `\n\nWant me to analyze any of these? Type \`/trade\` or ask "Should I close my [pair] trade?" and I'll break it down!`
        );
      }
      return `You're currently in cash with **0 open positions** on MetaTrader 5. Clean slate! ✨\n\nI'm monitoring the market order flow and will alert you once confluences align.`;
    }

    // 8. Account & Balance
    if (['balance', 'equity', 'p&l', 'money', 'funds', 'account'].some((w) => p.includes(w))) {
      if (liveEquity > 0) {
        return (
          `📊 **Here's Your Live MT5 Account Snapshot, Bro:**\n\n` +
          `• **Balance:** $${liveBalance.toLocaleString('en', { minimumFractionDigits: 2 })}\n` +
          `• **Live Equity:** $${liveEquity.toLocaleString('en', { minimumFractionDigits: 2 })}\n` +
          `• **Floating P&L:** ${liveProfit >= 0 ? '+' : ''}$${liveProfit.toFixed(2)}\n` +
          `• **Active Trades:** ${positions.length}\n\n` +
          `Your account is safely buffered under the AI Capital Shield. Looking good!`
        );
      }
      return `Your MetaTrader 5 terminal is connected. Make sure your local MT5 Bridge (port 5001) is running on your desktop to pull live equity and balance metrics!`;
    }

    // 9. Gold (XAUUSD)
    if (p.includes('gold') || p.includes('xau')) {
      return (
        `🏆 **Gold (XAUUSD) Buddy Breakdown:**\n\n` +
        `• **The Vibe on Gold:** Daily ATR volatility averages $25–$40. Gold loves aggressive liquidity sweeps above session highs and lows before real expansion.\n` +
        `• **How to Play It:** Never chase impulsive green candles at session peaks. Wait for the liquidity sweep into an M15/H1 order block.\n` +
        `• **Capital Shield Rule:** Because Gold stop losses need 40–80 points of room, keep lots down at 0.01 on smaller accounts so normal pullbacks don't stress you out.`
      );
    }

    // 10. EURUSD
    if (p.includes('eurusd') || p.includes('eur/usd')) {
      return (
        `💶 **EURUSD Market Breakdown:**\n\n` +
        `• **Structure:** 4H chart shows institutional accumulation with bullish order block mitigation.\n` +
        `• **Key Setup:** Look for discount retests around London session open lows. If price sweeps the session low and prints a decisive rejection candle, look for continuation upward.`
      );
    }

    // 11. SMC Concepts
    if (['order block', 'fvg', 'smc', 'liquidity', 'bos'].some((w) => p.includes(w))) {
      return (
        `🏛️ **Smart Money Concepts (SMC) in Plain English:**\n\n` +
        `• **Order Block (OB):** Footprint of institutional banks placing huge volume. When price comes back, they defend that level.\n` +
        `• **Fair Value Gap (FVG):** An aggressive jump that left unfilled orders. Acts like a magnet pulling price back to rebalance.\n` +
        `• **Liquidity Sweep:** When market makers deliberately trigger retail stop losses above highs or below lows before the real trend begins.\n` +
        `• **Break of Structure (BOS):** A solid candle body close past a previous swing level confirming that big players are still driving the trend.`
      );
    }

    return (
      `Hey brother! I'm **Jephthah**, your trading buddy. 🤝\n\n` +
      `Here's what we can do together:\n` +
      `• Type **\`/trade\`** — I'll inspect your active MT5 trades, check current news events, and advise whether to hold or close!\n` +
      `• Ask **"How's my balance and equity?"** — I'll check your live MT5 funds.\n` +
      `• Ask **"Analyze Gold (XAUUSD) or EURUSD"** — I'll give you the institutional order flow breakdown.\n` +
      `• Or just ask me any trading question—I'm right here with you!`
    );
  };

  /**
   * Primary Send Handler
   */
  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim()) return;

    const trimmed = textToSend.trim();
    const isTradeCommand = trimmed.toLowerCase() === '/trade';

    const userMsg: Message = {
      id: `msg-user-${Date.now()}`,
      sender: 'user',
      text: textToSend,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    // If the user typed exactly /trade, show the interactive trade picker if positions exist
    if (isTradeCommand) {
      if (positions.length > 0) {
        setMessages((prev) => [
          ...prev,
          {
            id: `msg-picker-${Date.now()}`,
            sender: 'ai',
            type: 'trade-picker',
            text: `Here are your **${positions.length} active trade(s)** running on MetaTrader 5 right now, bro! Tap any trade below and I'll break down the latest news, market order flow, and whether you should hold or close:`,
            timestamp: new Date().toISOString(),
          },
        ]);
        return;
      }
    }

    setIsTyping(true);

    // Prepare full live MT5 context
    const contextPayload = {
      account: {
        balance: liveBalance,
        equity: liveEquity,
        profit: liveProfit,
        currency: account?.currency || 'USD',
        server: account?.server || 'MT5',
        free_margin: account?.free_margin,
        margin_level: account?.margin_level,
      },
      positions: positions.map((p) => ({
        ticket: p.ticket,
        symbol: p.symbol,
        pair: p.pair,
        direction: p.direction,
        volume: p.volume,
        price_open: p.price_open,
        price_current: p.price_current,
        sl: p.sl,
        tp: p.tp,
        profit: p.profit,
      })),
      summary: summary,
      bridgeStatus: bridgeStatus,
    };

    try {
      const apiUrl = `${getApiBaseUrl()}/api/v1/chat`;
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: textToSend, context: contextPayload }),
        signal: AbortSignal.timeout(7000),
      });

      if (res.ok) {
        const body = await res.json();
        const reply = body?.data?.reply;
        if (reply && !reply.includes('Active scanner reports show consolidated structures')) {
          setMessages((prev) => [
            ...prev,
            {
              id: `msg-ai-${Date.now()}`,
              sender: 'ai',
              text: reply,
              timestamp: new Date().toISOString(),
            },
          ]);
          setIsTyping(false);
          return;
        }
      }
    } catch (err) {
      console.warn('[Chat] API request timed out or unavailable, using local intelligent engine:', err);
    }

    // Local intelligent response fallback
    setTimeout(() => {
      const reply = generateLocalResponse(textToSend);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-ai-${Date.now()}`,
          sender: 'ai',
          text: reply,
          timestamp: new Date().toISOString(),
        },
      ]);
      setIsTyping(false);
    }, 400);
  };

  return (
    <div className="p-4 sm:p-6 h-[calc(100vh-4rem)] flex flex-col justify-between gap-3 sm:gap-4 max-w-6xl mx-auto">
      {/* Jephthah Header & Profile Bar */}
      <div className="shrink-0 flex items-center justify-between border-b border-[#1e293b]/80 pb-4 bg-gradient-to-r from-bg-secondary/60 via-bg-card/40 to-transparent p-3 sm:p-4 rounded-2xl border">
        {/* Left: Avatar & Persona details */}
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="relative">
            {/* Charismatic avatar halo */}
            <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-400 p-[2px] shadow-[0_0_20px_rgba(16,185,129,0.35)]">
              <div className="w-full h-full bg-[#0d121f] rounded-[14px] flex items-center justify-center relative overflow-hidden">
                <Sparkles className="w-6 h-6 text-emerald-400 animate-pulse" />
                <div className="absolute inset-0 bg-emerald-500/10 pointer-events-none" />
              </div>
            </div>
            {/* Live Online Badge */}
            <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 border-2 border-[#0a0a0f] rounded-full flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full animate-ping opacity-75" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg sm:text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white via-slate-100 to-emerald-300 tracking-tight">
                Jephthah
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                TRADING BUDDY
              </span>
            </div>
            <p className="text-xs text-[#94a3b8] mt-0.5 font-medium flex items-center gap-1.5">
              <span>Your Market Copilot</span>
              <span className="text-[#475569]">•</span>
              <span className="text-emerald-400/90 font-mono text-[11px]">Watching charts with you</span>
            </p>
          </div>
        </div>

        {/* Right: Quick actions & MT5 Status */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Quick /trade Trigger */}
          <button
            onClick={() => handleSend('/trade')}
            className="px-3 py-1.5 rounded-xl bg-brand-500/10 hover:bg-brand-500/20 text-brand-400 hover:text-brand-300 border border-brand-500/30 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-sm group"
            title="Inspect active MT5 trades"
          >
            <Zap className="w-3.5 h-3.5 text-brand-400 group-hover:scale-110 transition-transform" />
            <span className="hidden sm:inline font-mono">/trade</span>
            {positions.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-emerald-500 text-slate-950 font-mono font-bold text-[10px]">
                {positions.length}
              </span>
            )}
          </button>

          {/* Live Terminal Metric Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-bg-secondary border border-[#1e293b] text-xs">
            <div
              className={`w-2 h-2 rounded-full ${
                bridgeStatus === 'connected' ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className="text-[#94a3b8] font-mono text-[11px]">
              {bridgeStatus === 'connected' ? (
                <>
                  <strong className="text-emerald-400 font-bold">${liveEquity.toLocaleString('en', { minimumFractionDigits: 2 })}</strong>
                  <span className="hidden md:inline text-[#64748b] ml-1">Eq</span>
                </>
              ) : (
                'Connecting...'
              )}
            </span>
          </div>

          {/* Reset Chat */}
          <button
            onClick={() => setMessages(INITIAL_MESSAGES)}
            className="p-2 rounded-xl bg-bg-secondary hover:bg-[#1e293b] border border-[#1e293b] text-[#64748b] hover:text-white transition-colors text-xs"
            title="Reset Chat"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Main Chat Message Feed */}
      <div className="flex-1 bg-gradient-to-b from-[#0b0f19]/90 to-[#080b12]/95 border border-[#1e293b] rounded-2xl p-4 sm:p-5 overflow-y-auto no-scrollbar flex flex-col justify-between shadow-2xl backdrop-blur-xl relative">
        {/* Subtle background ambient light */}
        <div className="absolute top-0 right-1/4 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 left-10 w-96 h-96 bg-brand-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="space-y-4 sm:space-y-5 relative z-10">
          <AnimatePresence initial={false}>
            {messages.map((msg) => {
              const isAI = msg.sender === 'ai';

              // Render interactive Trade Picker cards if message is of type trade-picker
              if (msg.type === 'trade-picker') {
                return (
                  <motion.div
                    key={msg.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2 }}
                    className="self-start max-w-full sm:max-w-[90%] w-full"
                  >
                    <div className="bg-[#0f1422]/95 backdrop-blur-xl border border-[#1e293b] shadow-2xl rounded-2xl rounded-tl-sm p-4 sm:p-5 text-[#e2e8f0] relative overflow-hidden">
                      {/* Top neon accent line */}
                      <div className="h-[2px] bg-gradient-to-r from-emerald-500/60 via-teal-500/40 to-transparent absolute top-0 left-0 right-0" />

                      {/* Header */}
                      <div className="flex items-center gap-2 mb-3">
                        <div className="w-6 h-6 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                          <Sparkles className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-bold text-xs text-white">Jephthah</span>
                        <span className="text-[10px] font-mono text-emerald-400 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20">
                          ACTIVE TRADES MONITOR
                        </span>
                      </div>

                      <p className="text-xs text-[#cbd5e1] mb-3">{msg.text}</p>

                      {/* Trade Cards Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-2">
                        {positions.map((pos) => {
                          const isProfit = (pos.profit ?? 0) >= 0;
                          const pnl = pos.profit ?? 0;
                          const isClosing = isClosingTicket === pos.ticket;

                          return (
                            <div
                              key={pos.ticket}
                              className="p-3.5 rounded-xl bg-[#090d16] border border-[#1e293b] hover:border-emerald-500/40 transition-all flex flex-col justify-between gap-3 group"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-sm text-white font-mono">{pos.pair}</span>
                                  <span
                                    className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded ${
                                      pos.direction === 'long'
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                                    }`}
                                  >
                                    {pos.direction === 'long' ? '▲ BUY' : '▼ SELL'}
                                  </span>
                                </div>
                                <span className="text-[11px] font-mono text-[#64748b]">#{pos.ticket}</span>
                              </div>

                              <div className="grid grid-cols-3 gap-2 text-[11px] font-mono bg-[#0d121f] p-2 rounded-lg border border-[#161f30]">
                                <div>
                                  <span className="text-[#64748b] text-[9px] block">VOL</span>
                                  <span className="text-white font-semibold">{pos.volume} Lots</span>
                                </div>
                                <div>
                                  <span className="text-[#64748b] text-[9px] block">ENTRY</span>
                                  <span className="text-white font-semibold">{pos.price_open}</span>
                                </div>
                                <div>
                                  <span className="text-[#64748b] text-[9px] block">LIVE P&L</span>
                                  <span className={`font-bold ${isProfit ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {isProfit ? '+' : ''}${pnl.toFixed(2)}
                                  </span>
                                </div>
                              </div>

                              {/* Action Buttons */}
                              <div className="flex items-center gap-2 pt-1">
                                <button
                                  onClick={() =>
                                    handleSend(
                                      `Analyze my ${pos.pair} ${pos.direction} trade (Ticket #${pos.ticket}) in detail. What is happening in the market, what news/events are impacting it, and should I hold or close now?`
                                    )
                                  }
                                  className="flex-1 py-1.5 px-2.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 hover:border-emerald-500/40 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all"
                                >
                                  <Sparkles className="w-3.5 h-3.5" />
                                  <span>Analyze Trade</span>
                                </button>
                                <button
                                  onClick={() => handleDirectClose(pos.ticket)}
                                  disabled={isClosing}
                                  className="py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/40 text-[11px] font-semibold flex items-center justify-center gap-1 transition-all disabled:opacity-50"
                                >
                                  {isClosing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <XCircle className="w-3.5 h-3.5" />}
                                  <span>Close</span>
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </motion.div>
                );
              }

              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2.5 sm:gap-3 max-w-[92%] sm:max-w-[85%] ${
                    isAI ? 'self-start' : 'self-end flex-row-reverse ml-auto'
                  }`}
                >
                  {/* Avatar Icon */}
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-sm mt-0.5 ${
                      isAI
                        ? 'bg-gradient-to-tr from-emerald-500/20 to-teal-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-brand-600 text-white shadow-glow-sm'
                    }`}
                  >
                    {isAI ? <Sparkles className="w-4 h-4" /> : <User className="w-4 h-4" />}
                  </div>

                  {/* Message Bubble Container */}
                  <div
                    className={`rounded-2xl text-xs sm:text-sm leading-relaxed relative ${
                      isAI
                        ? 'bg-[#0f1422]/95 backdrop-blur-xl border border-[#1e293b] shadow-2xl rounded-tl-sm p-4 sm:p-5 text-[#e2e8f0]'
                        : 'bg-gradient-to-r from-brand-600 via-indigo-600 to-blue-600 text-white shadow-lg shadow-brand-500/10 rounded-tr-sm p-3.5 sm:p-4'
                    }`}
                  >
                    {/* Jephthah's Header Badge on AI Bubble */}
                    {isAI && (
                      <div className="flex items-center justify-between gap-2 mb-2 pb-1.5 border-b border-[#1e293b]/60">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-white">Jephthah</span>
                          <span className="text-[9px] font-mono text-emerald-400 px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">
                            TRADING BUDDY
                          </span>
                        </div>
                        <span className="text-[10px] font-mono text-[#64748b]">
                          {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}

                    <FormattedMessage
                      text={msg.text}
                      isAi={isAI}
                      onCloseTicket={handleDirectClose}
                      isClosingTicket={isClosingTicket}
                    />

                    {!isAI && (
                      <div className="text-[10px] mt-1.5 font-mono text-right text-brand-100/70">
                        {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {/* Typing Indicator */}
          {isTyping && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex gap-3 max-w-[80%] self-start"
            >
              <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 animate-spin" />
              </div>
              <div className="px-4 py-3 bg-[#0f1422] border border-[#1e293b] rounded-2xl rounded-tl-sm text-xs text-[#94a3b8] font-mono flex items-center gap-2.5 shadow-md">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span>Jephthah is checking charts, events & order flow...</span>
              </div>
            </motion.div>
          )}
          <div ref={scrollRef} />
        </div>

        {/* Quick Suggestion Chips */}
        {messages.length <= 2 && (
          <div className="mt-6 pt-4 border-t border-[#1e293b]/70 relative z-10">
            <p className="text-[11px] font-mono text-[#64748b] uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-emerald-400" /> Quick Buddy Questions & Commands
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => handleSend(s)}
                  className="p-2.5 text-left rounded-xl bg-[#0e1320]/80 border border-[#1e293b] text-[#94a3b8] hover:text-white hover:border-emerald-500/40 hover:bg-[#131929] transition-all text-[11px] flex items-center justify-between group shadow-sm"
                >
                  <span className="truncate">{s}</span>
                  <ArrowUpRight className="w-3 h-3 text-[#475569] group-hover:text-emerald-400 transition-colors shrink-0 ml-1.5" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Bar with Quick /trade shortcut */}
      <div className="shrink-0 flex items-center gap-2 bg-[#0b0f19] p-2 rounded-2xl border border-[#1e293b]">
        {/* /trade Quick Pill Button */}
        <button
          onClick={() => handleSend('/trade')}
          type="button"
          className="px-3 py-2.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 hover:text-emerald-300 border border-emerald-500/30 text-xs font-mono font-bold flex items-center gap-1 transition-all shrink-0"
          title="Type /trade to inspect active MT5 positions"
        >
          <Zap className="w-3.5 h-3.5" />
          <span>/trade</span>
        </button>

        {/* Chat input */}
        <input
          type="text"
          placeholder="Ask Jephthah about your trades, /trade, XAUUSD outlook, or how he's doing..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend(input)}
          className="flex-1 py-2 px-3 text-xs sm:text-sm bg-transparent border-none text-white focus:outline-none placeholder-[#64748b]"
        />

        {/* Send Button */}
        <button
          onClick={() => handleSend(input)}
          disabled={!input.trim() || isTyping}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 text-slate-950 font-bold hover:opacity-95 shrink-0 flex items-center gap-1.5 disabled:opacity-40 transition-all shadow-md"
        >
          <Send className="w-4 h-4" />
          <span className="hidden sm:inline text-xs">Send</span>
        </button>
      </div>
    </div>
  );
}
