// Persistent cache for "Get solutions" answers, keyed by slug+language+code.
// Backed by chrome.storage.local so it survives side-panel reloads and browser restarts.
// Kept separate from the typed StoreShape (and from export/import) — it's a disposable cache.

const KEY = 'litcode:solutionCache';
const MAX_ENTRIES = 50; // bound storage growth; drop oldest beyond this

let mem: Record<string, string> | null = null;

export async function hydrateSolutionCache(): Promise<void> {
  if (mem) return;
  const r = await chrome.storage.local.get(KEY);
  mem = (r[KEY] as Record<string, string>) ?? {};
}

export function getCachedSolution(key: string): string | undefined {
  return mem?.[key];
}

export async function setCachedSolution(key: string, value: string): Promise<void> {
  await hydrateSolutionCache();
  // re-insert to move the key to the most-recent position (object key order = insertion order)
  delete mem![key];
  mem![key] = value;
  const keys = Object.keys(mem!);
  if (keys.length > MAX_ENTRIES) {
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete mem![k];
  }
  await chrome.storage.local.set({ [KEY]: mem });
}
