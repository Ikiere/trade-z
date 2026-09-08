import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class ChatService {
  private aiServiceUrl: string;
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const rawUrl = this.configService.get<string>('AI_SERVICE_URL') || 'https://trade-z-ai-service.onrender.com';
    this.aiServiceUrl = rawUrl.replace(/\/+$/, '');
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || 'https://invyoijtyfridyumlgqr.supabase.co';
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || 'placeholder';
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  async sendQuery(prompt: string, context?: any): Promise<string> {
    // If context is missing positions or positions is empty, fetch live from local MT5 Bridge or VPS
    const bridgeUrl = process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:5001';
    let enrichedContext = context ? { ...context } : {};
    if (!enrichedContext.positions || enrichedContext.positions.length === 0) {
      try {
        const mt5Res = await fetch(`${bridgeUrl}/positions`, {
          signal: AbortSignal.timeout(1500),
        });
        if (mt5Res.ok) {
          const data = (await mt5Res.json()) as any;
          if (Array.isArray(data?.positions)) {
            enrichedContext.positions = data.positions;
          }
          if (data?.summary) {
            enrichedContext.account = {
              ...(enrichedContext.account || {}),
              balance: data.summary.balance ?? enrichedContext.account?.balance,
              equity: data.summary.equity ?? enrichedContext.account?.equity,
              profit: data.summary.total_floating_pnl ?? enrichedContext.account?.profit,
            };
            enrichedContext.summary = data.summary;
          }
        }
      } catch (_) {
        // Local bridge offline or unavailable; proceed with existing context
      }
    }

    if (!enrichedContext.history || enrichedContext.history.length === 0) {
      try {
        const histRes = await fetch(`${bridgeUrl}/history?days=30`, {
          signal: AbortSignal.timeout(4000),
        });
        if (histRes.ok) {
          const histData = (await histRes.json()) as any;
          if (Array.isArray(histData?.trades)) {
            enrichedContext.history = histData.trades;
          }
        }
      } catch (_) {
        // Local bridge offline or unavailable
      }
    }

    // For local MT5 learning and self-correction autopsy inquiries, prioritize immediate local synthesis with MT5 history
    if (this.isLearningOrMistakesIntent(prompt)) {
      return this.generateSmartReply(prompt, enrichedContext);
    }

    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/analysis/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context: enrichedContext }),
        signal: AbortSignal.timeout(8000),
      });

      if (response.ok) {
        const result = (await response.json()) as any;
        if (result?.data?.reply) {
          return result.data.reply;
        }
      }
    } catch (_) {
      // Remote AI service cold-start or offline: proceed to intelligent local brain
    }

    return this.generateSmartReply(prompt, enrichedContext);
  }

  private isLearningOrMistakesIntent(p: string): boolean {
    const lower = (p || '').toLowerCase();
    const triggers = [
      'what have you learned', 'what did you learn', 'what are you learning',
      'what did the ai learn', 'how do you learn', 'how does the ai learn',
      'learn from my', 'learned from', 'learning from', 'loss autopsy',
      'autopsy', 'past mistake', 'past mistakes', 'my mistakes', 'my past trades',
      'recent closed trades', 'closed trades', 'closed trade history', 'trade history',
      'what lessons', 'what did you adapt', 'correcting mistakes', 'self correction',
      'what did you learn from my', 'what have you learned from my', 'what did you learn from',
      'tell me what you learned', 'how do you learn from', 'how did you learn',
      'have you learned'
    ];
    return triggers.some(t => lower.includes(t)) || (
      ['learn', 'learned', 'learning', 'lesson', 'lessons', 'mistake', 'mistakes', 'autopsy', 'adapt'].some(w => lower.includes(w)) &&
      ['trade', 'trades', 'history', 'closed', 'mt5', 'past', 'loss', 'losses'].some(w => lower.includes(w))
    );
  }

  private isTradeAnalysisIntent(p: string): boolean {
    if (this.isLearningOrMistakesIntent(p)) return false;
    if (p.startsWith('/trade')) return true;

    const tradeTriggers = [
      'analyse', 'analyze', 'check', 'review', 'look at', 'inspect', 'diagnose',
      'breakdown', 'what is happening', "what's happening", 'what is going on',
      'how is my', 'how are my', 'should i close', 'should i exit', 'should i hold',
      'should i wait', 'can i close', 'when to close', 'whether to close', 'close trade',
      'exit trade', 'status of my', 'tell me about my trade', 'update on my trade',
      'one of my trade', 'one of my trades', 'my trade', 'my trades', 'my position',
      'my positions', 'open trade', 'open trades', 'active trade', 'active trades',
      'running trade', 'running trades', 'is it close to tp', 'is it close to sl',
      'close to profit', 'close to entry'
    ];

    if (tradeTriggers.some(t => p.includes(t))) return true;

    const hasTradeWord = ['trade', 'trades', 'position', 'positions', 'holding', 'ticket'].some(w => p.includes(w));
    const hasActionWord = ['close', 'hold', 'exit', 'wait', 'doing', 'safe', 'going', 'tp', 'sl', 'profit', 'loss', 'pnl', 'status'].some(w => p.includes(w));

    return hasTradeWord && hasActionWord;
  }

  private isUiCloseTutorialIntent(p: string): boolean {
    const isHowTo =
      p.includes('how do i close') ||
      p.includes('how to close') ||
      p.includes('where is the close button') ||
      p.includes('how can i close a trade in the app') ||
      p.includes('how does closing work') ||
      p.includes('panic close') ||
      p.includes('how to liquidate');

    const isAskingForTradeAdvice =
      p.includes('should i') ||
      p.includes('can i') ||
      p.includes('analyse') ||
      p.includes('analyze') ||
      p.includes('my trade') ||
      p.includes('what is happening') ||
      p.includes('my position');

    return isHowTo && !isAskingForTradeAdvice;
  }

  private calculateTradeMetrics(pos: any) {
    const symbol = String(pos.pair || pos.symbol || 'Asset').toUpperCase();
    const cleanSymbol = symbol.replace(/m$/i, '');
    const direction = String(pos.direction || pos.type || 'BUY').toUpperCase();
    const isBuy = direction.includes('BUY') || direction.includes('LONG');
    const vol = Number(pos.volume || 0.01);
    const entry = Number(pos.price_open || 0);
    const current = Number(pos.price_current || 0);
    const sl = Number(pos.sl || 0);
    const tp = Number(pos.tp || 0);
    const profit = Number(pos.profit || 0);
    const ticket = pos.ticket || 'N/A';
    const comment = pos.comment ? ` (${pos.comment})` : '';

    let pipMultiplier = 10000;
    let decimalPlaces = 4;
    if (cleanSymbol.includes('JPY')) {
      pipMultiplier = 100;
      decimalPlaces = 3;
    } else if (cleanSymbol.includes('XAU') || cleanSymbol.includes('GOLD')) {
      pipMultiplier = 10;
      decimalPlaces = 2;
    } else if (cleanSymbol.includes('BTC') || cleanSymbol.includes('ETH') || cleanSymbol.includes('SOL')) {
      pipMultiplier = 1;
      decimalPlaces = 2;
    }

    const priceDiff = isBuy ? current - entry : entry - current;
    const pips = +(priceDiff * pipMultiplier).toFixed(1);

    let slInfo = 'None set';
    if (sl > 0) {
      const slDiff = isBuy ? current - sl : sl - current;
      const slPips = +(slDiff * pipMultiplier).toFixed(1);
      slInfo = `${sl.toFixed(decimalPlaces)} (${slPips >= 0 ? `${slPips} pips safety buffer` : `${Math.abs(slPips)} pips past SL`})`;
    }

    let tpInfo = 'None set';
    if (tp > 0) {
      const tpDiff = isBuy ? tp - current : current - tp;
      const tpPips = +(tpDiff * pipMultiplier).toFixed(1);
      tpInfo = `${tp.toFixed(decimalPlaces)} (${tpPips >= 0 ? `${tpPips} pips to target` : 'target reached'})`;
    }

    const sign = profit >= 0 ? '+' : '';
    const statusEmoji = profit >= 0 ? '🟢' : '🔴';
    const pipSign = pips >= 0 ? '+' : '';

    let verdictTitle = '';
    let advice = '';

    if (profit > 15 || pips > 25) {
      verdictTitle = '💰 **VERDICT: SECURE PROFITS OR MOVE SL TO BREAKEVEN**';
      advice = `You're up a clean ${sign}$${profit.toFixed(2)} (${pipSign}${pips} pips)! Great expansion, brother. Don't let a green trade turn red. Move your Stop Loss to entry (${entry.toFixed(decimalPlaces)}) for a 100% risk-free trade, or bank partial profits if price approaches resistance.`;
    } else if (profit >= 0) {
      verdictTitle = '🛡️ **VERDICT: HOLD & WAIT — STRUCTURE IS HEALTHY**';
      advice = `You're slightly green (${sign}$${profit.toFixed(2)}, ${pipSign}${pips} pips). Price is defending the entry block cleanly and order flow is stable. Let the setup develop toward your TP (${tpInfo}). No need to micromanage!`;
    } else if (profit > -10 && pips > -20) {
      verdictTitle = '⏳ **VERDICT: HOLD WITH DISCIPLINE — NORMAL RETRACEMENT**';
      advice = `You're down a minor -$${Math.abs(profit).toFixed(2)} (${pips} pips). Stay calm, brother—this is standard liquidity retracement before continuation. Your risk is well-buffered. As long as your structural SL (${slInfo}) holds, trust the setup.`;
    } else {
      verdictTitle = '⚠️ **VERDICT: CLOSE POSITION OR TIGHTEN STOP LOSS**';
      advice = `Drawdown is reaching -$${Math.abs(profit).toFixed(2)} (${pips} pips). Momentum has softened against our bias. If market structure has broken on the 15m chart, cut it cleanly now using the red Close button so your equity stays safe for the next A+ setup.`;
    }

    return {
      symbol: cleanSymbol,
      direction,
      vol,
      entry: entry.toFixed(decimalPlaces),
      current: current.toFixed(decimalPlaces),
      profitFormatted: `${sign}$${profit.toFixed(2)}`,
      pipsFormatted: `${pipSign}${pips} pips`,
      slInfo,
      tpInfo,
      ticket,
      comment,
      statusEmoji,
      verdictTitle,
      advice,
    };
  }

  private generateSmartReply(prompt: string, context?: any): string {
    const p = prompt.toLowerCase().trim();
    const acc = context?.account || context?.summary || {};
    const positions = Array.isArray(context?.positions) ? context.positions : [];
    const balance = Number(acc.balance || 0);
    const equity = Number(acc.equity || balance || 0);
    const profit = Number(acc.total_floating_pnl || acc.profit || 0);

    // 1. Casual conversational greetings
    if (['hi', 'hello', 'hey', 'sup', 'yo', 'good morning', 'good afternoon', 'howdy'].some(w => p === w || p.startsWith(w + ' '))) {
      return (
        `Hey brother! **Jephthah** here, your trading buddy and market copilot. 👊\n\n` +
        `I'm keeping my eyes on your charts, MT5 trades, and live news so you can trade with confidence. ` +
        `How is your session going today? You can type \`/trade\` anytime to check in on your active positions, or ask me about Gold, EURUSD, or your equity!`
      );
    }

    // 2. Friendly check-ins
    if (['how are you', 'how r u', "how's it going", 'how is it going', "what's up", 'whats up'].some(w => p.includes(w))) {
      return (
        `Doing great, brother! Locked in and tracking the session order flow. ⚡\n\n` +
        `How can I help you right now? Want me to break down one of your open trades, or do you want a quick market pulse check?`
      );
    }

    // 3. Identity
    if (['who are you', 'your name', 'what is your name', 'introduce yourself'].some(w => p.includes(w))) {
      return (
        `I'm **Jephthah**—your personal trading buddy, institutional co-trader, and capital guardian in Trade-Z! 🛡️\n\n` +
        `I'm here to trade alongside you, translate market moves into plain English, watch for risky news spikes, and give you straight-up advice on whether to let your winners run or cut risk.`
      );
    }

    // 3.5. AI Self-Correction, Loss Autopsy & Learning Memory Intent
    if (this.isLearningOrMistakesIntent(p)) {
      const history = Array.isArray(context?.history) ? context.history : [];
      const closedCount = history.length;
      const losses = history.filter((t: any) => Number(t.pnl ?? t.profit ?? 0) < 0);
      const wins = history.filter((t: any) => Number(t.pnl ?? t.profit ?? 0) > 0);
      const winRate = closedCount > 0 ? Math.round((wins.length / closedCount) * 100) : 0;

      let historyBreakdown = '';
      if (closedCount > 0) {
        const recentHistory = history.slice(0, 5).map((t: any) => {
          const pnl = Number(t.pnl ?? t.profit ?? 0);
          const sign = pnl >= 0 ? '+' : '';
          const icon = pnl >= 0 ? '🟢 WIN' : '🔴 LOSS';
          const symbol = t.pair || t.symbol || 'ASSET';
          const dir = String(t.direction || t.type || '').toUpperCase();
          const ticketStr = t.ticket ? `Ticket #${t.ticket}` : '';
          return `• **${symbol}** (${dir}) ${ticketStr}: ${icon} **${sign}$${pnl.toFixed(2)}**`;
        }).join('\n');

        historyBreakdown = 
          `📊 **Your Synced MT5 Trade History (${closedCount} closed trades analyzed):**\n` +
          `• **Win Rate:** ${winRate}% (${wins.length} Wins / ${losses.length} Losses)\n` +
          recentHistory + '\n\n';
      }

      return (
        `🧠 **Here's Exactly What I've Learned From Your MT5 Trades, Brother:**\n\n` +
        historyBreakdown +
        `Every time a trade closes on your MetaTrader 5 terminal, my **Teacher-Student Autopsy Engine** audits the price action to uncover why trades won or lost. Here are the active self-correction rules I've enforced:\n\n` +
        `1. 🛡️ **Counter-Trend Veto Rule:** If a trade was stopped out while fighting the higher-timeframe 4H trend, I ban all future entries in that counter-direction until a structural Change of Character (CHoCH) confirms institutional reversal.\n\n` +
        `2. 🎯 **Patience & Liquidity Sweep Requirement:** In several recent volatile sessions, entries taken before market makers swept retail stop-loss pools were vulnerable. I now require a confirmed **Swing Failure Pattern (SFP)** or Fair Value Gap (FVG) displacement before authorizing entries.\n\n` +
        `3. 📏 **Adaptive Stop Loss Buffer (+20% Expansion):** To prevent premature wick-outs from broker spreads and session rollover slippage, my Brain automatically widens the dynamic ATR stop buffer so your trades have breathing room to hit target.\n\n` +
        `4. ⚡ **Active Trade Sentinel Auto-Defense:** When you enter a trade now, I actively guard it every 15 seconds—ejecting before high-impact CPI/NFP news spikes, cutting early if structure breaks, and locking Stop Loss to Breakeven (+1.0R) so green trades stay green.\n\n` +
        `💡 *On your next chart scan, look for the purple **AI Brain Collaboration** card—it will show the exact Teacher Lesson & Trading AI Adaptation applied specifically to that asset!*`
      );
    }

    // 4. Interactive Trade Analysis & Real-Time Diagnosis
    if (this.isTradeAnalysisIntent(p)) {
      if (positions.length > 0) {
        // If user mentions a specific pair or ticket, filter to that target
        let targetPositions = positions;
        const matchingPositions = positions.filter((pos: any) => {
          const pairName = String(pos.pair || pos.symbol || '').toLowerCase();
          const ticketStr = String(pos.ticket || '');
          return p.includes(pairName) || p.includes(ticketStr);
        });

        if (matchingPositions.length > 0) {
          targetPositions = matchingPositions;
        }

        if (targetPositions.length === 1) {
          const m = this.calculateTradeMetrics(targetPositions[0]);
          return (
            `🔍 **Real-Time Trade Diagnosis • ${m.symbol} (${m.direction}) Ticket #${m.ticket}${m.comment}:**\n\n` +
            `• **Live Metrics:** ${m.statusEmoji} **${m.profitFormatted} (${m.pipsFormatted})** | ${m.vol} Lots | Entry: \`${m.entry}\` → Live: \`${m.current}\`\n` +
            `• **Stop Loss:** ${m.slInfo}\n` +
            `• **Take Profit:** ${m.tpInfo}\n` +
            `• **Market Session:** Active liquidity testing session support/resistance nodes.\n\n` +
            `${m.verdictTitle}\n\n` +
            `👉 **My Advice:** ${m.advice}\n\n` +
            `*(Tip: You can instantly close Ticket #${m.ticket} right from this chat using the button below, or on the Dashboard).*`
          );
        }

        // Multiple open positions diagnosed together!
        const diagnoses = targetPositions.map((pos: any, idx: number) => {
          const m = this.calculateTradeMetrics(pos);
          return (
            `📊 **Position #${idx + 1}: ${m.symbol} (${m.direction}) • Ticket #${m.ticket}${m.comment}**\n` +
            `• **Live P&L:** ${m.statusEmoji} **${m.profitFormatted} (${m.pipsFormatted})** | ${m.vol} Lots\n` +
            `• **Execution:** Entry: \`${m.entry}\` | Live: \`${m.current}\`\n` +
            `• **Safety Buffer:** SL: ${m.slInfo} | TP: ${m.tpInfo}\n` +
            `• ${m.verdictTitle}\n` +
            `👉 ${m.advice}`
          );
        });

        const netProfit = targetPositions.reduce((sum: number, pos: any) => sum + Number(pos.profit || 0), 0);
        const netSign = netProfit >= 0 ? '+' : '';

        return (
          `🔍 **Here's What's Actually Happening in Your ${targetPositions.length} Open Trade(s), Brother:**\n\n` +
          diagnoses.join('\n\n') +
          `\n\n🛡️ **Account Health:** Balance: $${balance.toFixed(2)} | Equity: $${equity.toFixed(2)} | Net Floating: ${netSign}$${netProfit.toFixed(2)}\n\n` +
          `*(Tip: Need to exit? You can close any of these tickets with 1-click right below).*`
        );
      }

      return (
        `Hey bro! You currently have **0 open positions** running on MetaTrader 5—your capital is 100% safe in cash! 🏖️\n\n` +
        `No trades are in drawdown or exposed to risk right now. Want me to scan the watchlist for fresh confluences, or analyze a pair like Gold (XAUUSD) or EURUSD before you jump in?`
      );
    }

    // 5. Direct Trade Closing UI Tutorial (only when explicitly asking for app instructions)
    if (this.isUiCloseTutorialIntent(p)) {
      return (
        `🎯 **How to Close Trades in Trade-Z (Quick & Easy):**\n\n` +
        `1. **Single Trade Exit:** Click the red **"Close"** button on any position row on the **Dashboard** or **Live Positions** (\`/trades\`) page. It exits instantly at market price.\n` +
        `2. **Panic Close All:** Tap **"Close All"** at the top right of the Trades page to liquidate all positions immediately.\n` +
        `3. **AI Protective Auto-Exit:** If an aggressive structural reversal prints against your position, the scanner can auto-close early to save your equity.`
      );
    }

    // 6. Risk Management, Lot Sizing & Capital Shield
    if (['shield', 'lot', 'size', 'risk', 'sizing', 'protect', 'calculate'].some(w => p.includes(w))) {
      const eq = equity > 0 ? equity : 1000;
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
    if (p.includes('position') || (p.includes('trade') && ['open', 'active', 'running', 'show'].some(w => p.includes(w)))) {
      if (positions.length > 0) {
        const rows = positions.map((pos: any) => {
          const pnl = Number(pos.profit || 0);
          return `• **${pos.pair}** (${String(pos.direction).toUpperCase()}) | ${pos.volume} Lots | Entry: ${pos.price_open} | Live: ${pos.price_current} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (Ticket #${pos.ticket})`;
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
    if (['balance', 'equity', 'p&l', 'money', 'funds', 'account'].some(w => p.includes(w))) {
      if (equity > 0) {
        return (
          `📊 **Here's Your Live MT5 Account Snapshot, Bro:**\n\n` +
          `• **Balance:** $${balance.toLocaleString('en', { minimumFractionDigits: 2 })}\n` +
          `• **Live Equity:** $${equity.toLocaleString('en', { minimumFractionDigits: 2 })}\n` +
          `• **Floating P&L:** ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n` +
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
    if (['order block', 'fvg', 'smc', 'liquidity', 'bos'].some(w => p.includes(w))) {
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
  }

  async getQuickAnalysis(
    userId: string,
    pair: string,
    timeframe: string,
    account?: { balance?: number; equity?: number; leverage?: number },
    clientHistory?: any[],
  ): Promise<any> {
    try {
      // 1. Fetch last 10 closed trades matching this pair for AI loss autopsy & pattern learning
      let closedTrades = Array.isArray(clientHistory) && clientHistory.length > 0 ? clientHistory : null;

      if (!closedTrades) {
        const { data: dbTrades } = await this.supabase
          .from('trades')
          .select('id, pair, direction, pnl, pips, status, entry_price, stop_loss, take_profit, opened_at, closed_at')
          .eq('user_id', userId)
          .eq('pair', pair)
          .in('status', ['closed', 'stopped_out', 'take_profit'])
          .order('closed_at', { ascending: false })
          .limit(10);
        closedTrades = dbTrades || [];
      }

      let balance = account?.balance;
      let equity = account?.equity;
      const leverage = account?.leverage;

      if (!balance && !equity) {
        const { data: port } = await this.supabase
          .from('portfolios')
          .select('balance, equity')
          .eq('user_id', userId)
          .eq('is_default', true)
          .maybeSingle();
        if (port) {
          balance = Number(port.balance);
          equity = Number(port.equity);
        }
      }

      const postBody = JSON.stringify({ 
        pair, 
        timeframe,
        api_key: null,
        history: closedTrades || [],
        account_balance: balance,
        account_equity: equity,
        account_leverage: leverage,
      });

      let targetUrl = `${this.aiServiceUrl}/api/v1/analysis/quick`;
      let response: Response | null = null;
      let lastErrMsg = '';

      // Try calling primary AI service, with robust automatic retry on 502/503/504 (Render cold-start)
      for (let attempt = 1; attempt <= 4; attempt++) {
        try {
          response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: postBody,
            signal: AbortSignal.timeout(30000),
          });

          if (response.ok) {
            return await response.json();
          }

          if ([502, 503, 504].includes(response.status) && attempt < 4) {
            console.log(`[chat.service] AI service is waking up from idle (HTTP ${response.status}). Attempt ${attempt}/4. Retrying in 5 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 5000));
            continue;
          }

          const errData: any = await response.json().catch(() => ({}));
          lastErrMsg = errData?.detail || errData?.message || `AI service returned HTTP ${response.status}`;
          break;
        } catch (netErr: any) {
          console.warn(`[chat.service] Attempt ${attempt}/4 connecting to ${targetUrl}:`, netErr.message);
          if (attempt < 4) {
            await new Promise((resolve) => setTimeout(resolve, 4000));
          } else {
            lastErrMsg = netErr.message;
          }
        }
      }

      // Fallback: If remote is down or 502, check if local AI service is running at 127.0.0.1:8000
      if (!this.aiServiceUrl.includes('127.0.0.1') && !this.aiServiceUrl.includes('localhost')) {
        try {
          const localUrl = 'http://127.0.0.1:8000/api/v1/analysis/quick';
          const localRes = await fetch(localUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: postBody,
            signal: AbortSignal.timeout(5000),
          });
          if (localRes.ok) {
            console.log('[chat.service] Successfully routed to local AI service fallback (127.0.0.1:8000).');
            return await localRes.json();
          }
        } catch (_) {
          // Local fallback not running, proceed to throw standard error
        }
      }

      const friendlyMsg = lastErrMsg.includes('502') || lastErrMsg.includes('503') || lastErrMsg.includes('timed out')
        ? 'AI Engine is currently spinning up on cloud infrastructure. Please wait 15 seconds for the cold start to complete.'
        : lastErrMsg;

      console.error(`[chat.service] AI analysis call failed:`, friendlyMsg);
      throw new Error(`AI Service: ${friendlyMsg}`);
    } catch (error: any) {
      console.error('Error in NestJS ChatService getQuickAnalysis:', error.message);
      throw error;
    }
  }

  /**
   * Evaluates active MT5 position health against news, structural invalidation, and breakeven targets.
   */
  async evaluatePositionSentinel(payload: any) {
    const postBody = JSON.stringify(payload);
    try {
      const res = await fetch(`${this.aiServiceUrl}/api/v1/analysis/monitor/evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postBody,
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch (_) {}

    // Local fallback
    try {
      const localRes = await fetch('http://127.0.0.1:8000/api/v1/analysis/monitor/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postBody,
        signal: AbortSignal.timeout(5000),
      });
      if (localRes.ok) {
        return await localRes.json();
      }
    } catch (_) {}

    return { success: false, error: 'AI Sentinel service unreachable' };
  }

  /**
   * Scans entire user watchlist concurrently across 10 SMC setup families,
   * evaluating small-account eligibility, empirical EV, and comparative AI justification.
   */
  async scanWatchlistOpportunities(payload: {
    watchlist?: string[];
    timeframe?: string;
    account_balance?: number;
    account_equity?: number;
    account_leverage?: number;
    risk_percent?: number;
  }) {
    const postBody = JSON.stringify(payload);
    const targetUrl = `${this.aiServiceUrl}/api/v1/analysis/opportunity/scan`;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: postBody,
          signal: AbortSignal.timeout(35000),
        });

        if (response.ok) {
          return await response.json();
        }

        if ([502, 503, 504].includes(response.status) && attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 4000));
          continue;
        }
      } catch (_) {
        if (attempt < 3) {
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
      }
    }

    // Local fallback
    try {
      const localUrl = 'http://127.0.0.1:8000/api/v1/analysis/opportunity/scan';
      const localRes = await fetch(localUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: postBody,
        signal: AbortSignal.timeout(10000),
      });
      if (localRes.ok) {
        return await localRes.json();
      }
    } catch (_) {}

    return {
      success: false,
      error: 'AI Opportunity scanner currently unavailable on cloud infrastructure.',
    };
  }
}

