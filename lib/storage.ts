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

export async function patchStore(patch: Partial<StoreShape>): Promise<StoreShape> {
  const current = await getStore();
  const next = { ...current, ...patch };
  await chrome.storage.local.set({ [KEY]: next });
  return next;
}
