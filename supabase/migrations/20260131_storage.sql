-- Enable storage extension if not enabled (it is usually enabled by default in Supabase)
-- CREATE EXTENSION IF NOT EXISTS "storage";

-- Create specific bucket for receipts
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('receipts', 'receipts', false, 10485760, ARRAY['image/png', 'image/jpeg', 'application/pdf'])
ON CONFLICT (id) DO NOTHING;

-- Policies for receipt uploads (Authenticated users)
CREATE POLICY "Users can upload their own receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK ( bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1] );

-- Policies for reading receipts (Owner Only - via API download)
-- We will serve these via signed URLs or Service Role stream
CREATE POLICY "Users can read their own receipts"
ON storage.objects FOR SELECT
TO authenticated
USING ( bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1] );

-- Policies for deleting
CREATE POLICY "Users can delete their own receipts"
ON storage.objects FOR DELETE
TO authenticated
USING ( bucket_id = 'receipts' AND auth.uid()::text = (storage.foldername(name))[1] );
