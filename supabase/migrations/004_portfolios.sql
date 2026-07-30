-- ============================================================================
-- Trade-Z Database Schema — Portfolios
-- ============================================================================

CREATE TABLE IF NOT EXISTS portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'Default Portfolio',
  description TEXT,
  balance DECIMAL(15, 2) DEFAULT 10000.00,
  equity DECIMAL(15, 2) DEFAULT 10000.00,
  margin DECIMAL(15, 2) DEFAULT 0,
  free_margin DECIMAL(15, 2) DEFAULT 10000.00,
  margin_level DECIMAL(10, 2) DEFAULT 0,
  unrealized_pnl DECIMAL(15, 2) DEFAULT 0,
  realized_pnl DECIMAL(15, 2) DEFAULT 0,
  today_pnl DECIMAL(15, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Portfolio snapshots for historical tracking
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES portfolios(id) ON DELETE CASCADE,
  balance DECIMAL(15, 2) NOT NULL,
  equity DECIMAL(15, 2) NOT NULL,
  pnl DECIMAL(15, 2) NOT NULL,
  trade_count INTEGER DEFAULT 0,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_portfolios_user_id ON portfolios(user_id);
CREATE INDEX idx_portfolio_snapshots_portfolio_id ON portfolio_snapshots(portfolio_id);
CREATE INDEX idx_portfolio_snapshots_date ON portfolio_snapshots(snapshot_date DESC);

ALTER TABLE portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own portfolios" ON portfolios FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can view own snapshots" ON portfolio_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM portfolios WHERE portfolios.id = portfolio_snapshots.portfolio_id AND portfolios.user_id = auth.uid())
);

CREATE TRIGGER update_portfolios_updated_at BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION update_updated_at();
