import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RiskService } from './risk.service';
import { EmailService } from '../email/email.service';

@Injectable()
export class TradesService {
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private riskService: RiskService,
    private emailService: EmailService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.supabase = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseKey || 'placeholder-key',
    );
  }

  private getBridgeUrl(): string {
    return process.env.MT5_BRIDGE_URL || 'http://127.0.0.1:5001';
  }

  async getOpenTrades(userId: string) {
    const { data, error } = await this.supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'open');

    if (error) return [];
    return data;
  }

  async getTradeHistory(userId: string) {
    const { data, error } = await this.supabase
      .from('trades')
      .select('*')
      .eq('user_id', userId)
      .not('status', 'eq', 'open');

    if (error) return [];
    return data;
  }

  async executeTrade(
    userId: string,
    tradeData: {
      pair: string;
      direction: 'long' | 'short';
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      riskPercent: number;
    },
  ) {
    // 1. Fetch user real portfolio / MT5 balance
    let balance = 10000;
    let equity = 10000;

    // Try fetching live MT5 bridge balance first
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 1200);
      const mt5Res = await fetch(`${this.getBridgeUrl()}/account`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (mt5Res.ok) {
        const mt5Data = (await mt5Res.json()) as any;
        if (mt5Data.connected && mt5Data.account?.equity > 0) {
          balance = Number(mt5Data.account.balance);
          equity = Number(mt5Data.account.equity);
        }
      }
    } catch (_) {
      // Fall back to Supabase portfolio
      const { data: port } = await this.supabase
        .from('portfolios')
        .select('balance, equity')
        .eq('user_id', userId)
        .eq('is_default', true)
        .maybeSingle();

      if (port?.balance) {
        balance = Number(port.balance);
        equity = Number(port.equity || port.balance);
      }
    }

    // 2. Asset-specific pip calculation
    const sym = tradeData.pair.toUpperCase();
    const pipMult = sym.includes('JPY') ? 100 : sym.includes('XAU') || sym.includes('GOLD') ? 10 : sym.includes('BTC') || sym.includes('ETH') ? 1 : 10000;
    const stopLossDistancePips = Math.abs(tradeData.entryPrice - tradeData.stopLoss) * pipMult;

    // Check Global Kill Switch
    if (process.env.TRADING_ENABLED === 'false') {
      throw new BadRequestException('Global Trading Kill Switch is ACTIVE (TRADING_ENABLED=false). Order execution is suspended.');
    }

    // 3. Smart Account Capital Protection (Institutional 0.5% - 2.0% Hard Cap)
    const approxDollarLossFor001 = stopLossDistancePips * (sym.includes('JPY') ? 0.065 : sym.includes('XAU') || sym.includes('GOLD') ? 1.0 : sym.includes('BTC') ? 0.01 : 0.10);
    const effectiveRiskPct = Math.min(Math.max(tradeData.riskPercent || 1.0, 0.5), 2.0);
    const maxAllowedDollarRisk = equity * (effectiveRiskPct / 100.0);

    if (equity > 0 && approxDollarLossFor001 > maxAllowedDollarRisk) {
      throw new BadRequestException(
        `Capital Shield Veto: Broker minimum volume (0.01 lot) risks ~$${approxDollarLossFor001.toFixed(2)} (${((approxDollarLossFor001 / equity) * 100).toFixed(1)}% of equity), exceeding maximum allowed ${effectiveRiskPct.toFixed(1)}% risk ($${maxAllowedDollarRisk.toFixed(2)}) on $${equity.toFixed(2)} equity. Trade blocked to protect capital.`,
      );
    }

    // 4. Run standard risk validation checks
    await this.riskService.validateTrade(
      equity,
      balance,
      stopLossDistancePips,
      tradeData.riskPercent || 1.0,
      5.0, // max daily loss %
      0.0, // current daily loss %
      0,   // current open positions
      5,   // max open positions
    );

    // 5. Compute lot size based on true account equity
    const lotSize = this.riskService.calculateLotSize(
      equity,
      tradeData.riskPercent || 1.0,
      stopLossDistancePips,
    );

    // 6. If local MT5 bridge is active, dispatch order to MetaTrader 5
    let mt5Ticket: any = null;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);
      const mt5OrderRes = await fetch(`${this.getBridgeUrl()}/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair: tradeData.pair,
          direction: tradeData.direction,
          entryPrice: tradeData.entryPrice,
          stopLoss: tradeData.stopLoss,
          takeProfit: tradeData.takeProfit,
          riskPercent: tradeData.riskPercent || 1.0,
          lotSize: lotSize,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      if (mt5OrderRes.ok) {
        const orderJson = (await mt5OrderRes.json()) as any;
        if (orderJson.success) {
          mt5Ticket = orderJson.ticket;
        }
      }
    } catch (_) {
      // MT5 bridge offline; continue logging in database
    }

    // 7. Save to database
    const newTrade = {
      user_id: userId,
      pair: tradeData.pair,
      type: 'market',
      direction: tradeData.direction,
      status: 'open',
      entry_price: tradeData.entryPrice,
      stop_loss: tradeData.stopLoss,
      take_profit: tradeData.takeProfit,
      lot_size: lotSize,
      pnl: 0,
      pips: 0,
      opened_at: new Date().toISOString(),
      broker_id: mt5Ticket ? `MT5-#${mt5Ticket}` : 'trade-z-auto',
    };

    const { data, error } = await this.supabase
      .from('trades')
      .insert(newTrade)
      .select()
      .single();

    if (error) {
      return {
        id: `trade-${Date.now()}`,
        ...newTrade,
        mt5_ticket: mt5Ticket,
      };
    }

    return {
      ...data,
      mt5_ticket: mt5Ticket,
    };
  }

  async shiftToBreakEven(tradeId: string) {
    // Fetch trade
    const { data: trade, error: fetchError } = await this.supabase
      .from('trades')
      .select('*')
      .eq('id', tradeId)
      .single();

    if (fetchError || !trade) {
      throw new NotFoundException('Trade position not found');
    }

    // Shift SL to entry price
    const { data, error } = await this.supabase
      .from('trades')
      .update({ stop_loss: trade.entry_price })
      .eq('id', tradeId)
      .select()
      .single();

    if (error) {
      return { ...trade, stop_loss: trade.entry_price };
    }

    return data;
  }

  async closeTrade(tradeId: string) {
    const { data, error } = await this.supabase
      .from('trades')
      .update({
        status: 'closed',
        closed_at: new Date().toISOString(),
      })
      .eq('id', tradeId)
      .select()
      .single();

    if (error) {
      return { id: tradeId, status: 'closed' };
    }

    return data;
  }

  async createSignal(userId: string, signalData: any) {
    const pair = String(signalData.pair || 'EURUSD').toUpperCase();
    const isJpy = pair.includes('JPY');
    const isGold = pair.includes('XAU') || pair.includes('GOLD');
    const isCrypto = pair.includes('BTC') || pair.includes('ETH');
    const decimals = isJpy ? 3 : isGold || isCrypto ? 2 : 5;
    const pipScale = isJpy ? 0.01 : isGold ? 1.0 : isCrypto ? 10.0 : 0.0001;

    let entryPrice = Number(signalData.entry_price) || 0;
    if (entryPrice <= 0) {
      if (pair.includes('EUR')) entryPrice = 1.0845;
      else if (pair.includes('GBP')) entryPrice = 1.2680;
      else if (isJpy) entryPrice = 154.20;
      else if (isGold) entryPrice = 2850.50;
      else if (pair.includes('BTC')) entryPrice = 88500.0;
      else if (pair.includes('ETH')) entryPrice = 2820.0;
      else entryPrice = 1.0000;
    }
    entryPrice = Number(entryPrice.toFixed(decimals));

    const currentPrice = Number(Number(signalData.current_price || entryPrice).toFixed(decimals));
    const direction: 'long' | 'short' = String(signalData.direction).toLowerCase() === 'short' ? 'short' : 'long';

    let stopLoss = Number(signalData.stop_loss) || 0;
    let takeProfit = Number(signalData.take_profit) || 0;

    const defaultSlDist = isGold ? 6.0 : isJpy ? 0.25 : isCrypto ? 100.0 : 0.0015;
    const defaultTpDist = defaultSlDist * 2.5;

    // Validate and enforce institutional SL & TP levels
    if (direction === 'long') {
      if (stopLoss <= 0 || stopLoss >= entryPrice) {
        stopLoss = entryPrice - defaultSlDist;
      }
      if (takeProfit <= 0 || takeProfit <= entryPrice) {
        const risk = Math.abs(entryPrice - stopLoss);
        takeProfit = entryPrice + (risk * 2.5);
      }
    } else {
      if (stopLoss <= 0 || stopLoss <= entryPrice) {
        stopLoss = entryPrice + defaultSlDist;
      }
      if (takeProfit <= 0 || takeProfit >= entryPrice) {
        const risk = Math.abs(stopLoss - entryPrice);
        takeProfit = entryPrice - (risk * 2.5);
      }
    }

    stopLoss = Number(stopLoss.toFixed(decimals));
    takeProfit = Number(takeProfit.toFixed(decimals));

    let orderType = signalData.order_type;
    if (!orderType) {
      const spread = currentPrice * 0.0003;
      if (direction === 'long') {
        if (Math.abs(entryPrice - currentPrice) <= spread) orderType = 'market';
        else if (entryPrice < currentPrice) orderType = 'buy limit';
        else orderType = 'buy stop';
      } else {
        if (Math.abs(entryPrice - currentPrice) <= spread) orderType = 'market';
        else if (entryPrice > currentPrice) orderType = 'sell limit';
        else orderType = 'sell stop';
      }
    }

    // Strict validation against signals_order_type_check constraint:
    // ('buy limit', 'sell limit', 'buy stop', 'sell stop', 'buy stop limit', 'sell stop limit', 'market')
    const ALLOWED_ORDER_TYPES = new Set([
      'buy limit',
      'sell limit',
      'buy stop',
      'sell stop',
      'buy stop limit',
      'sell stop limit',
      'market',
    ]);
    const normalizedOrderType = String(orderType || '').toLowerCase().trim();
    if (normalizedOrderType === 'buy' || normalizedOrderType === 'sell' || !ALLOWED_ORDER_TYPES.has(normalizedOrderType)) {
      orderType = 'market';
    } else {
      orderType = normalizedOrderType;
    }

    const payload: Record<string, any> = {
      user_id: userId,
      pair: signalData.pair,
      direction,
      status: signalData.status || 'pending',
      entry_price: entryPrice,
      current_price: currentPrice,
      stop_loss: stopLoss,
      take_profit: takeProfit,
      confidence: Number(signalData.confidence) || 75,
      timeframe: signalData.timeframe || '15m',
      order_type: orderType,
    };

    // Optional fields
    if (signalData.ai_reasoning) payload.ai_reasoning = signalData.ai_reasoning;
    if (signalData.strategy) payload.strategy = signalData.strategy;
    if (Array.isArray(signalData.tags)) payload.tags = signalData.tags;

    const { data, error } = await this.supabase
      .from('signals')
      .insert(payload)
      .select()
      .single();

    if (error) {
      // Log the error but return a non-throwing fallback so the scanner loop stays alive
      console.warn('Signal insert warning (non-fatal):', error.message, '| Code:', error.code);
      return { id: `local-${Date.now()}`, ...payload, _saved: false, _error: error.message };
    }

    // Trigger email dispatch in the background
    this.supabase.auth.admin.getUserById(userId).then(({ data: userData }) => {
      const email = userData?.user?.email;
      if (email) {
        // Pass the expected trigger to the email layout if present
        const fullSignal = { ...data, expected_trigger: signalData.expected_trigger };
        this.emailService.sendSignalAlertEmail(email, fullSignal).catch(err => {
          console.error('Error sending signal alert email:', err.message);
        });
      }
    }).catch(err => {
      console.error('Failed to fetch user email for signal alert:', err.message);
    });

    return { ...data, _saved: true };
  }

  async patchSignal(userId: string, signalId: string, updates: Record<string, any>) {
    const allowed = ['order_type', 'status', 'mt5_ticket'];
    const filtered: Record<string, any> = {};
    for (const k of allowed) {
      if (updates[k] !== undefined) filtered[k] = updates[k];
    }

    if (filtered.order_type) {
      const ALLOWED_ORDER_TYPES = new Set([
        'buy limit',
        'sell limit',
        'buy stop',
        'sell stop',
        'buy stop limit',
        'sell stop limit',
        'market',
      ]);
      const norm = String(filtered.order_type).toLowerCase().trim();
      filtered.order_type = (norm === 'buy' || norm === 'sell' || !ALLOWED_ORDER_TYPES.has(norm)) ? 'market' : norm;
    }

    const { data, error } = await this.supabase
      .from('signals')
      .update(filtered)
      .eq('id', signalId)
      .eq('user_id', userId)
      .select()
      .single();
    if (error) {
      console.warn('Signal patch warning:', error.message);
      return null;
    }
    return data;
  }

  async syncMt5Trades(
    userId: string,
    data: {
      closedTrades?: Array<{
        ticket: number;
        symbol: string;
        pair?: string;
        direction: 'long' | 'short';
        volume: number;
        entry_price: number;
        exit_price: number;
        profit: number;
        status: string;
        commission?: number;
        swap?: number;
        comment?: string;
        opened_at?: string;
        closed_at?: string;
      }>;
      account?: {
        balance?: number;
        equity?: number;
      };
    },
  ) {
    const closedList = data.closedTrades || [];
    let synced = 0;

    for (const t of closedList) {
      if (!t.ticket) continue;
      const brokerId = `MT5-#${t.ticket}`;
      let pair = (t.pair || t.symbol || 'EURUSD').toUpperCase();
      if (pair.endsWith('M') && pair.length > 4) pair = pair.slice(0, -1);
      
      const isJpy = pair.includes('JPY');
      const isGold = pair.includes('XAU') || pair.includes('GOLD');
      const pipMult = isJpy ? 100 : isGold ? 10 : 10000;
      const rawDiff = t.direction === 'long' ? (t.exit_price - t.entry_price) : (t.entry_price - t.exit_price);
      const pips = Number((rawDiff * pipMult).toFixed(1));

      const { data: existing } = await this.supabase
        .from('trades')
        .select('id')
        .eq('user_id', userId)
        .eq('broker_id', brokerId)
        .maybeSingle();

      const tradePayload: Record<string, any> = {
        status: t.status || (t.profit >= 0 ? 'take_profit' : 'stopped_out'),
        entry_price: t.entry_price,
        exit_price: t.exit_price,
        pnl: t.profit,
        pips,
        closed_at: t.closed_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      if (existing) {
        await this.supabase
          .from('trades')
          .update(tradePayload)
          .eq('id', existing.id);
        synced++;
      } else {
        const insertPayload = {
          user_id: userId,
          pair,
          type: 'market',
          direction: t.direction || 'long',
          lot_size: t.volume || 0.01,
          stop_loss: 0,
          take_profit: 0,
          broker_id: brokerId,
          opened_at: t.opened_at || new Date().toISOString(),
          ai_reasoning: `Synced from MetaTrader 5 Terminal (Ticket #${t.ticket})`,
          ...tradePayload,
        };
        const { error: insErr } = await this.supabase
          .from('trades')
          .insert(insertPayload);
        if (!insErr) synced++;
      }
    }

    if (data.account && (data.account.balance || data.account.equity)) {
      await this.supabase
        .from('portfolios')
        .update({
          balance: data.account.balance,
          equity: data.account.equity,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', userId)
        .eq('is_default', true);
    }

    return { synced, totalReceived: closedList.length };
  }

  async logManualTrade(
    userId: string,
    data: {
      pair: string;
      direction: 'long' | 'short';
      lotSize: number;
      pnl: number;
    },
  ) {
    // 1. Compute approximate entry/exit prices
    let entry = 1.0845;
    if (data.pair.includes('GBP')) entry = 1.2680;
    if (data.pair.includes('JPY')) entry = 154.20;
    if (data.pair.includes('XAU')) entry = 2350.50;
    if (data.pair.includes('AUD')) entry = 0.6650;
    if (data.pair.includes('CAD')) entry = 1.3620;

    const exit =
      data.direction === 'long'
        ? entry + data.pnl / 10000
        : entry - data.pnl / 10000;

    // 2. Insert trade row
    const { data: newTrade, error: tradeErr } = await this.supabase
      .from('trades')
      .insert({
        user_id: userId,
        pair: data.pair,
        type: 'market',
        direction: data.direction,
        status: 'closed',
        entry_price: entry,
        exit_price: exit,
        stop_loss: parseFloat((entry * 0.99).toFixed(5)),
        take_profit: parseFloat((entry * 1.02).toFixed(5)),
        lot_size: data.lotSize,
        pnl: data.pnl,
        opened_at: new Date(Date.now() - 3600000).toISOString(),
        closed_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (tradeErr) {
      console.error('[logManualTrade] trade insert error:', tradeErr);
      throw new Error(
        `Trade insert failed [${tradeErr.code}]: ${tradeErr.message}`,
      );
    }

    // 3. Fetch or auto-create the user's default portfolio
    let portfolio = null;
    const { data: existing } = await this.supabase
      .from('portfolios')
      .select('*')
      .eq('user_id', userId)
      .eq('is_default', true)
      .maybeSingle();

    if (existing) {
      portfolio = existing;
    } else {
      // Auto-create a default portfolio if the signup trigger missed it
      console.warn(`[logManualTrade] No default portfolio for ${userId}, creating one…`);
      const { data: created } = await this.supabase
        .from('portfolios')
        .insert({
          user_id: userId,
          name: 'Default Portfolio',
          balance: 10000.00,
          equity: 10000.00,
          free_margin: 10000.00,
          is_default: true,
        })
        .select()
        .single();
      portfolio = created;
    }

    // 4. Update portfolio balance
    if (portfolio) {
      const { error: portErr } = await this.supabase
        .from('portfolios')
        .update({
          balance: Number(portfolio.balance) + data.pnl,
          equity: Number(portfolio.equity) + data.pnl,
          today_pnl: Number(portfolio.today_pnl) + data.pnl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', portfolio.id);

      if (portErr) {
        console.error('[logManualTrade] portfolio update error:', portErr);
        // Non-fatal — trade was already saved, just log the warning
      }
    }

    return newTrade;
  }

  async getSentiment(userId: string) {
    const { data: settings } = await this.supabase
      .from('user_settings')
      .select('watchlist')
      .eq('user_id', userId)
      .maybeSingle();

    const watchlist = (settings && Array.isArray(settings.watchlist) && settings.watchlist.length > 0)
      ? settings.watchlist
      : ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'AUDUSD', 'USDCAD'];

    const results = [];
    for (const pair of watchlist) {
      const { data: sigs } = await this.supabase
        .from('signals')
        .select('direction, status')
        .eq('user_id', userId)
        .eq('pair', pair)
        .order('created_at', { ascending: false })
        .limit(20);

      const today = new Date().toISOString().slice(0, 10);
      const str = pair + today;
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
      }
      const deterministicPct = Math.abs(hash % 70) + 15;

      let finalPct = deterministicPct;
      if (sigs && sigs.length > 0) {
        const buys = sigs.filter((s: any) => s.direction === 'long' && s.status !== 'rejected').length;
        const total = sigs.filter((s: any) => s.status !== 'rejected').length;
        if (total > 0) {
          const dbPct = Math.round((buys / total) * 100);
          finalPct = Math.round(dbPct * 0.7 + deterministicPct * 0.3);
        }
      }

      finalPct = Math.max(5, Math.min(95, finalPct));

      let status = 'Neutral';
      let color = 'text-zinc-400';
      let bg = 'bg-zinc-500/10';

      if (finalPct > 80) {
        status = 'Very Bullish';
        color = 'text-emerald-500';
        bg = 'bg-emerald-500/20';
      } else if (finalPct > 60) {
        status = 'Bullish';
        color = 'text-emerald-400';
        bg = 'bg-emerald-500/10';
      } else if (finalPct < 20) {
        status = 'Very Bearish';
        color = 'text-red-500';
        bg = 'bg-red-500/20';
      } else if (finalPct < 40) {
        status = 'Bearish';
        color = 'text-red-400';
        bg = 'bg-red-500/10';
      }

      results.push({
        pair,
        sentiment: finalPct,
        status,
        color,
        bg
      });
    }

    return results;
  }
}

