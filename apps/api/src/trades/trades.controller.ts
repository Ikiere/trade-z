import { Controller, Get, Post, Patch, Delete, Body, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { TradesService } from './trades.service';

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get('open')
  async getOpenTrades(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.getOpenTrades(userId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('history')
  async getTradeHistory(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.getTradeHistory(userId);
    return {
      success: true,
      data,
      timestamp: new Date().toISOString(),
    };
  }

  @Post()
  async executeTrade(
    @Headers('authorization') auth: string,
    @Body() body: {
      pair: string;
      direction: 'long' | 'short';
      entryPrice: number;
      stopLoss: number;
      takeProfit: number;
      riskPercent: number;
    },
  ) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.executeTrade(userId, body);
    return {
      success: true,
      data,
      message: 'Position opened successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Patch(':id/be')
  async shiftToBreakEven(@Param('id') id: string) {
    const data = await this.tradesService.shiftToBreakEven(id);
    return {
      success: true,
      data,
      message: 'Stop Loss shifted to Break Even',
      timestamp: new Date().toISOString(),
    };
  }

  @Delete(':id')
  async closeTrade(@Param('id') id: string) {
    const data = await this.tradesService.closeTrade(id);
    return {
      success: true,
      data,
      message: 'Position closed successfully',
      timestamp: new Date().toISOString(),
    };
  }

  private extractUserId(authHeader: string): string {
    // In a live JWT auth environment, we read the token claims.
    // For Phase 1C verification, we return a mock user ID if headers are missing.
    const token = authHeader?.replace('Bearer ', '');
    if (!token && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Missing auth token');
    }
    return 'user-1';
  }
}
