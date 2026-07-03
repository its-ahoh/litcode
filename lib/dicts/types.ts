export type DictKind = 'method' | 'function' | 'keyword' | 'module' | 'class' | 'snippet';

export interface DictEntry {
  label: string;      // 补全弹窗里的词，如 "append"
  kind: DictKind;
  signature: string;  // 如 "list.append(x)"
  doc: string;        // 一句话中文说明
  insertText: string; // Monaco snippet 语法，如 "append($0)"
}
