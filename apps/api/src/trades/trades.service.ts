import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { RiskService } from './risk.service';

@Injectable()
export class TradesService {
  private supabase: SupabaseClient;

  constructor(
    private configService: ConfigService,
    private riskService: RiskService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.supabase = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseKey || 'placeholder-key',
    );
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
    // 1. Fetch user settings for limits
    // In a live system, we would query the `user_settings` and `portfolios` tables in Supabase.
    // For Phase 1C, we fetch placeholders or query Supabase with fallbacks.
    const balance = 100000; // default test balance
    const stopLossDistancePips = Math.abs(tradeData.entryPrice - tradeData.stopLoss) * 10000;

    // 2. Run risk checks
    await this.riskService.validateTrade(
      balance,
      balance,
      stopLossDistancePips,
      tradeData.riskPercent,
      5.0, // max daily loss %
      0.0, // current daily loss %
      0,   // current open positions
      5,   // max open positions
    );

    // 3. Compute lot size
    const lotSize = this.riskService.calculateLotSize(
      balance,
      tradeData.riskPercent,
      stopLossDistancePips,
    );

    // 4. Save to database
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
    };

    const { data, error } = await this.supabase
      .from('trades')
      .insert(newTrade)
      .select()
      .single();

    if (error) {
      // Mock result during local test if Supabase is offline
      return {
        id: `mock-trade-${Date.now()}`,
        ...newTrade,
      };
    }

    return data;
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
}
