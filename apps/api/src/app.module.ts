import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TradesModule } from './trades/trades.module';
import { ChatModule } from './chat/chat.module';
import { BrokerModule } from './broker/broker.module';
import { BillingModule } from './billing/billing.module';
import { EmailModule } from './email/email.module';
import { AdminModule } from './admin/admin.module';
import { CalendarModule } from './calendar/calendar.module';
import { BacktestModule } from './backtest/backtest.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [() => ({
        SUPABASE_URL: process.env.SUPABASE_URL || '',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
        AI_SERVICE_URL: (process.env.AI_SERVICE_URL || 'http://127.0.0.1:8000').replace(/\/+$/, ''),
      })],
    }),
    HealthModule,
    AuthModule,
    UsersModule,
    TradesModule,
    ChatModule,
    BrokerModule,
    BillingModule,
    EmailModule,
    AdminModule,
    CalendarModule,
    BacktestModule,
  ],
})
export class AppModule {}
