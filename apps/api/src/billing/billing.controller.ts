import { Controller, Post, Body, Headers, UnauthorizedException, HttpCode, HttpStatus } from '@nestjs/common';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('checkout')
  async checkout(
    @Headers('authorization') auth: string,
    @Body() body: { planName: string },
  ) {
    const userId = this.extractUserId(auth);
    const data = await this.billingService.createCheckoutSession(userId, body.planName);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Body() body: any) {
    const data = await this.billingService.handleWebhook(body);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  private extractUserId(authHeader: string): string {
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token || token === 'undefined' || token === 'null') {
      throw new UnauthorizedException('Valid authentication session token required');
    }
    try {
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        const sub = payload?.sub;
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (sub && uuidRegex.test(sub)) {
          return sub;
        }
      }
    } catch (_) {}
    throw new UnauthorizedException('Valid authentication session token required');
  }
}
