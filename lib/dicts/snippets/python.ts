import type { DictEntry } from '../types';

export const pythonSnippets: DictEntry[] = [
  { label: 'def', kind: 'keyword', signature: 'def name(args):', doc: 'Define a function', insertText: 'def ${1:name}(${2:args}):\n    $0' },
  { label: 'if', kind: 'keyword', signature: 'if condition:', doc: 'Conditional branch', insertText: 'if ${1:condition}:\n    $0' },
  { label: 'elif', kind: 'keyword', signature: 'elif condition:', doc: 'Conditional branch (else if)', insertText: 'elif ${1:condition}:\n    $0' },
  { label: 'else', kind: 'keyword', signature: 'else:', doc: 'Default branch of a conditional', insertText: 'else:\n    $0' },
  { label: 'for', kind: 'keyword', signature: 'for item in iterable:', doc: 'Loop over an iterable', insertText: 'for ${1:item} in ${2:iterable}:\n    $0' },
  { label: 'while', kind: 'keyword', signature: 'while condition:', doc: 'Conditional loop', insertText: 'while ${1:condition}:\n    $0' },
  { label: 'lambda', kind: 'keyword', signature: 'lambda args: expr', doc: 'Anonymous function', insertText: 'lambda $1: $0' },
  { label: 'class', kind: 'keyword', signature: 'class Name:', doc: 'Define a class', insertText: 'class ${1:Name}:\n    $0' },
  { label: 'try', kind: 'keyword', signature: 'try:', doc: 'Exception-handling block', insertText: 'try:\n    $0' },
  { label: 'except', kind: 'keyword', signature: 'except Exception as e:', doc: 'Catch and handle an exception', insertText: 'except ${1:Exception} as ${2:e}:\n    $0' },
];
