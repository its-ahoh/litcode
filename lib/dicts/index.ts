import { python } from './python';
import { java } from './java';
import { javascript } from './javascript';
import type { DictEntry } from './types';

export const dictionaries: Record<string, DictEntry[]> = {
  python,
  python3: python,
  java,
  javascript,
  typescript: javascript,
};
