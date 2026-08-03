-- ============================================================================
-- Trade-Z Database Schema Migration — TwelveData API Integration
-- ============================================================================

ALTER TABLE user_settings
  ADD COLUMN IF NOT EXISTS twelve_data_api_key TEXT;
