import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { BacktestService } from './backtest.service';

@Controller('backtest')
export class BacktestController {
  constructor(private readonly backtestService: BacktestService) {}

  @Post('simulate')
  @HttpCode(HttpStatus.OK)
  async simulateMarket(
    @Body()
    body: {
      symbols?: string[];
      initial_balance?: number;
      timeframe?: string;
      period_days?: number;
      bars?: number;
      risk_percent?: number;
      broker_name?: string;
      custom_leverage?: number;
      allow_synthetic?: boolean;
    },
  ) {
    const result = await this.backtestService.simulateMarket(body);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('tournament')
  @HttpCode(HttpStatus.OK)
  async runTournament(
    @Body()
    body: {
      symbols?: string[];
      timeframe?: string;
      period_days?: number;
      risk_percent?: number;
      broker_name?: string;
    },
  ) {
    const result = await this.backtestService.runTournament(body);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Post('experience/similar')
  @HttpCode(HttpStatus.OK)
  async querySimilar(
    @Body()
    body: {
      symbol: string;
      setup_family: string;
      session?: string;
      regime?: string;
    },
  ) {
    const result = await this.backtestService.querySimilar(body);
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  @Get('brokers')
  @HttpCode(HttpStatus.OK)
  async getBrokers() {
    const result = await this.backtestService.getBrokers();
    return {
      success: true,
      data: result,
      timestamp: new Date().toISOString(),
    };
  }

  // Legacy endpoints for backward compatibility
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
