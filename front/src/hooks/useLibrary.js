import { useState, useEffect, useCallback, useRef } from 'react';
import { analyzeTrack, startSeparation, pollJobStatus } from '../lib/api';
import {
  createLocalTrackId,
  deleteStemBlobs,
  deleteTrackRecord,
  findReadyTrackByHash,
  getAllTracks,
  getStemBlob,
  patchTrack,
  putTrack,
} from '../lib/localLibraryDb';
import {
  deleteStemFile,
  getStoredStemFolderStatus,
  getWritableStemDirectory,
  readStemFile,
  requestStemFolder,
  writeStemFile,
} from '../lib/localStemFolder';
import { sha256File } from '../utils/fileHash';
import { parseTrackNameFromFilename } from '../utils/trackName';

const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const PROCESSING_STATUSES = ['uploading', 'analyzing', 'separating', 'converting'];

function sortTracks(tracks) {
  return [...tracks].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

function isProcessing(track) {
  return PROCESSING_STATUSES.includes(track.status);
}

function buildStemRelativePath(trackId, stemName) {
  return `${trackId}/${stemName}.wav`;
}

function resolveDownloadUrl(stemInfo, baseUrl) {
  let url = stemInfo.download_url;
  if (url?.startsWith('/')) {
    url = `${baseUrl || ''}${url}`;
  }
  return url;
}

async function fetchStemBlob(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error(`Stem download failed: ${response.status}`);
  }
  return response.blob();
}

