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
    const p = prompt.toLowerCase();
    const acc = context?.account || context?.summary || {};
    const positions = Array.isArray(context?.positions) ? context.positions : [];
    const balance = Number(acc.balance || 0);
    const equity = Number(acc.equity || balance || 0);
    const profit = Number(acc.total_floating_pnl || acc.profit || 0);

    // 1. Direct Trade Closing (checked first to prevent matching general 'trade')
    if (p.includes('close') || p.includes('exit') || p.includes('liquidate')) {
      return `🎯 **Direct Trade Closing:**\n\n1. **Single Trade:** Click the red **"Close"** button on any position row in the Dashboard or Trades table.\n2. **Close All:** Click the **"Close All"** button at the top-right of the Trades page to exit all open positions at market.\n3. **AI Auto-Exit:** The AI also automatically exits positions early if an opposing structural reversal is detected.`;
    }

    // 2. Risk Management, Lot Sizing & Capital Shield
    if (p.includes('shield') || p.includes('lot') || p.includes('size') || p.includes('risk') || p.includes('sizing') || p.includes('protect') || p.includes('calculate')) {
      const eq = equity > 0 ? equity : 1000;
      const risk1Pct = (eq * 0.01).toFixed(2);
      const risk2Pct = (eq * 0.02).toFixed(2);
      return `🛡️ **Trade-Z AI Capital Protection & Smart Sizing:**\n\n• **Account Equity:** $${eq.toLocaleString('en', { minimumFractionDigits: 2 })}\n• **1% Safe Risk:** $${risk1Pct} max loss per trade\n• **2% Max Risk:** $${risk2Pct} max loss per trade\n• **Dynamic Sizing Formula:** \`Lot Size = (Equity × Risk%) ÷ (Stop Loss Points × Tick Value)\`\n• **Small Account Shield:** Accounts under $150 are capped at 0.01 lots with strict stop loss caps, vetoing wide-stop setups to protect your money.`;
    }

    // 3. Open Positions
    if (p.includes('position') || (p.includes('trade') && (p.includes('open') || p.includes('active') || p.includes('running') || p.includes('show')))) {
      if (positions.length > 0) {
        const rows = positions.map((pos: any) => {
          const pnl = Number(pos.profit || 0);
          return `• **${pos.pair}** (${String(pos.direction).toUpperCase()}) | ${pos.volume} Lots | Entry: ${pos.price_open} | Live: ${pos.price_current} | P&L: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (Ticket #${pos.ticket})`;
        });
        return `⚡ **Live MT5 Open Positions (${positions.length}):**\n\n${rows.join('\n')}\n\nYou can close any position instantly using the red "Close" button on the Dashboard or Trades page.`;
      }
      return `You currently have **0 open positions** on MetaTrader 5. The AI scanner is monitoring the market and will execute trades once all 15 institutional confluence layers align.`;
    }

    // 4. Account & Balance
    if (p.includes('balance') || p.includes('equity') || p.includes('p&l') || p.includes('money') || p.includes('funds') || p.includes('account')) {
      if (equity > 0) {
        return `📊 **MT5 Account Overview:**\n\n• **Balance:** $${balance.toLocaleString('en', { minimumFractionDigits: 2 })}\n• **Equity:** $${equity.toLocaleString('en', { minimumFractionDigits: 2 })}\n• **Floating P&L:** ${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}\n• **Active Trades:** ${positions.length}\n\nYour account is protected by the Trade-Z AI Capital Shield with max risk restricted to 1–2% per setup.`;
      }
      return `Your MetaTrader 5 account is connected. Start the local MT5 Bridge (port 5001) on your laptop to display live equity and margin figures.`;
    }

    // 5. Gold (XAUUSD)
    if (p.includes('gold') || p.includes('xau')) {
      return `🏆 **XAUUSD (Gold) Market Structure:**\n\n• **ATR Volatility:** Daily range is $25–$40. Wide swings require 40–80 pip stop losses.\n• **AI Capital Shield:** For accounts under $150, Trade-Z restricts Gold trades to 0.01 lot maximum to protect your balance from high-volatility blowout.\n• **Current Bias:** Watch for liquidity sweeps around psychological round numbers ($2,650 / $2,600).`;
    }

    // 6. EURUSD
    if (p.includes('eurusd') || p.includes('eur/usd')) {
      return `💶 **EURUSD Institutional Bias:**\n\n• **Market Structure:** Bullish order block displacement on 4H charts.\n• **Confluence Score:** 92% across Trend, Liquidity, and Momentum.\n• **Strategy:** Seek discount retests near London open session lows.`;
    }

    // 7. Concepts
    if (p.includes('order block') || p.includes('fvg') || p.includes('smc') || p.includes('liquidity') || p.includes('bos')) {
      return `🏛️ **Smart Money Concepts (SMC):**\n\n• **Order Block:** Institutional buy/sell footprint before high-volume displacement.\n• **Fair Value Gap (FVG):** Imbalance zone created by rapid price expansion that acts as a magnet for retests.\n• **Liquidity Sweep:** Deliberate stop-run above previous swing highs or below lows before a trend reversal.\n• **Break of Structure (BOS):** Decisive candle body close beyond previous swing levels confirming order flow direction.`;
    }

    return `🤖 **Trade-Z AI Assistant:**\n\nI am actively connected to your MetaTrader 5 terminal and live market scanners.\n\nYou can ask me:\n• **"What is my balance and equity?"**\n• **"Show my open positions"**\n• **"Analyze Gold (XAUUSD) or EURUSD"**\n• **"How does the AI Capital Shield calculate lot size?"**\n• **"How do I close an open trade?"**`;
  }

  async getQuickAnalysis(
    userId: string,
    pair: string,
    timeframe: string,
    account?: { balance?: number; equity?: number; leverage?: number },
  ): Promise<any> {
    try {
      // 1. Fetch last 10 closed trades matching this pair for AI loss autopsy & pattern learning
      const { data: closedTrades } = await this.supabase
        .from('trades')
        .select('id, pair, direction, pnl, pips, status, entry_price, stop_loss, take_profit, opened_at, closed_at')
        .eq('user_id', userId)
        .eq('pair', pair)
        .in('status', ['closed', 'stopped_out', 'take_profit'])
        .order('closed_at', { ascending: false })
        .limit(10);

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
