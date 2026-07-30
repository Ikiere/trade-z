-- ============================================================================
-- Trade-Z Database Schema — AI Decisions
-- ============================================================================

CREATE TABLE IF NOT EXISTS ai_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  signal_id UUID REFERENCES signals(id) ON DELETE SET NULL,
  pair TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'reject', 'wait', 'no_trade')),
  confidence DECIMAL(5, 2) NOT NULL,
  reasoning TEXT NOT NULL,
  analysis JSONB,
  rejection_reasons TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_ai_decisions_pair ON ai_decisions(pair);
CREATE INDEX idx_ai_decisions_decision ON ai_decisions(decision);
CREATE INDEX idx_ai_decisions_created_at ON ai_decisions(created_at DESC);

ALTER TABLE ai_decisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view ai decisions" ON ai_decisions FOR SELECT USING (auth.role() = 'authenticated');
