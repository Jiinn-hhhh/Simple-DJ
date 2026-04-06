import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function useLibrary(user) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch user's tracks from Supabase
  const fetchTracks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('tracks')
      .select('*')
      .order('created_at', { ascending: false });
    if (!error) setTracks(data || []);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      // Clear state on logout
      setTracks([]);
      setLoading(false);
      return;
    }

    fetchTracks();

    // Subscribe to realtime changes on tracks table for this user
    const channel = supabase
      .channel('tracks-changes')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'tracks',
        filter: `user_id=eq.${user.id}`
      }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setTracks(prev => [payload.new, ...prev]);
        } else if (payload.eventType === 'UPDATE') {
          setTracks(prev => prev.map(t => t.id === payload.new.id ? payload.new : t));
        } else if (payload.eventType === 'DELETE') {
          setTracks(prev => prev.filter(t => t.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchTracks]);

  // Upload a track to the library
  const uploadTrack = useCallback(async (file) => {
    if (!user) return;

    // 1. Extract title from filename (remove extension)
    const title = file.name.replace(/\.[^.]+$/, '');

    // 2. Create track record in Supabase (status: uploading)
    const { data: track, error: insertError } = await supabase
      .from('tracks')
      .insert({
        user_id: user.id,
        title: title,
        original_filename: file.name,
        status: 'uploading'
      })
      .select()
      .single();

    if (insertError) throw insertError;

    // 3. Get session token for auth
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('Not authenticated');

    // 4. Send to backend for processing
    const formData = new FormData();
    formData.append('file', file);
    formData.append('track_id', track.id);

    const res = await fetch(`${API_BASE}/library/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`
      },
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
    }

    return track;
  }, [user]);

  // Delete a track (DB + Storage)
  const deleteTrack = useCallback(async (trackId) => {
    if (!user) return;

    // Find track to get stem_urls for storage cleanup
    const track = tracks.find(t => t.id === trackId);

    // Delete storage files if stem_urls exist
    if (track?.stem_urls) {
      const paths = Object.values(track.stem_urls).map(p => p);
      if (paths.length > 0) {
        await supabase.storage.from('stems').remove(paths);
      }
    }

    // Delete DB record (cascades via RLS)
    await supabase.from('tracks').delete().eq('id', trackId);
  }, [user, tracks]);

  // Get signed URLs for a track's stems
  const getStemUrls = useCallback(async (track) => {
    if (!track?.stem_urls) return null;

    const urls = {};
    for (const [stemName, path] of Object.entries(track.stem_urls)) {
      const { data } = await supabase.storage
        .from('stems')
        .createSignedUrl(path, 3600); // 1 hour expiry
      if (data?.signedUrl) {
        urls[stemName] = data.signedUrl;
      }
    }
    return urls;
  }, []);

  return { tracks, loading, uploadTrack, deleteTrack, getStemUrls, refreshTracks: fetchTracks };
}
