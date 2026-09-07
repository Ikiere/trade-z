import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class AuthService {
  private supabase: SupabaseClient;

  constructor(private configService: ConfigService) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL');
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      console.warn('⚠️ Supabase credentials not configured. Auth will not work.');
      // Create a placeholder client to prevent crashes during development
      this.supabase = createClient(
        supabaseUrl || 'https://placeholder.supabase.co',
        supabaseKey || 'placeholder-key',
      );
    } else {
      this.supabase = createClient(supabaseUrl, supabaseKey);
    }
  }

  async signUp(email: string, password: string, fullName: string) {
    try {
      const { data, error } = await this.supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: fullName },
        },
      });

      if (error) {
        const rawMsg = error.message?.trim();
        const msg = (!rawMsg || rawMsg === '{}')
          ? 'Registration failed due to database constraint. Please check your details or contact support.'
          : rawMsg;
        throw new BadRequestException(msg);
      }

      // Auto-provision profile & settings if user was created
      if (data?.user?.id) {
        const uid = data.user.id;
        try {
          await this.supabase.from('user_profiles').upsert({
            user_id: uid,
            display_name: fullName || email.split('@')[0],
          }, { onConflict: 'user_id' });

          await this.supabase.from('user_settings').upsert({
            user_id: uid,
            trading_mode: 'fully_automatic',
            default_lot_size: 0.01,
            daily_signal_limit: 2,
            watchlist: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD'],
          }, { onConflict: 'user_id' });

          await this.supabase.from('portfolios').insert({
            user_id: uid,
            name: 'Default Portfolio',
            balance: 10000.00,
            equity: 10000.00,
            free_margin: 10000.00,
            is_default: true,
          });
        } catch (provErr) {
          console.warn('[AuthService] Profile auto-provision note:', provErr);
        }
      }

      return data;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      const rawMsg = err?.message?.trim();
      const msg = (!rawMsg || rawMsg === '{}')
        ? 'Unable to complete signup at this time. Please try again in a few moments.'
        : rawMsg;
      throw new BadRequestException(msg);
    }
  }

  async signIn(email: string, password: string) {
    const { data, error } = await this.supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
    return data;
  }

  async signOut(accessToken: string) {
    const { error } = await this.supabase.auth.admin.signOut(accessToken);
    if (error) throw error;
  }

  async getUser(accessToken: string) {
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error) throw error;
    return data.user;
  }

  async resetPassword(email: string) {
    const { error } = await this.supabase.auth.resetPasswordForEmail(email);
    if (error) throw error;
  }

  async updatePassword(accessToken: string, newPassword: string) {
    // This would need to be called with the user's session
    const { error } = await this.supabase.auth.updateUser({
      password: newPassword,
    });
    if (error) throw error;
  }
}
