-- FIX: Add missing Google OAuth column 'refresh_token_expires_in'
-- Required for Google Login

ALTER TABLE next_auth.accounts 
ADD COLUMN IF NOT EXISTS refresh_token_expires_in INTEGER;
