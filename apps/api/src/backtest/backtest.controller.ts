import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { BacktestService } from './backtest.service';

@Controller('backtest')
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Post('run')
  @HttpCode(HttpStatus.OK)
  async runBacktest(
    @Body()
    body: {
      pair: string;
      timeframe: string;
      bars?: number;
      riskReward?: number;
      minConfidence?: number;
    },
  ) {
    const result = await this.backtestService.runBacktest(body);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('teach')
  @HttpCode(HttpStatus.OK)
  async teachAI(@Body() body: { backtest_data: any }) {
    const result = await this.backtestService.teachAI(body.backtest_data);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('profile')
  @HttpCode(HttpStatus.OK)
  async getProfile() {
    const result = await this.backtestService.getStrategyProfile();
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }
}
