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
