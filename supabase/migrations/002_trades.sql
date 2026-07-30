-- ============================================================================
-- Trade-Z Database Schema — Trades
-- ============================================================================

CREATE TABLE IF NOT EXISTS trades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  signal_id UUID,
  broker_id UUID,
  -- Trade details
  pair TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('market', 'limit', 'stop')),
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'open', 'closed', 'cancelled', 'stopped_out', 'take_profit', 'partially_closed', 'break_even')),
  -- Price levels
  entry_price DECIMAL(20, 8) NOT NULL,
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  exit_price DECIMAL(20, 8),
  -- Size
  lot_size DECIMAL(10, 4) NOT NULL,
  -- Risk
  risk_amount DECIMAL(15, 2),
  risk_reward DECIMAL(5, 2),
  risk_percent DECIMAL(5, 2),
  -- P&L
  pnl DECIMAL(15, 2),
  pnl_percent DECIMAL(8, 4),
  pips DECIMAL(10, 1),
  -- AI
  ai_confidence DECIMAL(5, 2),
  ai_reasoning TEXT,
  -- Timestamps
  opened_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Trade execution events
CREATE TABLE IF NOT EXISTS trade_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trade_id UUID NOT NULL REFERENCES trades(id) ON DELETE CASCADE,
  event TEXT NOT NULL,
  description TEXT,
  previous_value DECIMAL(20, 8),
  new_value DECIMAL(20, 8),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_trades_user_id ON trades(user_id);
CREATE INDEX idx_trades_status ON trades(status);
CREATE INDEX idx_trades_pair ON trades(pair);
CREATE INDEX idx_trades_created_at ON trades(created_at DESC);
CREATE INDEX idx_trade_events_trade_id ON trade_events(trade_id);

-- RLS
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE trade_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own trades" ON trades FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own trades" ON trades FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own trades" ON trades FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can view own trade events" ON trade_events FOR SELECT USING (
  EXISTS (SELECT 1 FROM trades WHERE trades.id = trade_events.trade_id AND trades.user_id = auth.uid())
);

CREATE TRIGGER update_trades_updated_at BEFORE UPDATE ON trades FOR EACH ROW EXECUTE FUNCTION update_updated_at();
