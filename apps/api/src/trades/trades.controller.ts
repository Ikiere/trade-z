import { Controller, Get, Post, Patch, Delete, Body, Param, Headers, UnauthorizedException } from '@nestjs/common';
import { TradesService } from './trades.service';
import { IsString, IsNumber, IsArray, IsOptional } from 'class-validator';

export class CreateSignalDto {
  @IsString()
  pair!: string;

  @IsString()
  direction!: 'long' | 'short';

  @IsString()
  status!: string;

  @IsNumber()
  entry_price!: number;

  @IsNumber()
  stop_loss!: number;

  @IsNumber()
  take_profit!: number;

  @IsNumber()
  confidence!: number;

  @IsString()
  ai_reasoning!: string;

  @IsString()
  timeframe!: string;

  @IsString()
  @IsOptional()
  strategy?: string;

  @IsArray()
  @IsOptional()
  tags?: string[];
}

export class LogManualTradeDto {
  @IsString()
  pair!: string;

  @IsString()
  direction!: 'long' | 'short';

  @IsNumber()
  lotSize!: number;

  @IsNumber()
  pnl!: number;
}

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

  @Post('signals')
  async createSignal(
    @Headers('authorization') auth: string,
    @Body() body: CreateSignalDto,
  ) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.createSignal(userId, body);
    return {
      success: true,
      data,
      message: 'Signal created successfully',
      timestamp: new Date().toISOString(),
    };
  }

  @Post('log')
  async logManualTrade(
    @Headers('authorization') auth: string,
    @Body() body: LogManualTradeDto,
  ) {
    const userId = this.extractUserId(auth);
    const data = await this.tradesService.logManualTrade(userId, body);
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
    
    // Decode token claims if present, otherwise fallback
    try {
      if (token) {
        const payloadBase64 = token.split('.')[1];
        if (payloadBase64) {
          const payload = JSON.parse(Buffer.from(payloadBase64, 'base64').toString());
          if (payload?.sub) return payload.sub;
        }
      }
    } catch (e: any) {
      console.error('Error decoding JWT token:', e.message);
    }
    
    return 'user-1';
  }
}
