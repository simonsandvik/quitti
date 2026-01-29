-- FIX: Add missing Azure AD column 'ext_expires_in'
-- Required for Microsoft/Azure OAuth

ALTER TABLE next_auth.accounts 
ADD COLUMN IF NOT EXISTS ext_expires_in INTEGER;
