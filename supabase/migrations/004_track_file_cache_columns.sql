-- Cache processed tracks by content hash so repeated uploads can reuse stems.

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS file_hash text,
  ADD COLUMN IF NOT EXISTS original_size_bytes bigint;

CREATE INDEX IF NOT EXISTS idx_tracks_user_file_hash
  ON public.tracks(user_id, file_hash)
  WHERE file_hash IS NOT NULL;
