import { Injectable, OnApplicationBootstrap, OnApplicationShutdown, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { BrokerService } from './broker.service';

@Injectable()
export class PositionReconciliationService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PositionReconciliationService.name);
  private supabase: SupabaseClient;
  private reconciliationTimer: NodeJS.Timeout | undefined;
  private isTradingActive = true;

  constructor(
    private configService: ConfigService,
    private brokerService: BrokerService,
  ) {
    const supabaseUrl = this.configService.get<string>('SUPABASE_URL') || 'https://invyoijtyfridyumlgqr.supabase.co';
    const supabaseKey = this.configService.get<string>('SUPABASE_SERVICE_ROLE_KEY') || 'placeholder';
    this.supabase = createClient(supabaseUrl, supabaseKey);

    // Global kill switch configuration from environment
    const envTrading = this.configService.get<string>('TRADING_ENABLED');
    if (envTrading !== undefined && envTrading.toLowerCase() === 'false') {
      this.isTradingActive = false;
      this.logger.warn('⚠️ Global Trading Kill Switch is ACTIVE on boot (TRADING_ENABLED=false). Order execution blocked.');
    }
  }

  onApplicationBootstrap() {
    this.logger.log('🔄 Position Reconciliation Sentinel initialized (15-second loop).');
    this.reconciliationTimer = setInterval(() => {
      this.reconcilePositions();
    }, 15000);

    // Initial reconciliation pass
    this.reconcilePositions();
  }

  onApplicationShutdown() {
    if (this.reconciliationTimer) {
      clearInterval(this.reconciliationTimer);
    }
  }

  /**
   * Returns current global kill switch status.
   */
  public isTradingEnabled(): boolean {
    return this.isTradingActive;
  }

  /**
   * Sets the global kill switch programmatically.
   */
  public setTradingKillSwitch(enabled: boolean) {
    this.isTradingActive = enabled;
    this.logger.warn(`🚨 Global Trading Kill Switch toggled: ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Periodically reconciles database active trades against MT5 broker state.
   * Detects SL/TP exits, syncs realized P&L, and updates status.
   */
  public async reconcilePositions() {
    try {
      // 1. Fetch live open positions from MT5 Bridge
      const mt5Res: any = await this.brokerService.getMt5Positions();
      if (!mt5Res || !mt5Res.success) {
        return; // Bridge offline or terminal unreachable; retry next cycle
      }

      const activeMt5Positions = Array.isArray(mt5Res.positions) ? mt5Res.positions : [];
      const activeTickets = new Set(activeMt5Positions.map((p: any) => Number(p.ticket)));

      // 2. Fetch active open trades from Supabase
      const { data: dbTrades, error: dbError } = await this.supabase
        .from('trades')
        .select('*')
        .in('status', ['open', 'pending']);

      if (dbError || !dbTrades || dbTrades.length === 0) {
        return;
      }

      // 3. Compare open tickets
      for (const trade of dbTrades) {
        // Find ticket from metadata or notes
        let ticketNum: number | null = null;
        if (trade.notes && trade.notes.includes('Ticket #')) {
          const match = trade.notes.match(/Ticket #(\d+)/);
          if (match) ticketNum = Number(match[1]);
        }

        if (!ticketNum) continue;

        // If trade was open in DB but is no longer in MT5 positions, it has closed!
        if (!activeTickets.has(ticketNum)) {
          this.logger.log(`[Reconciliation] Trade #${trade.id} (MT5 Ticket #${ticketNum}) has closed on MT5. Reconciling...`);

          // Fetch deal history to get exact exit price and realized PnL
          let realizedPnl = 0.0;
          let exitPrice = trade.exit_price || trade.entry_price;

          try {
            const histRes: any = await this.brokerService.getMt5History(3);
            if (histRes && histRes.success && Array.isArray(histRes.trades)) {
              const matchingDeal = histRes.trades.find((d: any) => Number(d.ticket) === ticketNum || Number(d.order) === ticketNum);
              if (matchingDeal) {
                realizedPnl = Number(matchingDeal.profit || 0.0);
                exitPrice = Number(matchingDeal.price_close || matchingDeal.price || exitPrice);
              }
            }
          } catch (_) {}

          const finalStatus = realizedPnl >= 0 ? 'take_profit' : 'stopped_out';

          await this.supabase
            .from('trades')
            .update({
              status: finalStatus,
              pnl: realizedPnl,
              exit_price: exitPrice,
              closed_at: new Date().toISOString(),
              notes: `${trade.notes || ''} [Auto-Reconciled by Sentinel on MT5 exit. Realized: $${realizedPnl.toFixed(2)}]`
            })
            .eq('id', trade.id);

          this.logger.log(`[Reconciliation] Synced trade #${trade.id}: Status=${finalStatus}, PnL=$${realizedPnl.toFixed(2)}`);
        }
      }
    } catch (err: any) {
      this.logger.warn(`[Reconciliation] Error during sync: ${err.message}`);
    }
  }
}
