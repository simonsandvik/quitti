-- Ensure the receipts bucket exists and is public
INSERT INTO storage.buckets (id, name, public) 
VALUES ('receipts', 'receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- We don't need RLS policies because:
-- 1. Uploads are handled by Server Action (Service Role)
-- 2. Downloads are public (bucket is public)
