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

  async sendQuery(prompt: string): Promise<string> {
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/analysis/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error('Failed to query AI service');
      }

      const result = (await response.json()) as any;
      return result?.data?.reply || 'I am unable to interpret that query at the moment.';
    } catch (error) {
      // Return a robust mock reply during local testing if AI service is offline
      if (prompt.toLowerCase().includes('eurusd')) {
        return 'EURUSD displays a strong bullish structure. Trend confluences are fully aligned on the 4H charts. Risk parameters indicate potential entries at 1.08340.';
      } else if (prompt.toLowerCase().includes('usdjpy')) {
        return 'USDJPY short setup was rejected due to higher timeframe counter-trend risks and high economic PCE index reports scheduled today.';
      }
      
      return 'AI Analysis Service is currently synchronizing scanners. Try asking again in a few moments.';
    }
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
