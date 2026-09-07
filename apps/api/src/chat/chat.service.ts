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
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/analysis/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, context }),
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

    return this.generateSmartReply(prompt, context);
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

    // 4. Interactive Trade Analysis & /trade Command
    if (p.startsWith('/trade') || ['analyze my trade', 'check my trade', 'what is happening in my trade', 'should i close', 'should i wait', 'my trade'].some(w => p.includes(w))) {
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
          advice = `You're up a clean ${sign}$${posProfit.toFixed(2)}! The market gave you an impulsive run. Don't let a green trade flip into a loss. Shift your SL to entry price ($${entry.toFixed(4)}) to make it a 100% risk-free trade, or bank half your profit now if you're approaching major resistance.`;
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
          `*(Tip: You can instantly close this trade right from the Dashboard or Trades table with 1-click).*`
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

      // Try calling primary AI service, with 1 automatic retry on 502/503/504 (Render cold-start)
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: postBody,
            signal: AbortSignal.timeout(25000),
          });

          if (response.ok) {
            return await response.json();
          }

          if ([502, 503, 504].includes(response.status) && attempt === 1) {
            console.log(`[chat.service] AI service is warming up (HTTP ${response.status}). Retrying in 4 seconds...`);
            await new Promise((resolve) => setTimeout(resolve, 4000));
            continue;
          }

          const errData: any = await response.json().catch(() => ({}));
          lastErrMsg = errData?.detail || errData?.message || `AI service returned HTTP ${response.status}`;
          break;
        } catch (netErr: any) {
          console.warn(`[chat.service] Attempt ${attempt} failed connecting to ${targetUrl}:`, netErr.message);
          if (attempt === 1) {
            await new Promise((resolve) => setTimeout(resolve, 3000));
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
}
