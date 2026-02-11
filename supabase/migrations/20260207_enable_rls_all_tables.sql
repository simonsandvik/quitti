-- Enable RLS on ALL public tables
-- All database operations now go through service_role (server actions),
-- so no anon-key policies are needed. This blocks direct API access via anon key.

-- NextAuth tables (contain OAuth tokens — CRITICAL)
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_tokens ENABLE ROW LEVEL SECURITY;

-- App tables
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.matched_receipts ENABLE ROW LEVEL SECURITY;

-- Grant service_role full access (it bypasses RLS anyway, but explicit is good)
GRANT ALL ON public.accounts TO service_role;
GRANT ALL ON public.sessions TO service_role;
GRANT ALL ON public.users TO service_role;
GRANT ALL ON public.verification_tokens TO service_role;
GRANT ALL ON public.organizations TO service_role;
GRANT ALL ON public.organization_members TO service_role;
GRANT ALL ON public.batches TO service_role;
GRANT ALL ON public.receipt_requests TO service_role;
GRANT ALL ON public.matched_receipts TO service_role;

-- Revoke direct access from anon role on sensitive tables
REVOKE ALL ON public.accounts FROM anon;
REVOKE ALL ON public.sessions FROM anon;
REVOKE ALL ON public.verification_tokens FROM anon;
