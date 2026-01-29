-- NEXTAUTH SCHEMA FOR SUPABASE ADAPTER
-- Required by @auth/supabase-adapter

-- 1. Create Schema
CREATE SCHEMA IF NOT EXISTS next_auth;

-- 2. Users Table
CREATE TABLE IF NOT EXISTS next_auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT UNIQUE,
  "emailVerified" TIMESTAMP WITH TIME ZONE,
  image TEXT
);

-- 3. Accounts Table
CREATE TABLE IF NOT EXISTS next_auth.accounts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at BIGINT,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  oauth_token_secret TEXT,
  oauth_token TEXT,
  "userId" UUID REFERENCES next_auth.users(id) ON DELETE CASCADE,
  UNIQUE(provider, "providerAccountId")
);

-- 4. Sessions Table
CREATE TABLE IF NOT EXISTS next_auth.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expires TIMESTAMP WITH TIME ZONE NOT NULL,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId" UUID REFERENCES next_auth.users(id) ON DELETE CASCADE
);

-- 5. Verification Tokens Table
CREATE TABLE IF NOT EXISTS next_auth.verification_tokens (
  identifier TEXT,
  token TEXT PRIMARY KEY,
  expires TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 6. Permissions (NextAuth needs to access this schema)
GRANT USAGE ON SCHEMA next_auth TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA next_auth TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA next_auth TO service_role;
