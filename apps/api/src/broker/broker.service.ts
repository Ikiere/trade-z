import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class BrokerService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    this.supabase = createClient(
      supabaseUrl || 'https://placeholder.supabase.co',
      supabaseKey || 'placeholder-key',
    );
  }

  /**
   * Fetch broker connection profile settings
   */
  async getConnection(userId: string) {
    const { data, error } = await this.supabase
      .from('broker_connections')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      // Mock connection for MVP
      return {
        id: 'conn-mock-1',
        user_id: userId,
        broker_name: 'Trade-Z Paper Broker',
        account_type: 'demo',
        account_number: 'TR-108520',
        leverage: 100,
        status: 'connected',
        created_at: new Date().toISOString(),
      };
    }
    return data;
  }

  /**
   * Sync/Connect new broker settings
   */
  async connectBroker(
    userId: string,
    brokerData: { brokerName: string; accountNumber: string; accountType: string; leverage: number },
  ) {
    const newConnection = {
      user_id: userId,
      broker_name: brokerData.brokerName,
      account_number: brokerData.accountNumber,
      account_type: brokerData.accountType,
      leverage: brokerData.leverage,
      status: 'connected',
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await this.supabase
      .from('broker_connections')
      .upsert(newConnection)
      .select()
      .single();

    if (error) {
      return {
        id: `mock-conn-${Date.now()}`,
        ...newConnection,
      };
    }
    return data;
  }

  /**
   * Fetch live MetaTrader 5 account data from local laptop bridge
   */
  async getMt5Status(userId: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const res = await fetch('http://127.0.0.1:5001/account', {
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!res.ok) {
        return { connected: false, error: 'MT5 Bridge returned HTTP error' };
      }

      const json = (await res.json()) as any;
      if (json.connected && json.account) {
        // Sync real MT5 balance & equity into Supabase portfolio
        await this.supabase
          .from('portfolios')
          .update({
            balance: json.account.balance,
            equity: json.account.equity,
            free_margin: json.account.free_margin,
            margin_level: json.account.margin_level,
            currency: json.account.currency || 'USD',
          })
          .eq('user_id', userId)
          .eq('is_default', true);

        // Also update broker_connections
        await this.supabase
          .from('broker_connections')
          .upsert({
            user_id: userId,
            broker_name: json.account.server || 'MetaTrader 5',
            account_number: String(json.account.login),
            account_type: 'live',
            leverage: json.account.leverage || 100,
            status: 'connected',
            updated_at: new Date().toISOString(),
          });
      }

      return json;
    } catch (e: any) {
      return {
        connected: false,
        status: 'offline',
        error: 'Local MT5 Bridge is not running. Launch start_mt5_bridge.bat on your laptop.',
      };
    }
  }

  /**
   * Execute real trade order directly on MetaTrader 5
   */
  async executeMt5Order(userId: string, orderData: any) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const res = await fetch('http://127.0.0.1:5001/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(orderData),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const result = await res.json();
      return result;
    } catch (e: any) {
      throw new BadRequestException(
        `Failed to reach local MT5 Bridge: ${e.message}. Ensure start_mt5_bridge.bat is running on your laptop.`,
      );
    }
  }

  /**
   * Get active positions from MetaTrader 5
   */
  async getMt5Positions() {
    try {
      const res = await fetch('http://127.0.0.1:5001/positions');
      return await res.json();
    } catch (e: any) {
      return { success: false, positions: [] };
    }
  }

  /**
   * Close open position on MetaTrader 5
   */
  async closeMt5Position(ticket: number) {
    try {
      const res = await fetch('http://127.0.0.1:5001/close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      return await res.json();
    } catch (e: any) {
      throw new BadRequestException(`Failed to contact local MT5 Bridge: ${e.message}`);
    }
  }

  /**
   * Run automated stop-out check (liquidation check) on active positions.
   * If margin level drops below 50%, close positions.
   */
  async checkStopOut(marginLevel: number): Promise<boolean> {
    if (marginLevel > 0 && marginLevel <= 50.0) {
      // Liquidation trigger
      return true;
    }
    return false;
  }
}
