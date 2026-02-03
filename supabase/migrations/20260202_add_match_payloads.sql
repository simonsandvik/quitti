-- Add storage for raw match data to enable instant portal downloads
ALTER TABLE public.matched_receipts
ADD COLUMN IF NOT EXISTS matched_html TEXT,
ADD COLUMN IF NOT EXISTS matched_data JSONB;

COMMENT ON COLUMN public.matched_receipts.matched_html IS 'Full HTML body of the matched email (for on-the-fly PDF generation)';
COMMENT ON COLUMN public.matched_receipts.matched_data IS 'Raw API response data (e.g. Meta Ads transaction details) for themed PDF generation';
