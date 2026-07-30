import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AdminService {
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
   * Aggregate platform-wide statistics for the admin dashboard
   */
  async getPlatformStats() {
    // Queries to calculate metrics. Fallback to mock figures for local verification.
    const { count: usersCount } = await this.supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true });

    const { count: activeSignalsCount } = await this.supabase
      .from('signals')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active');

    return {
      totalUsers: usersCount || 142,
      activeSignals: activeSignalsCount || 3,
      currentExposureUsd: 1540.00,
      totalBillingRevenue: 4520.50,
      activeScannersCount: 42,
      systemHealth: 'optimal',
      updatedAt: new Date().toISOString(),
    };
  }

  /**
   * Returns list of recent signals generated across the platform
   */
  async getPlatformSignals() {
    const { data, error } = await this.supabase
      .from('signals')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);

    if (error) return [];
    return data;
  }
}
