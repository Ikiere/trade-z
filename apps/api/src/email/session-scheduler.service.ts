import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { EmailService } from './email.service';

@Injectable()
export class SessionSchedulerService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SessionSchedulerService.name);
  private supabase: SupabaseClient;
  private checkInterval: NodeJS.Timeout | undefined;
  private lastAlertedHour = -1;

  constructor(
    private configService: ConfigService,
    private emailService: EmailService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || 'https://invyoijtyfridyumlgqr.supabase.co';
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || 'placeholder';

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  onApplicationBootstrap() {
    this.logger.log('🚀 Session alert scheduler initialized.');
    
    // Check session boundaries every 5 minutes
    this.checkInterval = setInterval(() => {
      this.checkMarketSessions();
    }, 5 * 60 * 1000);

    // Run a quick check on startup
    this.checkMarketSessions();
  }

  onModuleDestroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
  }

  private async checkMarketSessions() {
    const utcHour = new Date().getUTCHours();
    
    // Guard: Only alert once per hour
    if (utcHour === this.lastAlertedHour) return;

    let sessionName = '';
    let activePairs: string[] = [];

    // Session definitions in UTC
    if (utcHour === 8) {
      sessionName = 'London Open';
      activePairs = ['EURUSD', 'GBPUSD', 'EURGBP', 'GBPJPY'];
    } else if (utcHour === 13) {
      sessionName = 'New York Open';
      activePairs = ['EURUSD', 'GBPUSD', 'USDCAD', 'USDJPY', 'XAUUSD'];
    } else if (utcHour === 0) {
      sessionName = 'Tokyo Open';
      activePairs = ['USDJPY', 'AUDUSD', 'NZDUSD', 'GBPJPY'];
    }

    if (sessionName) {
      this.logger.log(`📢 Market session detected: ${sessionName}. Dispatching user alerts...`);
      this.lastAlertedHour = utcHour;
      await this.dispatchSessionEmails(sessionName, activePairs);
    }
  }

  private async dispatchSessionEmails(sessionName: string, activePairs: string[]) {
    try {
      // List all users using Supabase service-role client
      const { data: usersData, error } = await this.supabase.auth.admin.listUsers();
      
      if (error) {
        throw new Error(`Failed to list users: ${error.message}`);
      }

      const users = usersData?.users || [];
      this.logger.log(`Found ${users.length} users to alert.`);

      for (const user of users) {
        if (user.email) {
          this.logger.log(`Dispatching ${sessionName} alert to: ${user.email}`);
          await this.emailService.sendSessionAlertEmail(user.email, sessionName, activePairs);
        }
      }
    } catch (err: any) {
      this.logger.error(`Error dispatching session emails: ${err.message}`);
    }
  }
}
