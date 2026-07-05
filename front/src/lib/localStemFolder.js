import {
  getStemDirectoryRecord,
  saveStemDirectoryHandle,
} from './localLibraryDb';

const READWRITE = 'readwrite';

export function isStemFolderSupported() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

async function getPermissionState(handle, mode = READWRITE) {
  if (!handle?.queryPermission) return 'unsupported';
  return handle.queryPermission({ mode });
}

export async function requestStemFolder() {
  if (!isStemFolderSupported()) {
    throw new Error('Stem folders require a Chromium browser with File System Access support.');
  }

  const handle = await window.showDirectoryPicker({
    id: 'simple-dj-stems',
    mode: READWRITE,
    startIn: 'music',
  });

  const permission = await handle.requestPermission({ mode: READWRITE });
  if (permission !== 'granted') {
    throw new Error('Stem folder permission was not granted.');
  }

  await saveStemDirectoryHandle(handle);
  return { handle, name: handle.name, permission };
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
  return {
    supported: isStemFolderSupported(),
    configured: true,
    name: record.name || record.handle.name || 'Stem Folder',
    permission,
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
