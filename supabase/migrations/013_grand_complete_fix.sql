-- ============================================================================
-- Trade-Z: Grand Unified Database Repair & Schema Fix
-- Copy and run this ENTIRE script in your Supabase SQL Editor
-- (Supabase Dashboard → SQL Editor → New Query → Run)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. signals table: add order_type column + RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE signals
  ADD COLUMN IF NOT EXISTS order_type TEXT DEFAULT 'buy limit'
  CHECK (order_type IN ('buy limit', 'sell limit', 'buy stop', 'sell stop', 'buy stop limit', 'sell stop limit', 'market'));

-- Allow users to insert and update their own signals
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='signals' AND policyname='Users can insert own signals'
  ) THEN
    CREATE POLICY "Users can insert own signals" ON signals FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='signals' AND policyname='Users can update own signals'
  ) THEN
    CREATE POLICY "Users can update own signals" ON signals FOR UPDATE USING (auth.uid() = user_id);
  END IF;
END $$;

-- Drop generic select policy if it exists and make it private to the owner
DROP POLICY IF EXISTS "Users can view signals" ON signals;
DROP POLICY IF EXISTS "Users can view own signals" ON signals;
CREATE POLICY "Users can view own signals" ON signals FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. user_settings: add daily_signal_limit and watchlist columns + RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS daily_signal_limit INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS watchlist TEXT[] DEFAULT ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD'];

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='user_settings' AND policyname='Users can insert own settings'
  ) THEN
    CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. portfolios: ensure RLS insert policy exists
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='portfolios' AND policyname='Users can insert own portfolios'
  ) THEN
    CREATE POLICY "Users can insert own portfolios" ON portfolios FOR INSERT WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Backfill: Auto-create portfolios/settings/profiles for existing users
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO portfolios (user_id, name, balance, equity, free_margin, is_default)
SELECT u.id, 'Default Portfolio', 10000.00, 10000.00, 10000.00, TRUE
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM portfolios p WHERE p.user_id = u.id AND p.is_default = TRUE
)
ON CONFLICT DO NOTHING;

INSERT INTO user_settings (user_id, trading_mode, default_lot_size, daily_signal_limit, watchlist)
SELECT u.id, 'manual', 0.01, 2, ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD']
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_settings s WHERE s.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

INSERT INTO user_profiles (user_id, display_name)
SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', 'Trader')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles p WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Trigger update: ensure future signups get all default rows automatically
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile
  INSERT INTO user_profiles (user_id, display_name)
  VALUES (NEW.id, NEW.raw_user_meta_data->>'full_name')
  ON CONFLICT (user_id) DO NOTHING;

  -- Create settings
  INSERT INTO user_settings (user_id, trading_mode, default_lot_size, daily_signal_limit, watchlist)
  VALUES (NEW.id, 'manual', 0.01, 2, ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD'])
  ON CONFLICT (user_id) DO NOTHING;

  -- Create default portfolio
  INSERT INTO portfolios (user_id, name, balance, equity, free_margin, is_default)
  VALUES (NEW.id, 'Default Portfolio', 10000.00, 10000.00, 10000.00, TRUE)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
