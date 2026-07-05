const DB_NAME = 'simple-dj-local-library';
const DB_VERSION = 2;
const TRACKS_STORE = 'tracks';
const STEMS_STORE = 'stems';
const SETTINGS_STORE = 'settings';
const STEM_DIRECTORY_KEY = 'stemDirectory';

let dbPromise = null;

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function openLocalLibraryDb() {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(TRACKS_STORE)) {
        const tracks = db.createObjectStore(TRACKS_STORE, { keyPath: 'id' });
        tracks.createIndex('created_at', 'created_at');
        tracks.createIndex('file_hash', 'file_hash', { unique: false });
        tracks.createIndex('status', 'status', { unique: false });
      }

      if (!db.objectStoreNames.contains(STEMS_STORE)) {
        db.createObjectStore(STEMS_STORE, { keyPath: 'key' });
      }

      if (!db.objectStoreNames.contains(SETTINGS_STORE)) {
        db.createObjectStore(SETTINGS_STORE, { keyPath: 'key' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

export async function getAllTracks() {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(TRACKS_STORE, 'readonly');
  const tracks = await requestToPromise(tx.objectStore(TRACKS_STORE).getAll());
  return tracks.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
}

export async function getTrack(trackId) {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(TRACKS_STORE, 'readonly');
  return requestToPromise(tx.objectStore(TRACKS_STORE).get(trackId));
}

export async function findReadyTrackByHash(fileHash) {
  if (!fileHash) return null;

  const db = await openLocalLibraryDb();
  const tx = db.transaction(TRACKS_STORE, 'readonly');
  const index = tx.objectStore(TRACKS_STORE).index('file_hash');
  const tracks = await requestToPromise(index.getAll(fileHash));
  return tracks.find(track => track.status === 'ready' && (track.stem_files || track.stem_keys)) || null;
}

export async function putTrack(track) {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(TRACKS_STORE, 'readwrite');
  tx.objectStore(TRACKS_STORE).put(track);
  await txDone(tx);
  return track;
}

export async function patchTrack(trackId, patch) {
  const current = await getTrack(trackId);
  if (!current) return null;
  const next = {
    ...current,
    ...patch,
    updated_at: new Date().toISOString(),
  };
  await putTrack(next);
  return next;
}

export async function deleteTrackRecord(trackId) {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(TRACKS_STORE, 'readwrite');
  tx.objectStore(TRACKS_STORE).delete(trackId);
  await txDone(tx);
}

export async function putStemBlob(key, blob) {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(STEMS_STORE, 'readwrite');
  tx.objectStore(STEMS_STORE).put({
    key,
    blob,
    size: blob.size,
    type: blob.type,
    created_at: new Date().toISOString(),
  });
  await txDone(tx);
}

export async function getStemBlob(key) {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(STEMS_STORE, 'readonly');
  const record = await requestToPromise(tx.objectStore(STEMS_STORE).get(key));
  return record?.blob || null;
}

export async function deleteStemBlobs(keys) {
  if (!keys?.length) return;
  const db = await openLocalLibraryDb();
  const tx = db.transaction(STEMS_STORE, 'readwrite');
  const store = tx.objectStore(STEMS_STORE);
  keys.forEach(key => store.delete(key));
  await txDone(tx);
}

export async function saveStemDirectoryHandle(handle) {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(SETTINGS_STORE, 'readwrite');
  tx.objectStore(SETTINGS_STORE).put({
    key: STEM_DIRECTORY_KEY,
    handle,
    name: handle.name,
    updated_at: new Date().toISOString(),
  });
  await txDone(tx);
}

export async function getStemDirectoryRecord() {
  const db = await openLocalLibraryDb();
  const tx = db.transaction(SETTINGS_STORE, 'readonly');
  return requestToPromise(tx.objectStore(SETTINGS_STORE).get(STEM_DIRECTORY_KEY));
}

export function createLocalTrackId() {
  if (crypto?.randomUUID) return `local_${crypto.randomUUID()}`;
  return `local_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
