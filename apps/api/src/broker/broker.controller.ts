import { Controller, Get, Post, Body, Headers, Query, UnauthorizedException } from '@nestjs/common';
import { BrokerService } from './broker.service';

@Controller('broker')
export class BrokerController {
  constructor(private readonly brokerService: BrokerService) {}

  @Get('connection')
  async getConnection(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.brokerService.getConnection(userId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('connect')
  async connectBroker(
    @Headers('authorization') auth: string,
    @Body() body: { brokerName: string; accountNumber: string; accountType: string; leverage: number },
  ) {
    const userId = this.extractUserId(auth);
    const data = await this.brokerService.connectBroker(userId, body);
    return {
      success: true,
      data,
      message: 'Broker connection synchronized successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('mt5/account')
  async getMt5Account(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.brokerService.getMt5Status(userId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('mt5/order')
  async executeMt5Order(
    @Headers('authorization') auth: string,
    @Body() body: any,
  ) {
    const userId = this.extractUserId(auth);
    const result = await this.brokerService.executeMt5Order(userId, body);
    return result;
  }

  @Get('mt5/positions')
  async getMt5Positions() {
    const data = await this.brokerService.getMt5Positions();
    return data;
  }

  @Post('mt5/close')
  async closeMt5Position(@Body() body: { ticket: number }) {
    const data = await this.brokerService.closeMt5Position(body.ticket);
    return data;
  }

  @Post('mt5/close-all')
  async closeAllMt5Positions() {
    const data = await this.brokerService.closeAllMt5Positions();
    return data;
  }

  @Post('mt5/modify')
  async modifyMt5Position(@Body() body: { ticket: number; sl?: number; tp?: number }) {
    const data = await this.brokerService.modifyMt5Position(body.ticket, body.sl, body.tp);
    return data;
  }

  @Post('mt5/cancel-order')
  async cancelMt5Order(@Body() body: { ticket: number }) {
    const data = await this.brokerService.cancelMt5Order(body.ticket);
    return data;
  }

  @Get('mt5/history')
  async getMt5History(@Query('days') days?: string) {
    const numDays = days ? parseInt(days, 10) : 60;
    const data = await this.brokerService.getMt5History(numDays);
    return data;
  }

  private extractUserId(authHeader: string): string {
    const token = authHeader?.replace('Bearer ', '').trim();
    if (!token || token === 'undefined' || token === 'null') {
      return 'user-1';
    }
    try {
      const payloadBase64 = token.split('.')[1];
      if (payloadBase64) {
        const base64 = payloadBase64.replace(/-/g, '+').replace(/_/g, '/');
        const payload = JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'));
        if (payload?.sub) return payload.sub;
      }
    } catch (_) {}
    return 'user-1';
  }
}
