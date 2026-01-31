-- REPORT SHARES (Bookkeeper Access)

CREATE TABLE IF NOT EXISTS public.report_shares (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  batch_id UUID REFERENCES public.batches(id) ON DELETE CASCADE, -- Optional: link to batch if we implement batches fully later
  user_id UUID REFERENCES next_auth.users(id) ON DELETE CASCADE, -- Shared by this user (all their active receipts)
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE DEFAULT (NOW() + INTERVAL '30 days'),
  views INTEGER DEFAULT 0
);

-- RLS: Only the creator can manage their shares
ALTER TABLE public.report_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own shares"
  ON public.report_shares
  FOR ALL
  USING (auth.uid() = user_id);

-- Public Access: Anyone with the token can READ (via API, usually bypassed by service_role, but good to have)
-- Ideally, the API will use service_role to fetch details by token, so we strictly control access via the backend route code,
-- but a policy for the "anon" role to select by token is also a valid pattern if we did client-side fetching.
-- For safety, we will NOT allow anon access via RLS. The Next.js API route will verify the token and return data.
