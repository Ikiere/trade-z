import { Module, Global } from '@nestjs/common';
import { EmailService } from './email.service';
import { SessionSchedulerService } from './session-scheduler.service';

@Global()
@Module({
  providers: [EmailService, SessionSchedulerService],
  exports: [EmailService],
})
export class EmailModule {}
