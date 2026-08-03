-- ============================================================================
-- Trade-Z Schema Patch — Add order_type to signals table
-- Run this in the Supabase SQL editor to apply
-- ============================================================================

ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'buy limit'
  CHECK (order_type IN ('buy limit', 'sell limit', 'buy stop', 'sell stop', 'buy stop limit', 'sell stop limit', 'market'));
