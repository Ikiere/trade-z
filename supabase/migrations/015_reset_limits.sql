-- ============================================================================
-- Trade-Z Database Schema Migration — Reset daily signal limits
-- ============================================================================

-- Update user settings to set the default signal limit to 1000 for all users
ALTER TABLE user_settings 
  ALTER COLUMN daily_signal_limit SET DEFAULT 1000;

UPDATE user_settings 
  SET daily_signal_limit = 1000;

-- Truncate signals to clear count of today's signals
TRUNCATE TABLE signals CASCADE;
