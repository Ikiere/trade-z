-- ============================================================================
-- Trade-Z Schema Patch 016 — Bulletproof Signup Trigger & Search Path Fix
-- Resolves GoTrue HTTP 500 "Database error saving new user" / empty "{}" errors
-- ============================================================================

-- 1. Ensure public tables have proper insert policies for new signups
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'user_profiles' AND policyname = 'Users can insert own profile'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own profile" ON user_profiles FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'portfolios' AND policyname = 'Users can insert own portfolio'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own portfolio" ON portfolios FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'subscriptions' AND policyname = 'Users can insert own subscription'
  ) THEN
    EXECUTE 'CREATE POLICY "Users can insert own subscription" ON subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id)';
  END IF;
END $$;

-- 2. Drop redundant trigger that duplicated portfolio/subscription creation
DROP TRIGGER IF EXISTS on_auth_user_created_subscription ON auth.users;

-- 3. Replace handle_new_user() with an ultra-resilient, fault-tolerant version
--    Each table insert is isolated in its own sub-block with EXCEPTION handling.
--    This guarantees that ANY failure will never crash auth.users insertion.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- 3a. Create Profile
  BEGIN
    INSERT INTO public.user_profiles (user_id, display_name)
    VALUES (
      NEW.id,
      COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Trader')
    )
    ON CONFLICT (user_id) DO UPDATE
    SET display_name = EXCLUDED.display_name
    WHERE user_profiles.display_name IS NULL OR user_profiles.display_name = '';
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: user_profiles insert ignored error: %', SQLERRM;
  END;

  -- 3b. Create Default Settings (Locked to 2 trades/day institutional discipline)
  BEGIN
    INSERT INTO public.user_settings (
      user_id,
      trading_mode,
      default_lot_size,
      daily_signal_limit,
      watchlist
    )
    VALUES (
      NEW.id,
      'fully_automatic',
      0.01,
      2,
      ARRAY['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'BTCUSD', 'ETHUSD']
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: user_settings insert ignored error: %', SQLERRM;
  END;

  -- 3c. Create Default Portfolio
  BEGIN
    INSERT INTO public.portfolios (
      user_id,
      name,
      balance,
      equity,
      free_margin,
      is_default
    )
    VALUES (
      NEW.id,
      'Default Portfolio',
      10000.00,
      10000.00,
      10000.00,
      TRUE
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: portfolios insert ignored error: %', SQLERRM;
  END;

  -- 3d. Create Free Active Subscription
  BEGIN
    INSERT INTO public.subscriptions (
      user_id,
      plan,
      status
    )
    VALUES (
      NEW.id,
      'free',
      'active'
    )
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user: subscriptions insert ignored error: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 4. Re-bind the primary trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
