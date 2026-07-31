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
