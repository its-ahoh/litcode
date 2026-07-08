import type { DictEntry } from '../types';

export const goSnippets: DictEntry[] = [
  { label: 'func', kind: 'keyword', signature: 'func name(args) type {}', doc: 'Define a function', insertText: 'func ${1:name}(${2:args}) ${3:type} {\n\t$0\n}' },
  { label: 'for', kind: 'keyword', signature: 'for i := 0; i < n; i++ {}', doc: 'Classic for loop', insertText: 'for ${1:i} := 0; ${1:i} < ${2:n}; ${1:i}++ {\n\t$0\n}' },
  { label: 'forr', kind: 'snippet', signature: 'for i, v := range xs {}', doc: 'Range-based for loop', insertText: 'for ${1:i}, ${2:v} := range ${3:xs} {\n\t$0\n}' },
  { label: 'if', kind: 'keyword', signature: 'if condition {}', doc: 'Conditional branch', insertText: 'if ${1:condition} {\n\t$0\n}' },
  { label: 'else', kind: 'keyword', signature: 'else {}', doc: 'Default branch of a conditional', insertText: 'else {\n\t$0\n}' },
  { label: 'switch', kind: 'keyword', signature: 'switch x {}', doc: 'Multi-way branch', insertText: 'switch ${1:x} {\ncase ${2:v}:\n\t$0\n}' },
  { label: 'struct', kind: 'keyword', signature: 'type Name struct {}', doc: 'Define a struct type', insertText: 'type ${1:Name} struct {\n\t$0\n}' },
  { label: 'map', kind: 'keyword', signature: 'map[K]V', doc: 'Map type literal', insertText: 'map[${1:string}]$0' },
];
