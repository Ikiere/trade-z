-- ============================================================================
-- Trade-Z: Complete Schema Fix & Policy Audit
-- Run this entire script in your Supabase SQL Editor (Dashboard → SQL Editor)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. user_settings: add missing columns + policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS daily_signal_limit INTEGER DEFAULT 2,
  ADD COLUMN IF NOT EXISTS watchlist TEXT[] DEFAULT ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD'];

-- Allow users to insert their own settings row (needed if trigger missed them)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='user_settings' AND policyname='Users can insert own settings'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own settings" ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. signals: add INSERT + UPDATE policies (SELECT already exists)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='signals' AND policyname='Users can insert own signals'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own signals" ON signals FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='signals' AND policyname='Users can update own signals'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own signals" ON signals FOR UPDATE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- Also scope the SELECT to the user's own signals (better privacy)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='signals' AND policyname='Users can view signals'
  ) THEN
    EXECUTE 'DROP POLICY "Users can view signals" ON signals';
    EXECUTE 'CREATE POLICY "Users can view own signals" ON signals FOR SELECT USING (auth.uid() = user_id OR user_id IS NULL)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. trades: ensure all 3 policies exist
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='trades' AND policyname='Users can view own trades'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can view own trades" ON trades FOR SELECT USING (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='trades' AND policyname='Users can insert own trades'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own trades" ON trades FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='trades' AND policyname='Users can update own trades'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can update own trades" ON trades FOR UPDATE USING (auth.uid() = user_id)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. portfolios: ensure INSERT policy exists (FOR ALL misses WITH CHECK on INSERT)
-- ─────────────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename='portfolios' AND policyname='Users can insert own portfolios'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own portfolios" ON portfolios FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Auto-create missing portfolios for all existing users who lack one
--    (runs for all users whose handle_new_user trigger may have failed)
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO portfolios (user_id, name, balance, equity, free_margin, is_default)
SELECT
  u.id,
  'Default Portfolio',
  10000.00,
  10000.00,
  10000.00,
  TRUE
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM portfolios p WHERE p.user_id = u.id AND p.is_default = TRUE
)
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Auto-create missing user_settings rows for all existing users
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO user_settings (user_id, trading_mode, default_lot_size, daily_signal_limit, watchlist)
SELECT
  u.id,
  'manual',
  0.01,
  2,
  ARRAY['EURUSD','GBPUSD','USDJPY','XAUUSD']
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_settings s WHERE s.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Auto-create missing user_profiles rows for all existing users
-- ─────────────────────────────────────────────────────────────────────────────
INSERT INTO user_profiles (user_id, display_name)
SELECT
  u.id,
  COALESCE(u.raw_user_meta_data->>'full_name', 'Trader')
FROM auth.users u
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles p WHERE p.user_id = u.id
)
ON CONFLICT (user_id) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Fix handle_new_user trigger to also create a portfolio on signup
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

  -- Create default portfolio (was missing from the original trigger!)
  INSERT INTO portfolios (user_id, name, balance, equity, free_margin, is_default)
  VALUES (NEW.id, 'Default Portfolio', 10000.00, 10000.00, 10000.00, TRUE)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─────────────────────────────────────────────────────────────────────────────
-- Verification: run these SELECTs after to confirm everything is in place
-- ─────────────────────────────────────────────────────────────────────────────
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('trades','signals','portfolios','user_settings') ORDER BY tablename, cmd;
-- SELECT COUNT(*) FROM portfolios WHERE is_default = TRUE;
-- SELECT COUNT(*) FROM user_settings;
