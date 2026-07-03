import { DEFAULT_SETTINGS, type StoreShape } from './types';

const KEY = 'litcode';

const DEFAULTS: StoreShape = {
  settings: DEFAULT_SETTINGS,
  attempts: {},
  reviewQueue: {},
  solutions: {},
  session: null,
};

export async function getStore(): Promise<StoreShape> {
  const res = await chrome.storage.local.get(KEY);
  const saved = (res[KEY] ?? {}) as Partial<StoreShape>;
  return { ...DEFAULTS, ...saved, settings: { ...DEFAULT_SETTINGS, ...saved.settings } };
}

// Serializes read-merge-write cycles within this JS context so concurrent
// updates can't clobber each other via stale reads.
let writeQueue: Promise<unknown> = Promise.resolve();

export async function updateStore(
  fn: (current: StoreShape) => Partial<StoreShape>,
): Promise<StoreShape> {
  const step = writeQueue.then(async () => {
    const current = await getStore();
    const next = { ...current, ...fn(current) };
    await chrome.storage.local.set({ [KEY]: next });
    return next;
  });
  // Swallow rejections in the chain so one failed step doesn't break later calls;
  // the caller still sees the rejection via the returned `step`.
  writeQueue = step.catch(() => {});
  return step;
}

/**
 * Applies `patch` as a shallow top-level merge; record-valued fields
 * (attempts/reviewQueue/solutions) are replaced wholesale — callers must
 * spread the existing record (or use `updateStore` to read-modify-write).
 */
export async function patchStore(patch: Partial<StoreShape>): Promise<StoreShape> {
  return updateStore(() => patch);
}
