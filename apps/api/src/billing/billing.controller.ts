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
    const token = authHeader?.replace('Bearer ', '');
    if (!token && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Missing token');
    }
    return 'user-1';
  }
}
