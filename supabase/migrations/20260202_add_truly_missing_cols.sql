-- Add storage for legally compliant missing receipt declarations
ALTER TABLE public.receipt_requests
ADD COLUMN IF NOT EXISTS is_truly_missing BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS missing_reason TEXT;

COMMENT ON COLUMN public.receipt_requests.is_truly_missing IS 'Indicates if the user has explicitly declared this receipt as truly missing for legal bookkeeping purposes';
COMMENT ON COLUMN public.receipt_requests.missing_reason IS 'The reason provided by the user for the missing receipt (from a controlled list or free text)';
