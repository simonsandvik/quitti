-- QUITTI PLATFORM SCHEMA (SUPABASE)

-- 1. Organizations (Teams)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Organizations Members (Roles)
CREATE TYPE org_role AS ENUM ('admin', 'contributor', 'bookkeeper');
CREATE TABLE organization_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  role org_role DEFAULT 'contributor',
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organization_id, user_id)
);

-- 3. Batches (Shared Lists)
CREATE TABLE batches (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active', -- active, archived, paid
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Receipt Requests (Queue)
CREATE TABLE receipt_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES batches(id) ON DELETE CASCADE,
  merchant TEXT NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  currency TEXT DEFAULT 'EUR',
  date DATE,
  status TEXT DEFAULT 'pending', -- pending, found, missing
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Matched Receipts (Files)
CREATE TABLE matched_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  request_id UUID REFERENCES receipt_requests(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL, -- Storage link
  matched_by UUID REFERENCES auth.users(id),
  confidence INTEGER DEFAULT 0,
  details TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. RLS (Row Level Security) - Basic Examples
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
-- (Add policies to only allow members to see their org, etc.)
