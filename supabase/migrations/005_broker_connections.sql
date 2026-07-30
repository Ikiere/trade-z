-- ============================================================================
-- Trade-Z Database Schema — Broker Connections
-- ============================================================================

CREATE TABLE IF NOT EXISTS broker_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  broker TEXT NOT NULL CHECK (broker IN ('paper', 'mt4', 'mt5', 'ctrader', 'interactive_brokers', 'oanda', 'alpaca')),
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'disconnected' CHECK (status IN ('connected', 'disconnected', 'connecting', 'error', 'expired', 'pending')),
  account_id TEXT,
  server TEXT,
  is_demo BOOLEAN DEFAULT TRUE,
  is_primary BOOLEAN DEFAULT FALSE,
  -- Encrypted credentials stored separately or in vault
  credentials_encrypted TEXT,
  last_sync_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_broker_connections_user_id ON broker_connections(user_id);

ALTER TABLE broker_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own broker connections" ON broker_connections FOR ALL USING (auth.uid() = user_id);
CREATE TRIGGER update_broker_connections_updated_at BEFORE UPDATE ON broker_connections FOR EACH ROW EXECUTE FUNCTION update_updated_at();
