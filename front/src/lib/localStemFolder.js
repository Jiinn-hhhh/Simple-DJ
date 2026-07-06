import {
  getStemDirectoryRecord,
  saveStemDirectoryHandle,
} from './localLibraryDb';

const READWRITE = 'readwrite';
const STEM_FOLDER_NAME = 'Simple DJ Stems';
const STEM_MANIFEST_FILENAME = '.simple-dj-stems.json';
const STEM_MANIFEST_VERSION = 1;

export function isStemFolderSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

async function getPermissionState(handle, mode = READWRITE) {
  if (!handle?.queryPermission) return 'unsupported';
  return handle.queryPermission({ mode });
}

async function requestWritePermission(handle) {
  let permission = await getPermissionState(handle, READWRITE);
  if (permission !== 'granted' && handle?.requestPermission) {
    permission = await handle.requestPermission({ mode: READWRITE });
  }
  return permission;
}

function buildStemFolderManifest() {
  return {
    app: 'Simple DJ',
    type: 'stem-library',
    version: STEM_MANIFEST_VERSION,
    folder: STEM_FOLDER_NAME,
    layout: {
      trackFolder: '<local_track_id>/',
      stemFile: '<stem>.wav',
      stems: ['bass', 'drums', 'other', 'vocals'],
    },
    updated_at: new Date().toISOString(),
  };
}

async function writeStemFolderManifest(handle) {
  const fileHandle = await handle.getFileHandle(STEM_MANIFEST_FILENAME, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(JSON.stringify(buildStemFolderManifest(), null, 2));
  } finally {
    await writable.close();
  }
}

function validateStemFolderManifest(manifest) {
  return manifest?.app === 'Simple DJ'
    && manifest?.type === 'stem-library'
    && manifest?.version === STEM_MANIFEST_VERSION;
}

async function ensureStemFolderManifest(handle) {
  try {
    const fileHandle = await handle.getFileHandle(STEM_MANIFEST_FILENAME);
    const file = await fileHandle.getFile();
    const manifest = JSON.parse(await file.text());
    if (!validateStemFolderManifest(manifest)) {
      throw new Error('Invalid stem folder format.');
    }
  } catch (err) {
    if (err?.name !== 'NotFoundError') throw err;
    await writeStemFolderManifest(handle);
  }
}

export async function requestStemFolder() {
  if (!isStemFolderSupported()) {
    throw new Error('Stem folders require a Chromium browser with File System Access support.');
  }

  const parentHandle = await window.showDirectoryPicker({
    id: 'simple-dj-stem-location',
    mode: READWRITE,
    startIn: 'music',
  });

  const parentPermission = await requestWritePermission(parentHandle);
  if (parentPermission !== 'granted') {
    throw new Error('Stem folder location permission was not granted.');
  }

  const handle = parentHandle.name === STEM_FOLDER_NAME
    ? parentHandle
    : await parentHandle.getDirectoryHandle(STEM_FOLDER_NAME, { create: true });
  const permission = await requestWritePermission(handle);
  if (permission !== 'granted') {
    throw new Error('Stem folder permission was not granted.');
  }

  await ensureStemFolderManifest(handle);

  const displayName = parentHandle.name === STEM_FOLDER_NAME
    ? handle.name
    : `${parentHandle.name}/${handle.name}`;
  await saveStemDirectoryHandle(handle, displayName);
  return { handle, name: displayName, permission, format: 'ready' };
}

export async function getStoredStemFolderStatus() {
  const record = await getStemDirectoryRecord();
  if (!record?.handle) {
    return {
      supported: isStemFolderSupported(),
      configured: false,
      name: '',
      permission: 'missing',
    };
  }

  const permission = await getPermissionState(record.handle, READWRITE);
  let format = 'unchecked';
  let errorMessage = null;
  if (permission === 'granted') {
    try {
      await ensureStemFolderManifest(record.handle);
      format = 'ready';
    } catch (err) {
      format = 'invalid';
      errorMessage = err?.message || 'Invalid stem folder format.';
    }
  }

  return {
    supported: isStemFolderSupported(),
    configured: true,
    name: record.name || record.handle.name || 'Stem Folder',
    permission,
    format,
    error_message: errorMessage,
  };
}

export async function getWritableStemDirectory() {
  const record = await getStemDirectoryRecord();
  const handle = record?.handle;
  if (!handle) {
    throw new Error('Choose a stem folder before importing tracks.');
  }

  const permission = await getPermissionState(handle, READWRITE);
  if (permission !== 'granted') {
    throw new Error('Stem folder permission is not active. Re-select the stem folder.');
  }

  await ensureStemFolderManifest(handle);
  return handle;
}

function splitRelativePath(relativePath) {
  return relativePath.split('/').filter(Boolean);
}

export async function writeStemFile(rootHandle, relativePath, blob) {
  const parts = splitRelativePath(relativePath);
  const filename = parts.pop();
  let dirHandle = rootHandle;

  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
  }

  const fileHandle = await dirHandle.getFileHandle(filename, { create: true });
  const writable = await fileHandle.createWritable();
  try {
    await writable.write(blob);
  } finally {
    await writable.close();
  }

  return relativePath;
}

export async function readStemFile(rootHandle, relativePath) {
  const parts = splitRelativePath(relativePath);
  const filename = parts.pop();
  let dirHandle = rootHandle;

  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part);
  }

  const fileHandle = await dirHandle.getFileHandle(filename);
  return fileHandle.getFile();
}

export async function deleteStemFile(rootHandle, relativePath) {
  const parts = splitRelativePath(relativePath);
  const filename = parts.pop();
  let dirHandle = rootHandle;

  for (const part of parts) {
    dirHandle = await dirHandle.getDirectoryHandle(part);
  }

  await dirHandle.removeEntry(filename);
}
