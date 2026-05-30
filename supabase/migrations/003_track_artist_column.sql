-- Split library track metadata into artist + title.
-- Existing rows that are already formatted as "Artist - Title" are backfilled.

ALTER TABLE public.tracks
  ADD COLUMN IF NOT EXISTS artist text;

UPDATE public.tracks
SET
  artist = NULLIF(BTRIM(SPLIT_PART(title, ' - ', 1)), ''),
  title = NULLIF(BTRIM(SUBSTRING(title FROM POSITION(' - ' IN title) + 3)), '')
WHERE POSITION(' - ' IN title) > 0
  AND (artist IS NULL OR BTRIM(artist) = '');

CREATE INDEX IF NOT EXISTS idx_tracks_artist
  ON public.tracks(user_id, artist);
