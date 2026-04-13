-- Add hot_cues JSONB column to tracks table for per-track hot cue persistence
ALTER TABLE public.tracks ADD COLUMN IF NOT EXISTS hot_cues jsonb DEFAULT '[]'::jsonb;
