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

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
      load: [() => ({
        SUPABASE_URL: process.env.SUPABASE_URL || 'https://invyoijtyfridyumlgqr.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImludnlvaWp0eWZyaWR5dW1sZ3FyIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NTQwMTk5NiwiZXhwIjoyMTAwOTc3OTk2fQ.j5ccbvys-D5ngNt2wkn5gzxIvGYoDSEoI7wJYul5mGE',
        AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'https://trade-z-production.up.railway.app',
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
  ],
})
export class AppModule {}
