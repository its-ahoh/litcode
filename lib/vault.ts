// Obsidian vault folder integration via the File System Access API.
// The directory handle persists in IndexedDB (it cannot be stored in chrome.storage).
// After a browser restart Chrome demotes permission to 'prompt'; requestVaultPermission()
// must then be called from a user gesture before writes succeed again.

const DB_NAME = 'litcode-vault';
const DB_STORE = 'handles';
const DB_KEY = 'vaultDir';

type DirHandle = {
  queryPermission(opts: { mode: string }): Promise<string>;
  requestPermission(opts: { mode: string }): Promise<string>;
  getFileHandle(name: string, opts?: { create?: boolean }): Promise<{
    getFile(): Promise<File>;
    createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>;
  }>;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<DirHandle | null> {
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction(DB_STORE).objectStore(DB_STORE).get(DB_KEY);
    req.onsuccess = () => resolve((req.result as DirHandle) ?? null);
    req.onerror = () => resolve(null);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, 'readwrite');
    tx.objectStore(DB_STORE).put(value, DB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type VaultStatus = 'disconnected' | 'granted' | 'needs-permission';

/** Pick the vault folder (must be called from a user gesture). Returns true when connected. */
export async function connectVault(): Promise<boolean> {
  try {
    const picker = (window as unknown as { showDirectoryPicker?: (o: object) => Promise<DirHandle> })
      .showDirectoryPicker;
    if (!picker) return false;
    const handle = await picker({ mode: 'readwrite' });
    await idbSet(handle);
    return true;
  } catch {
    return false; // user cancelled or API unavailable
  }
}

export async function disconnectVault(): Promise<void> {
  await idbSet(null);
}

export async function vaultStatus(): Promise<VaultStatus> {
  const handle = await idbGet();
  if (!handle) return 'disconnected';
  try {
    const perm = await handle.queryPermission({ mode: 'readwrite' });
    return perm === 'granted' ? 'granted' : 'needs-permission';
  } catch {
    return 'needs-permission';
  }
}

/** Re-request folder permission (must be called from a user gesture). */
export async function requestVaultPermission(): Promise<boolean> {
  const handle = await idbGet();
  if (!handle) return false;
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Append one session block to <fileName> in the vault folder.
 * Creates the file with headerBlock first when it doesn't exist; appending (not
 * rebuilding) preserves any edits the user made to the file in Obsidian.
 * Returns true when written; false when the vault is unavailable/not permitted.
 */
export async function writeNote(
  fileName: string,
  headerBlock: string,
  sessionBlock: string,
): Promise<boolean> {
  const handle = await idbGet();
  if (!handle) return false;
  try {
    if ((await handle.queryPermission({ mode: 'readwrite' })) !== 'granted') return false;
    const file = await handle.getFileHandle(fileName, { create: true });
    const existing = await file.getFile().then((f) => f.text());
    const content = existing.trim()
      ? `${existing.replace(/\n+$/, '\n')}\n${sessionBlock}`
      : `${headerBlock}\n${sessionBlock}`;
    const w = await file.createWritable();
    await w.write(content);
    await w.close();
    return true;
  } catch {
    return false;
  }
}
