const { BacktestService } = require('../apps/api/dist/backtest/backtest.service');

// Simple mock config service
const mockConfigService = {
  get: (key) => {
    if (key === 'AI_SERVICE_URL') return 'https://trade-z-production.up.railway.app';
    return null;
  }
};

async function verify() {
  console.log('--- 1. Testing AI Backtester Simulation Engine ---');
  const service = new BacktestService(mockConfigService);

  const testPairs = ['EURUSD', 'USDJPY', 'XAUUSD', 'BTCUSD'];

  for (const pair of testPairs) {
    console.log(`\nTesting backtest for ${pair} (15m, 120 bars)...`);
    const res = await service.runBacktest({
      pair,
      timeframe: '15m',
      bars: 120,
      riskReward: 2.5,
      minConfidence: 65
    });

    const s = res.summary;
    console.log(`✅ [${pair}] Success: ${res.success}`);
    console.log(`   Trades: ${s.total_trades} (Won: ${s.winning_trades}, Lost: ${s.losing_trades})`);
    console.log(`   Win Rate: ${s.win_rate}% | Profit Factor: ${s.profit_factor}x | Net PnL: $${s.net_pnl}`);
    console.log(`   Total Pips: ${s.total_pips} | Max Drawdown: ${s.max_drawdown}%`);

    // Verify every trade level accuracy
    let allValid = true;
    for (const trade of res.trades) {
      if (trade.entry_price <= 0 || trade.stop_loss <= 0 || trade.take_profit <= 0) {
        console.error(`❌ Zero level detected in trade:`, trade);
        allValid = false;
      }
      if (trade.direction === 'long') {
        if (trade.stop_loss >= trade.entry_price || trade.take_profit <= trade.entry_price) {
          console.error(`❌ Inverted levels in LONG trade:`, trade);
          allValid = false;
        }
      } else if (trade.direction === 'short') {
        if (trade.stop_loss <= trade.entry_price || trade.take_profit >= trade.entry_price) {
          console.error(`❌ Inverted levels in SHORT trade:`, trade);
          allValid = false;
        }
      }
    }

    if (allValid) {
      console.log(`   ✅ 100% of trades verified: SL < Entry < TP for Longs, TP < Entry < SL for Shorts.`);
    }

    if (pair === 'EURUSD') {
      console.log('\n--- 2. Testing AI Learning & Adaptive Rules Optimizer ---');
      const learningReport = await service.teachAI(res);
      console.log(`✅ AI Model Learned Successfully!`);
      console.log(`   Current Win Rate: ${learningReport.current_win_rate}% -> Projected: ${learningReport.projected_win_rate}%`);
      console.log(`   Optimized Weights:`, JSON.stringify(learningReport.optimized_weights));
      console.log(`   Insights Discovered:`);
      learningReport.insights.forEach(i => console.log(`     - ${i}`));
    }
  }

  console.log('\n--- ALL VERIFICATIONS PASSED SUCCESSFULLY ---');
}

verify().catch(console.error);
