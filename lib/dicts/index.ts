import type { DictEntry } from './types';
import { pythonGenerated } from './generated/python';
import { javaGenerated } from './generated/java';
import { javascriptGenerated } from './generated/javascript';
import { goGenerated } from './generated/go';
import { pythonSnippets } from './snippets/python';
import { javaSnippets } from './snippets/java';
import { javascriptSnippets } from './snippets/javascript';
import { goSnippets } from './snippets/go';

// Hand-written snippets win over generated entries with the same label+kind
// (e.g. the `for` loop template beats the generator's plain `for` keyword).
function merge(snippets: DictEntry[], generated: DictEntry[]): DictEntry[] {
  const seen = new Set(snippets.map((e) => `${e.label}|${e.kind}`));
  return [...snippets, ...generated.filter((e) => !seen.has(`${e.label}|${e.kind}`))];
}

const python = merge(pythonSnippets, pythonGenerated);
const java = merge(javaSnippets, javaGenerated);
const javascript = merge(javascriptSnippets, javascriptGenerated);
const go = merge(goSnippets, goGenerated);

export const dictionaries: Record<string, DictEntry[]> = {
  python,
  python3: python,
  java,
  javascript,
  typescript: javascript,
  // Registered under both IDs; LeetCode's Monaco uses one of them for Go.
  golang: go,
  go,
};
