-- ============================================================================
-- Trade-Z Database Schema — Signals
-- ============================================================================

CREATE TABLE IF NOT EXISTS signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  pair TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('long', 'short')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'executed', 'expired', 'rejected', 'cancelled')),
  -- Price levels
  entry_price DECIMAL(20, 8) NOT NULL,
  stop_loss DECIMAL(20, 8) NOT NULL,
  take_profit DECIMAL(20, 8) NOT NULL,
  current_price DECIMAL(20, 8),
  -- AI
  confidence DECIMAL(5, 2) NOT NULL,
  confidence_breakdown JSONB,
  ai_reasoning TEXT,
  timeframe TEXT NOT NULL,
  -- Risk
  risk_reward DECIMAL(5, 2),
  risk_percent DECIMAL(5, 2),
  -- Metadata
  strategy TEXT,
  tags TEXT[],
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_signals_status ON signals(status);
CREATE INDEX idx_signals_pair ON signals(pair);
CREATE INDEX idx_signals_created_at ON signals(created_at DESC);
CREATE INDEX idx_signals_confidence ON signals(confidence DESC);

ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view signals" ON signals FOR SELECT USING (TRUE);
CREATE TRIGGER update_signals_updated_at BEFORE UPDATE ON signals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
