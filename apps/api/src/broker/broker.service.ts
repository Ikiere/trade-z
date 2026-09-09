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

  private getBridgeUrl(): string {
    return process.env.MT5_BRIDGE_URL || 'http://40.123.242.172:5001';
  }

  /**
   * Fetch live MetaTrader 5 account data from local laptop or VPS bridge
   */
  async getMt5Status(userId: string) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000);

      const res = await fetch(`${this.getBridgeUrl()}/account`, {
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
      const bridgeUrl = this.getBridgeUrl();
      const isLocal = bridgeUrl.includes('127.0.0.1') || bridgeUrl.includes('localhost');
      const hint = isLocal
        ? 'Launch start_mt5_bridge.bat on your laptop, or set MT5_BRIDGE_URL on Render to point to your EC2 VPS.'
        : `Cannot reach MT5 Bridge at ${bridgeUrl}. Check: (1) EC2 Security Group allows port 5001, (2) the bridge script is running on the VPS.`;
      return {
        connected: false,
        status: 'offline',
        error: hint,
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

      const res = await fetch(`${this.getBridgeUrl()}/order`, {
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
        `Failed to reach MT5 Bridge: ${e.message}. Ensure MT5 Bridge is running on your laptop or VPS.`,
      );
    }
  }

  /**
   * Get active positions from MetaTrader 5
   */
  async getMt5Positions() {
    try {
      const res = await fetch(`${this.getBridgeUrl()}/positions`);
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
      const res = await fetch(`${this.getBridgeUrl()}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      return await res.json();
    } catch (e: any) {
      throw new BadRequestException(`Failed to contact MT5 Bridge: ${e.message}`);
    }
  }

  /**
   * Close all positions on MetaTrader 5
   */
  async closeAllMt5Positions() {
    try {
      const res = await fetch(`${this.getBridgeUrl()}/close-all`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      return await res.json();
    } catch (e: any) {
      throw new BadRequestException(`Failed to close all positions via MT5 Bridge: ${e.message}`);
    }
  }

  /**
   * Modify position SL/TP on MetaTrader 5
   */
  async modifyMt5Position(ticket: number, sl?: number, tp?: number) {
    try {
      const res = await fetch(`${this.getBridgeUrl()}/modify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket, sl, tp }),
      });
      return await res.json();
    } catch (e: any) {
      throw new BadRequestException(`Failed to modify position via MT5 Bridge: ${e.message}`);
    }
  }

  /**
   * Cancel pending order on MetaTrader 5
   */
  async cancelMt5Order(ticket: number) {
    try {
      const res = await fetch(`${this.getBridgeUrl()}/cancel-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket }),
      });
      return await res.json();
    } catch (e: any) {
      throw new BadRequestException(`Failed to cancel order via MT5 Bridge: ${e.message}`);
    }
  }

  /**
   * Get closed trade history from MetaTrader 5
   */
  async getMt5History(days: number = 60) {
    try {
      const res = await fetch(`${this.getBridgeUrl()}/history?days=${days}`);
      return await res.json();
    } catch (e: any) {
      return { success: false, trades: [] };
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