export default function useLibrary() {
  const [tracks, setTracks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stemFolderInfo, setStemFolderInfo] = useState({
    supported: false,
    configured: false,
    name: '',
    permission: 'missing',
  });

  const queueRef = useRef([]);
  const processingRef = useRef(false);
  const abortRef = useRef(null);
  const currentTrackIdRef = useRef(null);
  const [uploadQueueInfo, setUploadQueueInfo] = useState({ pending: 0, currentFile: null, lastError: null });

  const upsertTrackState = useCallback((track) => {
    setTracks(prev => {
      const exists = prev.some(t => t.id === track.id);
      const next = exists
        ? prev.map(t => t.id === track.id ? track : t)
        : [track, ...prev];
      return sortTracks(next);
    });
  }, []);

  const refreshStemFolderInfo = useCallback(async () => {
    const nextInfo = await getStoredStemFolderStatus();
    setStemFolderInfo(nextInfo);
    return nextInfo;
  }, []);

  const patchLocalTrack = useCallback(async (trackId, patch) => {
    const updated = await patchTrack(trackId, patch);
    if (updated) upsertTrackState(updated);
    return updated;
  }, [upsertTrackState]);

  const fetchTracks = useCallback(async () => {
    setLoading(true);
    const storedTracks = await getAllTracks();
    const normalizedTracks = [];

    for (const track of storedTracks) {
      if (isProcessing(track)) {
        const updated = await patchTrack(track.id, {
          status: 'error',
          error_message: 'Processing was interrupted. Please import this track again.',
        });
        normalizedTracks.push(updated || track);
      } else {
        normalizedTracks.push(track);
      }
    }

    setTracks(sortTracks(normalizedTracks));
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchTracks().catch((err) => {
      console.error('Local library load failed:', err);
      setLoading(false);
    });
  }, [fetchTracks]);

  useEffect(() => {
    refreshStemFolderInfo().catch((err) => {
      console.warn('Stem folder status check failed:', err);
    });
  }, [refreshStemFolderInfo]);

  const chooseStemFolder = useCallback(async () => {
    const folder = await requestStemFolder();
    const nextInfo = {
      supported: true,
      configured: true,
      name: folder.name,
      permission: folder.permission,
    };
    setStemFolderInfo(nextInfo);
    return nextInfo;
  }, []);

  const createReadyTrackFromCache = useCallback(async (file, fileHash, cachedTrack) => {
    const parsedTrackName = parseTrackNameFromFilename(file.name);
    const now = new Date().toISOString();
    const track = {
      id: createLocalTrackId(),
      artist: parsedTrackName.artist,
      title: parsedTrackName.title,
      original_filename: file.name,
      file_hash: fileHash,
      original_size_bytes: file.size,
      bpm: cachedTrack.bpm,
      key: cachedTrack.key,
      duration: cachedTrack.duration,
      stem_files: cachedTrack.stem_files || null,
      stem_keys: cachedTrack.stem_keys || null,
      status: 'ready',
      created_at: now,
      updated_at: now,
      local_cached_from: cachedTrack.id,
    };

    await putTrack(track);
    upsertTrackState(track);
    return track;
  }, [upsertTrackState]);

  const uploadSingle = useCallback(async (file, signal) => {
    const parsedTrackName = parseTrackNameFromFilename(file.name);
    const fileHash = await sha256File(file);
    const cachedTrack = await findReadyTrackByHash(fileHash);
    const stemDirectory = await getWritableStemDirectory();
    await refreshStemFolderInfo();

    if (signal?.aborted) {
      throw new DOMException('Upload cancelled', 'AbortError');
    }

    if (cachedTrack) {
      return createReadyTrackFromCache(file, fileHash, cachedTrack);
    }

    const now = new Date().toISOString();
    const track = {
      id: createLocalTrackId(),
      artist: parsedTrackName.artist,
      title: parsedTrackName.title,
      original_filename: file.name,
      file_hash: fileHash,
      original_size_bytes: file.size,
      status: 'uploading',
      created_at: now,
      updated_at: now,
      stem_files: null,
      stem_keys: null,
    };

    await putTrack(track);
    upsertTrackState(track);
    currentTrackIdRef.current = track.id;

    try {
      await patchLocalTrack(track.id, { status: 'analyzing', error_message: null });
      const analysis = await analyzeTrack(file);

      if (signal?.aborted) {
        throw new DOMException('Upload cancelled', 'AbortError');
      }

      await patchLocalTrack(track.id, {
        bpm: analysis.bpm || 128,
        key: analysis.key || 'C major',
        duration: analysis.duration || 0,
        status: 'separating',
      });

      const separation = await startSeparation(file);
      const jobId = separation.job_id;
      const pollUrl = separation.hf_space_url || null;
      const jobResult = await pollJobStatus(jobId, pollUrl);
      const stemEntries = Object.entries(jobResult.stems || {});

      if (stemEntries.length === 0) {
        throw new Error('No stems returned from separation job');
      }

      await patchLocalTrack(track.id, { status: 'converting' });

      const stemKeys = {};
      for (const [stemName, stemInfo] of stemEntries) {
        if (signal?.aborted) {
          throw new DOMException('Upload cancelled', 'AbortError');
        }

        const url = resolveDownloadUrl(stemInfo, pollUrl || separation.hf_space_url);
        if (!url) throw new Error(`Missing download URL for ${stemName}`);

        const blob = await fetchStemBlob(url, signal);
        const stemPath = buildStemRelativePath(track.id, stemName);
        await writeStemFile(stemDirectory, stemPath, blob);
        stemKeys[stemName] = stemPath;
      }

      return patchLocalTrack(track.id, {
        status: 'ready',
        error_message: null,
        separated: true,
        job_id: jobId,
        stem_files: stemKeys,
        stem_keys: null,
      });
    } catch (err) {
      if (err.name !== 'AbortError') {
        await patchLocalTrack(track.id, {
          status: 'error',
          error_message: err?.message || String(err),
        });
      }
      throw err;
    }
  }, [createReadyTrackFromCache, patchLocalTrack, refreshStemFolderInfo, upsertTrackState]);

  const deleteTrack = useCallback(async (trackId) => {
    const track = tracks.find(t => t.id === trackId);
    if (!track) return;

    const sharedStemFiles = new Set();
    const sharedStemKeys = new Set();
    tracks.forEach((otherTrack) => {
      if (otherTrack.id === trackId) return;
      Object.values(otherTrack.stem_files || {}).forEach((path) => {
        if (path) sharedStemFiles.add(path);
      });
      Object.values(otherTrack.stem_keys || {}).forEach((key) => {
        if (key) sharedStemKeys.add(key);
      });
    });

    const filePathsToDelete = Object.values(track.stem_files || {})
      .filter(Boolean)
      .filter(path => !sharedStemFiles.has(path));

    if (filePathsToDelete.length > 0) {
      try {
        const stemDirectory = await getWritableStemDirectory();
        await Promise.all(filePathsToDelete.map(path => deleteStemFile(stemDirectory, path).catch(() => {})));
      } catch (err) {
        console.warn('Could not delete stem files from folder:', err);
      }
    }

    const keysToDelete = Object.values(track.stem_keys || {})
      .filter(Boolean)
      .filter(key => !sharedStemKeys.has(key));
    await deleteStemBlobs(keysToDelete);
    await deleteTrackRecord(trackId);
    setTracks(prev => prev.filter(t => t.id !== trackId));
  }, [tracks]);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;

    while (queueRef.current.length > 0) {
      const file = queueRef.current[0];
      setUploadQueueInfo(prev => ({ ...prev, pending: queueRef.current.length, currentFile: file.name }));

      const controller = new AbortController();
      abortRef.current = controller;
      currentTrackIdRef.current = null;
      const timeoutId = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS);

      try {
        await uploadSingle(file, controller.signal);
        setUploadQueueInfo(prev => ({ ...prev, lastError: null }));
      } catch (err) {
        const errMsg = err?.message || String(err);
        if (err.name === 'AbortError') {
          console.warn(`Local import cancelled or timed out: "${file.name}"`);
          if (currentTrackIdRef.current) {
            await deleteTrack(currentTrackIdRef.current);
          }
        } else {
          console.error(`Local import failed, skipping: "${file.name}"`, errMsg);
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
    fetchTracks();
  }, [deleteTrack, fetchTracks, uploadSingle]);

  const uploadTrack = useCallback((file) => {
    queueRef.current.push(file);
    setUploadQueueInfo(prev => ({ ...prev, pending: queueRef.current.length }));
    processQueue();
  }, [processQueue]);

  const cancelProcessingTrack = useCallback(async (trackId) => {
    if (currentTrackIdRef.current === trackId && abortRef.current) {
      abortRef.current.abort();
      return;
    }
    await deleteTrack(trackId);
  }, [deleteTrack]);

  const clearQueue = useCallback(() => {
    const startIdx = processingRef.current ? 1 : 0;
    queueRef.current.splice(startIdx);
    setUploadQueueInfo(prev => ({ ...prev, pending: queueRef.current.length }));
  }, []);

  const updateTrackMetadata = useCallback(async (trackId, patch) => {
    return patchLocalTrack(trackId, patch);
  }, [patchLocalTrack]);

  const getStemUrls = useCallback(async (track) => {
    if (!track?.stem_files && !track?.stem_keys) return null;

    const urls = {};
    if (track.stem_files) {
      const stemDirectory = await getWritableStemDirectory();
      for (const [stemName, stemPath] of Object.entries(track.stem_files)) {
        const file = await readStemFile(stemDirectory, stemPath);
        urls[stemName] = URL.createObjectURL(file);
      }
    }

    for (const [stemName, stemKey] of Object.entries(track.stem_keys || {})) {
      if (urls[stemName]) continue;
      const blob = await getStemBlob(stemKey);
      if (blob) {
        urls[stemName] = URL.createObjectURL(blob);
      }
    }

    return Object.keys(urls).length > 0 ? urls : null;
  }, []);

  return {
    tracks,
    loading,
    uploadTrack,
    deleteTrack,
    getStemUrls,
    refreshTracks: fetchTracks,
    uploadQueueInfo,
    cancelProcessingTrack,
    clearQueue,
    updateTrackMetadata,
    stemFolderInfo,
    chooseStemFolder,
    refreshStemFolderInfo,
  };
}
