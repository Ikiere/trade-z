import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class BacktestService {
  private aiServiceUrl: string;

  constructor(private configService: ConfigService) {
    const rawUrl = this.configService.get<string>('AI_SERVICE_URL') || 'https://trade-z-ai-service.onrender.com';
    this.aiServiceUrl = rawUrl.replace(/\/+$/, '');
  }

  async simulateMarket(params: {
    symbols?: string[];
    initial_balance?: number;
    timeframe?: string;
    period_days?: number;
    bars?: number;
    risk_percent?: number;
    broker_name?: string;
    custom_leverage?: number;
    allow_synthetic?: boolean;
    is_cent_account?: boolean;
  }) {
    let failureDetail = '';
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/backtest/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: params.symbols || ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'],
          initial_balance: params.initial_balance || 1000.0,
          timeframe: params.timeframe || '15m',
          period_days: params.period_days || 30,
          bars: params.bars,
          risk_percent: params.risk_percent || 1.0,
          broker_name: params.broker_name || 'exness',
          custom_leverage: params.custom_leverage || 2000.0,
          allow_synthetic: params.allow_synthetic ?? false,
          is_cent_account: params.is_cent_account ?? false,
        }),
      });

      if (response.ok) {
        return await response.json();
      } else {
        const errText = await response.text();
        failureDetail = `HTTP ${response.status}: ${errText}`;
        console.error(`[BacktestService] AI Service returned non-200 for simulate (${response.status}):`, errText);
      }
    } catch (e: any) {
      failureDetail = e.message;
      console.error('[BacktestService] Error calling AI service simulate:', e.message);
    }

    // Fail closed: Do NOT substitute synthetic candles or Math.random() in production
    const initBal = params.initial_balance || 1000.0;
    return {
      success: false,
      status: 'BACKTEST_DATA_UNAVAILABLE',
      error: `BACKTEST_DATA_UNAVAILABLE: Historical market data or AI Simulation Engine is unreachable (${failureDetail || 'Network/Server Error'}). Trade-Z strictly forbids synthetic random fallback.`,
      timestamp: new Date().toISOString(),
      summary: {
        status: 'BACKTEST_DATA_UNAVAILABLE',
        total_trades: 0,
        net_pnl: 0.0,
        starting_balance: initBal,
        ending_balance: initBal,
        ending_equity: initBal,
        win_rate: 0.0,
        profit_factor: 0.0,
        net_return_pct: 0.0,
      },
    };
  }

  async runTournament(params: {
    symbols?: string[];
    timeframe?: string;
    period_days?: number;
    risk_percent?: number;
    broker_name?: string;
  }) {
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/backtest/tournament`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbols: params.symbols || ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'],
          timeframe: params.timeframe || '15m',
          period_days: params.period_days || 30,
          risk_percent: params.risk_percent || 1.0,
          broker_name: params.broker_name || 'exness',
        }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (e: any) {
      console.error('[BacktestService] Error calling AI service tournament:', e.message);
    }

    // Fail closed: No random tournaments
    return {
      success: false,
      status: 'BACKTEST_DATA_UNAVAILABLE',
      error: 'BACKTEST_DATA_UNAVAILABLE: Quantitative multi-account tournament data is unavailable from the simulation engine. Trade-Z strictly forbids synthetic random fallback.',
      timestamp: new Date().toISOString(),
    };
  }

  async querySimilar(params: {
    symbol: string;
    setup_family: string;
    session?: string;
    regime?: string;
  }) {
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/backtest/experience/similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (e: any) {
      console.error('[BacktestService] Error querying similar experiences:', e.message);
    }

    // Return strictly insufficient statistical evidence rather than fabricated numbers
    return {
      symbol: params.symbol,
      setup_family: params.setup_family,
      sample_size: 0,
      win_rate: 0.0,
      average_r: 0.0,
      expectancy: 0.0,
      profit_factor: 1.0,
      average_mfe_r: 0.0,
      average_mae_r: 0.0,
      statistical_edge: 'INSUFFICIENT_STATISTICAL_EVIDENCE',
      matching_records: [],
    };
  }

  async getBrokers() {
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/backtest/brokers`);
      if (response.ok) {
        return await response.json();
      }
    } catch (e) {}

    return [
      {
        id: 'exness',
        name: 'Exness Standard (1:2000 Leverage • 0% Stop-out)',
        default_leverage: 2000.0,
        margin_call_level: 60.0,
        stop_out_level: 0.0,
        execution_delay_ms: 35,
      },
      {
        id: 'ic_markets',
        name: 'IC Markets Raw (1:500 Leverage • ECN Commission • 50% Stop-out)',
        default_leverage: 500.0,
        margin_call_level: 100.0,
        stop_out_level: 50.0,
        execution_delay_ms: 25,
      },
    ];
  }

  async runBacktest(params: {
    pair: string;
    timeframe: string;
    bars?: number;
    riskReward?: number;
    minConfidence?: number;
    initialBalance?: number;
  }) {
    const pair = (params.pair || 'EURUSD').toUpperCase();
    const timeframe = params.timeframe || '15m';
    const bars = Number(params.bars) || 150;
    const riskReward = Number(params.riskReward) || 2.5;
    const minConfidence = Number(params.minConfidence) || 65.0;
    const initialBalance = Number(params.initialBalance) || 1000.0;

    // 1. Query the canonical Python Event-Driven Simulator microservice
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/backtest/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pair,
          timeframe,
          bars,
          risk_reward: riskReward,
          min_confidence: minConfidence,
          initial_balance: initialBalance,
        }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (e: any) {
      console.error('[BacktestService] Error running backtest:', e.message);
    }

    // Fail closed: Return BACKTEST_DATA_UNAVAILABLE instead of generating random trades
    return {
      success: false,
      status: 'BACKTEST_DATA_UNAVAILABLE',
      error: `BACKTEST_DATA_UNAVAILABLE: Real historical data or simulation service is currently unavailable for ${pair}. Trade-Z strictly prohibits synthetic random fallback.`,
      timestamp: new Date().toISOString(),
    };
  }

  async teachAI(backtestData: any) {
    try {
      const response = await fetch(`${this.aiServiceUrl}/api/v1/backtest/teach`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backtest_data: backtestData }),
      });

      if (response.ok) {
        return await response.json();
      }
    } catch (e: any) {
      console.error('[BacktestService] teachAI error:', e.message);
    }

    return {
      success: false,
      error: 'AI training pipeline unavailable or data unvalidated. Trade-Z only trains from verified historical outcomes.',
      timestamp: new Date().toISOString(),
    };
  }

  async getStrategyProfile() {
    return {
      success: true,
      profile: {
        name: 'Trade-Z Institutional SMC v2.2-Empirical',
        min_confidence_threshold: 70.0,
        default_risk_reward: 2.5,
        weights: {
          structure: 0.22,
          higher_timeframe: 0.20,
          liquidity: 0.18,
          zones: 0.18,
          fundamentals: 0.08,
          volume: 0.06,
          trend_quality: 0.04,
          momentum: 0.02,
          volatility: 0.02,
        },
      },
    };
  }
}
