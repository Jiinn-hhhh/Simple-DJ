-- Track Library: tracks table + RLS + storage
-- Run this in Supabase SQL Editor

-- 1. tracks table
CREATE TABLE IF NOT EXISTS public.tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  original_filename text NOT NULL,
  bpm real,
  key text,
  duration real,
  status text NOT NULL DEFAULT 'uploading'
    CHECK (status IN ('uploading','analyzing','separating','converting','ready','error')),
  error_message text,
  stem_urls jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Index for user queries
CREATE INDEX IF NOT EXISTS idx_tracks_user_id ON public.tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_tracks_status ON public.tracks(status);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tracks_updated_at
  BEFORE UPDATE ON public.tracks
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- 2. RLS: users can only access their own tracks
ALTER TABLE public.tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tracks"
  ON public.tracks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tracks"
  ON public.tracks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tracks"
  ON public.tracks FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own tracks"
  ON public.tracks FOR DELETE
  USING (auth.uid() = user_id);

-- Service role bypass (for backend updates)
CREATE POLICY "Service role full access"
  ON public.tracks FOR ALL
  USING (auth.role() = 'service_role');

-- 3. Storage bucket for stems
INSERT INTO storage.buckets (id, name, public)
VALUES ('stems', 'stems', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: users can access their own folder
CREATE POLICY "Users can upload to own folder"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'stems'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can read own stems"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'stems'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own stems"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'stems'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Service role storage access"
  ON storage.objects FOR ALL
  USING (
    bucket_id = 'stems'
    AND auth.role() = 'service_role'
  );
