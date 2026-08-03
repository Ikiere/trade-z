import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { EmailService } from './email.service';

@Controller('email')
export class EmailController {
  constructor(private emailService: EmailService) {}

  /**
   * POST /api/v1/email/notify-signal
   * Receives Supabase database webhooks and dispatches emails via Resend.
   */
  @Post('notify-signal')
  @HttpCode(HttpStatus.OK)
  async notifySignal(
    @Body() body: { to: string; subject: string; html: string },
  ) {
    const success = await this.emailService.sendEmail(
      body.to,
      body.subject,
      body.html,
    );
    return { success };
  }
}
