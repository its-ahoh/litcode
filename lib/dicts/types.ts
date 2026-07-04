// NOTE for Task 4: the completion provider's KIND_MAP must map
// 'constant' → monaco CompletionItemKind.Constant.
export type DictKind = 'method' | 'function' | 'keyword' | 'module' | 'class' | 'snippet' | 'constant';

export interface DictEntry {
  label: string;      // Word shown in the completion popup, e.g. "append"
  kind: DictKind;
  signature: string;  // e.g. "list.append(x)"
  doc: string;        // One-sentence English description
  insertText: string; // Monaco snippet syntax, e.g. "append($0)"
}
