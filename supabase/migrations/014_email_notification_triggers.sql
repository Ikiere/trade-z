-- ============================================================================
-- Trade-Z: Supabase Email Notifications & Session Triggers
-- Copy and run this script in your Supabase SQL Editor to set up:
--   1. Automatic Signal Alert Webhooks (Good vs Risky setups)
--   2. Session Open Alert Triggers (London / New York Session starts)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Setup Signal Insert Webhook (Notifies when a new signal is generated)
-- ─────────────────────────────────────────────────────────────────────────────

-- Function that gets triggered when a new row is added to the signals table
CREATE OR REPLACE FUNCTION notify_user_of_signal()
RETURNS TRIGGER AS $$
DECLARE
  user_email TEXT;
  signal_quality TEXT;
  email_subject TEXT;
  email_body TEXT;
BEGIN
  -- 1. Fetch user's email from auth.users table
  SELECT email INTO user_email FROM auth.users WHERE id = NEW.user_id;
  
  IF user_email IS NULL THEN
    RETURN NEW;
  END IF;

  -- 2. Determine signal classification details
  IF NEW.status = 'active' THEN
    signal_quality := '🟢 GOOD TRADE SETUP (APPROVED)';
    email_subject := '🚀 Trade-Z: New Valid Trade Signal (' || NEW.pair || ')';
  ELSE
    signal_quality := '🔴 RISKY SETUP (REJECTED / AVOID)';
    email_subject := '⚠️ Trade-Z: SafeGuard Alert (' || NEW.pair || ' Rejection)';
  END IF;

  -- 3. Construct the HTML email body template
  email_body := '<h2>Hello Trader,</h2>' ||
                '<p>A new AI Market Scanner analysis is complete.</p>' ||
                '<div style="padding: 15px; border-radius: 8px; background: #0f172a; color: #fff; font-family: monospace;">' ||
                '  <h3 style="margin: 0; color: #38bdf8;">' || signal_quality || '</h3>' ||
                '  <p><strong>Asset Pair:</strong> ' || NEW.pair || '</p>' ||
                '  <p><strong>Direction:</strong> ' || UPPER(NEW.direction) || ' (' || NEW.order_type || ')</p>' ||
                '  <p><strong>Entry Price:</strong> ' || NEW.entry_price || '</p>' ||
                '  <p><strong>Stop Loss:</strong> ' || NEW.stop_loss || '</p>' ||
                '  <p><strong>Take Profit:</strong> ' || NEW.take_profit || '</p>' ||
                '  <p><strong>Confidence:</strong> ' || NEW.confidence || '%</p>' ||
                '  <p><strong>Reasoning:</strong> ' || COALESCE(NEW.ai_reasoning, 'No additional confluences.') || '</p>' ||
                '</div>' ||
                '<p><a href="https://trade-z-web.vercel.app/signals" style="display: inline-block; padding: 10px 20px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 6px;">View Signal Dashboard</a></p>';

  -- 4. Send email using Supabase HTTP Hook to NestJS backend email dispatcher
  -- Note: The NestJS API receives this payload and sends the email via Resend
  PERFORM net.http_post(
    url := 'https://trade-z-production-9a14.up.railway.app/api/v1/email/notify-signal',
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := json_build_object(
      'to', user_email,
      'subject', email_subject,
      'html', email_body
    )::text::bytea
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Bypasses failures to ensure signal row insert still succeeds if webhook is slow
  RAISE WARNING 'Email notification failed to dispatch: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the signals table
DROP TRIGGER IF EXISTS trigger_notify_signal ON signals;
CREATE TRIGGER trigger_notify_signal
  AFTER INSERT ON signals
  FOR EACH ROW
  EXECUTE FUNCTION notify_user_of_signal();


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Setup Session Alerts (London & New York Sessions opens)
-- ─────────────────────────────────────────────────────────────────────────────

-- Function to email users when a key market session opens
CREATE OR REPLACE FUNCTION notify_users_session_open(session_name TEXT)
RETURNS VOID AS $$
DECLARE
  user_rec RECORD;
  email_subject TEXT;
  email_body TEXT;
BEGIN
  email_subject := '🔔 Trade-Z Session Open: ' || session_name || ' Open Alert';
  email_body := '<h2>Hello Trader,</h2>' ||
                '<p>The <strong>' || session_name || ' Trading Session</strong> is now officially OPEN!</p>' ||
                '<p>Liquidity is increasing. Login to run the AI Market Scanner and generate today''s daily scalp setups.</p>' ||
                '<p><a href="https://trade-z-web.vercel.app/dashboard" style="display: inline-block; padding: 10px 20px; background: #0284c7; color: #fff; text-decoration: none; border-radius: 6px;">Go to Dashboard</a></p>';

  -- Loop through all active users and enqueue session alert email
  FOR user_rec IN SELECT email FROM auth.users LOOP
    PERFORM net.http_post(
      url := 'https://trade-z-production-9a14.up.railway.app/api/v1/email/notify-signal',
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := json_build_object(
        'to', user_rec.email,
        'subject', email_subject,
        'html', email_body
      )::text::bytea
    );
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Automate Session Open Calls using Supabase pg_cron (Cron Scheduler)
-- ─────────────────────────────────────────────────────────────────────────────
-- Note: Execute these inside your editor to schedule daily cron checks.
-- Make sure the pg_cron extension is enabled in your database extensions.

-- SELECT cron.schedule('london-open-notify', '0 8 * * 1-5', 'SELECT notify_users_session_open(''London'');');
-- SELECT cron.schedule('newyork-open-notify', '0 13 * * 1-5', 'SELECT notify_users_session_open(''New York'');');
