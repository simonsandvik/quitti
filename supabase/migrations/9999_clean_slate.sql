-- ULTIMATE RE-INITIALIZATION (Standard Setup)
-- Run this to clear all ghost data and start fresh

-- 1. Wipe everything (Careful: This deletes all users/batches)
DROP SCHEMA IF EXISTS next_auth CASCADE;
DROP TABLE IF EXISTS public.matched_receipts CASCADE;
DROP TABLE IF EXISTS public.receipt_requests CASCADE;
DROP TABLE IF EXISTS public.batches CASCADE;
DROP TABLE IF EXISTS public.organization_members CASCADE;
DROP TYPE IF EXISTS public.org_role CASCADE;
DROP TABLE IF EXISTS public.organizations CASCADE;

-- 2. Setup standard NextAuth Schema
CREATE SCHEMA next_auth;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE next_auth.users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT,
  email TEXT UNIQUE,
  "emailVerified" TIMESTAMP WITH TIME ZONE,
  image TEXT
);

CREATE TABLE next_auth.accounts (
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

CREATE TABLE next_auth.sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expires TIMESTAMP WITH TIME ZONE NOT NULL,
  "sessionToken" TEXT UNIQUE NOT NULL,
  "userId" UUID REFERENCES next_auth.users(id) ON DELETE CASCADE
);

CREATE TABLE next_auth.verification_tokens (
  identifier TEXT,
  token TEXT PRIMARY KEY,
  expires TIMESTAMP WITH TIME ZONE NOT NULL
);

-- 3. Setup Platform Tables (Linked to next_auth.users)
CREATE TABLE public.organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TYPE public.org_role AS ENUM ('admin', 'contributor', 'bookkeeper');
CREATE TABLE public.organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES next_auth.users(id) ON DELETE CASCADE,
  role org_role DEFAULT 'contributor',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

CREATE TABLE public.batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  created_by UUID REFERENCES next_auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.receipt_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  date DATE,
  status TEXT DEFAULT 'pending',
  is_truly_missing BOOLEAN DEFAULT FALSE,
  missing_reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE public.matched_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES public.receipt_requests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  matched_by UUID REFERENCES next_auth.users(id),
  confidence INTEGER DEFAULT 0,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Permissions
GRANT USAGE ON SCHEMA next_auth TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA next_auth TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA next_auth TO service_role;
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
