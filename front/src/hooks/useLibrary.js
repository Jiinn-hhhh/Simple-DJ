import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";
const UPLOAD_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export default function useLibrary(user) {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);

  // --- Upload queue state ---
  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const abortRef = useRef(null); // AbortController for current upload
  const currentTrackIdRef = useRef(null); // track ID of current upload
  const [uploadQueueInfo, setUploadQueueInfo] = useState({ pending: 0, currentFile: null, lastError: null });

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
      setTracks([]);
      setLoading(false);
      return;
    }

    fetchTracks();

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

  // Upload a single track (internal) — with AbortController + timeout
  const uploadSingle = useCallback(async (file, signal) => {
    if (!user) return;

    const title = file.name.replace(/\.[^.]+$/, '');

    // Create track record
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

    if (insertError) throw new Error(insertError.message || 'Failed to create track record');

    currentTrackIdRef.current = track.id;

    // Check abort before network call (cleanup owned by processQueue)
    if (signal?.aborted) {
      throw new DOMException('Upload cancelled', 'AbortError');
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      await supabase.from('tracks').update({ status: 'error' }).eq('id', track.id);
      throw new Error('Not authenticated');
    }

    const formData = new FormData();
    formData.append('file', file);
    formData.append('track_id', track.id);

    const res = await fetch(`${API_BASE}/library/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${session.access_token}` },
      body: formData,
      signal
    });

    if (!res.ok) {
      // Mark track as error in DB
      await supabase.from('tracks').update({ status: 'error' }).eq('id', track.id);
      const err = await res.json().catch(() => ({}));
      throw new Error(err.detail || 'Upload failed');
    }

    return track;
  }, [user]);

  // Process upload queue sequentially
  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const file = queueRef.current[0];
      setUploadQueueInfo(prev => ({ ...prev, pending: queueRef.current.length, currentFile: file.name }));

      // Create AbortController for this upload
      const controller = new AbortController();
      abortRef.current = controller;
      currentTrackIdRef.current = null;

      // Set up timeout
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      try {
        await uploadSingle(file, controller.signal);
        setUploadQueueInfo(prev => ({ ...prev, lastError: null }));
      } catch (err) {
        const errMsg = err?.message || String(err);
        if (err.name === 'AbortError') {
          console.warn(`Upload cancelled or timed out: "${file.name}"`);
          if (currentTrackIdRef.current) {
            await supabase.from('tracks').delete().eq('id', currentTrackIdRef.current).catch(() => {});
          }
        } else {
          console.error(`Upload failed, skipping: "${file.name}" —`, errMsg);
          setUploadQueueInfo(prev => ({ ...prev, lastError: `${file.name}: ${errMsg}` }));
        }
      }

      clearTimeout(timeoutId);
      abortRef.current = null;
      currentTrackIdRef.current = null;
      queueRef.current.shift();
    }

    setUploadQueueInfo(prev => ({ ...prev, pending: 0, currentFile: null }));
    processingRef.current = false;
  }, [uploadSingle]);

  // Public: enqueue a file for upload
  const uploadTrack = useCallback((file) => {
    queueRef.current.push(file);
    setUploadQueueInfo(prev => ({ ...prev, pending: queueRef.current.length }));
    processQueue();
  }, [processQueue]);

  // Cancel a specific processing track (already in Supabase)
  const cancelProcessingTrack = useCallback(async (trackId) => {
    // If this is the currently uploading track, abort the fetch
    if (currentTrackIdRef.current === trackId && abortRef.current) {
      abortRef.current.abort();
      return; // cleanup handled by processQueue catch block
    }
    // Otherwise just delete/error the track in DB
    await supabase.from('tracks').delete().eq('id', trackId).catch(() => {});
  }, []);

  // Clear all pending items from the queue (does not cancel current)
  const clearQueue = useCallback(() => {
    const startIdx = processingRef.current ? 1 : 0;
    queueRef.current.splice(startIdx);
    setUploadQueueInfo(prev => ({ ...prev, pending: queueRef.current.length }));
  }, []);

  // Delete a track (DB + Storage)
  const deleteTrack = useCallback(async (trackId) => {
    if (!user) return;

    const track = tracks.find(t => t.id === trackId);

    if (track?.stem_urls) {
      const paths = Object.values(track.stem_urls).map(p => p);
      if (paths.length > 0) {
        await supabase.storage.from('stems').remove(paths);
      }
    }

    await supabase.from('tracks').delete().eq('id', trackId);
  }, [user, tracks]);

  // Get signed URLs for a track's stems
  const getStemUrls = useCallback(async (track) => {
    if (!track?.stem_urls) return null;

    const urls = {};
    for (const [stemName, path] of Object.entries(track.stem_urls)) {
      const { data } = await supabase.storage
        .from('stems')
        .createSignedUrl(path, 3600);
      if (data?.signedUrl) {
        urls[stemName] = data.signedUrl;
      }
    }
    return urls;
  }, []);

  return {
    tracks, loading, uploadTrack, deleteTrack, getStemUrls,
    refreshTracks: fetchTracks, uploadQueueInfo,
    cancelProcessingTrack, clearQueue
  };
}
