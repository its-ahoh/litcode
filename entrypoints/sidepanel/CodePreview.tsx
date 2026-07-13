import type { ReactNode } from 'react';

type TokenKind = 'plain' | 'comment' | 'string' | 'number' | 'keyword' | 'type' | 'function';

export interface CodeToken {
  text: string;
  kind: TokenKind;
}

const KEYWORDS = new Set([
  'and', 'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'def', 'default',
  'do', 'elif', 'else', 'enum', 'except', 'export', 'extends', 'finally', 'for', 'from', 'func', 'function',
  'if', 'implements', 'import', 'in', 'interface', 'lambda', 'let', 'match', 'new', 'package', 'pass', 'private',
  'protected', 'public', 'return', 'static', 'struct', 'switch', 'throw', 'try', 'var', 'while', 'with', 'yield',
]);
const TYPES = new Set([
  'bool', 'boolean', 'byte', 'char', 'double', 'float', 'int', 'integer', 'long', 'map', 'number', 'object',
  'rune', 'set', 'slice', 'string', 'str', 'void', 'any', 'interface{}', 'vector', 'list', 'dict',
]);
const TOKEN = /(\/\/.*|#.*|\/\*.*?\*\/|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b\d+(?:\.\d+)?\b|\b[A-Za-z_$][\w$]*\b)/g;

/** Small dependency-free highlighter for saved-code previews. */
export function tokenizeCodeLine(line: string): CodeToken[] {
  const tokens: CodeToken[] = [];
  let cursor = 0;

  for (const match of line.matchAll(TOKEN)) {
    const value = match[0];
    const index = match.index ?? 0;
    if (index > cursor) tokens.push({ text: line.slice(cursor, index), kind: 'plain' });

    let kind: TokenKind = 'plain';
    if (value.startsWith('//') || value.startsWith('#') || value.startsWith('/*')) kind = 'comment';
    else if (/^["'`]/.test(value)) kind = 'string';
    else if (/^\d/.test(value)) kind = 'number';
    else if (KEYWORDS.has(value)) kind = 'keyword';
    else if (TYPES.has(value.toLowerCase())) kind = 'type';
    else if (line.slice(index + value.length).trimStart().startsWith('(')) kind = 'function';

    tokens.push({ text: value, kind });
    cursor = index + value.length;
  }
  if (cursor < line.length) tokens.push({ text: line.slice(cursor), kind: 'plain' });
  return tokens.length ? tokens : [{ text: '', kind: 'plain' }];
}

export default function CodePreview({ code, expanded = false }: { code: string; expanded?: boolean }) {
  const lines = code.split('\n');
  return (
    <pre className={expanded ? 'sol-code expanded' : 'sol-code'} aria-label="Saved code preview">
      <code>
        {lines.map((line, index) => {
          const tokens = tokenizeCodeLine(line);
          const content: ReactNode[] = tokens.map((token, tokenIndex) => (
            <span className={`tok-${token.kind}`} key={tokenIndex}>{token.text}</span>
          ));
          return (
            <span className="code-line" key={index}>
              <span className="line-number" aria-hidden="true">{index + 1}</span>
              <span className="line-content">{content}</span>
            </span>
          );
        })}
      </code>
    </pre>
  );
}
