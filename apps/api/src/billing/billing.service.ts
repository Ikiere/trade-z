import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class BillingService {
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
   * Initialize Paystack checkout session
   */
  async createCheckoutSession(userId: string, planName: string) {
    // In a live integration, we query Paystack APIs (https://api.paystack.co/transaction/initialize)
    // using axios or fetch, and pass amount, email, callback URLs.
    // For Phase 1D, we return mock payment credentials.
    return {
      checkout_url: 'https://checkout.paystack.com/mock-session-108520',
      reference: `ref-${Date.now()}`,
      plan: planName,
    };
  }

  /**
   * Process billing success webhook callbacks from Paystack.
   * Expects payload: event = 'charge.success', data = { customer: { email }, metadata: { planName } }
   */
  async handleWebhook(payload: any) {
    const event = payload?.event;
    if (event !== 'charge.success') {
      return { status: 'ignored' };
    }

    const email = payload?.data?.customer?.email;
    const planName = payload?.data?.metadata?.plan_name || 'pro_trader';

    // 1. Locate user profile
    const { data: profile, error: findError } = await this.supabase
      .from('profiles')
      .select('id')
      .eq('email', email)
      .single();

    if (findError || !profile) {
      throw new BadRequestException('User profile matching webhook email not found');
    }

    // 2. Update subscription tier
    const { error: updateError } = await this.supabase
      .from('subscriptions')
      .upsert({
        user_id: profile.id,
        plan_name: planName,
        status: 'active',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        updated_at: new Date().toISOString(),
      });

    if (updateError) {
      throw new BadRequestException('Failed to update subscription in database');
    }

    return { status: 'processed', email, planName };
  }
}
