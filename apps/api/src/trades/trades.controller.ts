import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Headers,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { TradesService } from './trades.service';

@Controller('trades')
export class TradesController {
  constructor(private readonly tradesService: TradesService) {}

  @Get('open')
  async getOpenTrades(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.getOpenTrades(userId);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Get('history')
  async getTradeHistory(@Headers('authorization') auth: string) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.getTradeHistory(userId);
    return { success: true, data, timestamp: new Date().toISOString() };
  }

  @Post()
  async executeTrade(
    @Headers('authorization') auth: string,
    @Body()
    body: {
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

  /**
   * POST /trades/signals
   * Write a scanner signal to the signals table via the service-role admin client.
   * Bypasses client-side RLS policies entirely.
   */
  @Post('signals')
  async createSignal(
    @Headers('authorization') auth: string,
    @Body() body: Record<string, any>,
  ) {
    const userId = this.extractUserId(auth);

    if (!body?.pair || !body?.direction) {
      throw new BadRequestException('pair and direction are required');
    }

    const data = await this.tradesService.createSignal(userId, body);
    return {
      success: true,
      data,
      message: 'Signal created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * POST /trades/log
   * Log a manually closed trade and update portfolio balance.
   * Bypasses client-side RLS policies entirely.
   */
  @Post('log')
  async logManualTrade(
    @Headers('authorization') auth: string,
    @Body() body: Record<string, any>,
  ) {
    const userId = this.extractUserId(auth);

    if (!body?.pair || !body?.direction || body?.pnl === undefined) {
      throw new BadRequestException('pair, direction and pnl are required');
    }

    const data = await this.tradesService.logManualTrade(userId, {
      pair: body.pair,
      direction: body.direction,
      lotSize: Number(body.lotSize) || 0.01,
      pnl: Number(body.pnl),
    });
    return {
      success: true,
      data,
      message: 'Manual trade logged successfully',
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
    const token = authHeader?.replace('Bearer ', '');
    if (!token && process.env.NODE_ENV === 'production') {
      throw new UnauthorizedException('Missing auth token');
    }

    // Decode Supabase JWT to read the `sub` claim (real user UUID)
    try {
      if (token) {
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const payload = JSON.parse(
            Buffer.from(payloadBase64, 'base64').toString(),
          );
          if (payload?.sub) return payload.sub;
        }
      }
    } catch (e: any) {
      console.error('Error decoding JWT token:', e.message);
    }

    return 'user-1';
  }
}
