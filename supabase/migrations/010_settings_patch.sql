-- ============================================================================
-- Trade-Z Schema Patch — Add daily_signal_limit and watchlist to user_settings
-- Run this in the Supabase SQL editor to apply
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS daily_signal_limit INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS watchlist TEXT[] DEFAULT ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD'];

-- Allow users to insert their own settings row (needed for new signups)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_settings' AND policyname = 'Users can insert own settings'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;
