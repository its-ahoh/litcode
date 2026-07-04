import { expect, test } from 'vitest';
import { dictionaries } from '../lib/dicts';

const MUST_HAVE: Record<string, string[]> = {
  python: [
    // list/str/dict/set methods
    'append', 'pop', 'sort', 'sorted', 'reverse', 'insert', 'remove', 'index', 'count',
    'join', 'split', 'strip', 'lower', 'upper', 'startswith', 'endswith', 'replace', 'find', 'isdigit', 'isalpha', 'ord', 'chr',
    'get', 'keys', 'values', 'items', 'setdefault', 'add', 'discard', 'update',
    // builtins
    'len', 'range', 'enumerate', 'zip', 'map', 'filter', 'sum', 'min', 'max', 'abs', 'all', 'any', 'set', 'dict', 'list', 'tuple', 'str', 'int', 'float', 'bool', 'print', 'reversed', 'isinstance', 'divmod', 'pow', 'round',
    // modules
    'heapq', 'heappush', 'heappop', 'heapify', 'Counter', 'defaultdict', 'deque', 'popleft', 'appendleft', 'bisect_left', 'bisect_right', 'insort', 'lru_cache', 'cache', 'inf', 'gcd', 'sqrt', 'floor', 'ceil', 'permutations', 'combinations', 'accumulate',
    // keywords
    'def', 'return', 'if', 'elif', 'else', 'for', 'while', 'in', 'not', 'and', 'or', 'lambda', 'yield', 'class', 'import', 'from', 'None', 'True', 'False', 'break', 'continue', 'global', 'nonlocal', 'try', 'except',
  ],
  java: [
    'length', 'charAt', 'substring', 'indexOf', 'toCharArray', 'equals', 'compareTo', 'split', 'trim', 'toLowerCase', 'toUpperCase', 'contains', 'isEmpty', 'valueOf', 'parseInt', 'toString', 'append', 'reverse', 'deleteCharAt', 'setCharAt',
    'add', 'remove', 'get', 'set', 'size', 'put', 'getOrDefault', 'containsKey', 'containsValue', 'keySet', 'entrySet', 'putIfAbsent', 'merge', 'offer', 'poll', 'peek', 'push', 'addFirst', 'addLast', 'pollFirst', 'pollLast',
    'sort', 'fill', 'copyOf', 'copyOfRange', 'binarySearch', 'asList', 'swap', 'max', 'min', 'abs', 'sqrt', 'pow', 'floor', 'ceil',
    'public', 'private', 'static', 'final', 'void', 'int', 'long', 'char', 'boolean', 'double', 'String', 'new', 'return', 'if', 'else', 'for', 'while', 'break', 'continue', 'class', 'extends', 'implements', 'null', 'true', 'false',
    'ArrayList', 'HashMap', 'HashSet', 'LinkedList', 'ArrayDeque', 'PriorityQueue', 'TreeMap', 'TreeSet', 'StringBuilder', 'Arrays', 'Collections', 'Math', 'Integer', 'Character', 'Comparator',
  ],
  javascript: [
    'push', 'pop', 'shift', 'unshift', 'slice', 'splice', 'sort', 'reverse', 'map', 'filter', 'reduce', 'forEach', 'find', 'findIndex', 'includes', 'indexOf', 'join', 'concat', 'flat', 'fill', 'some', 'every', 'from', 'isArray', 'keys', 'values', 'entries',
    'split', 'trim', 'toLowerCase', 'toUpperCase', 'charAt', 'charCodeAt', 'fromCharCode', 'substring', 'repeat', 'padStart', 'replace', 'startsWith', 'endsWith',
    'get', 'set', 'has', 'delete', 'add', 'size',
    'max', 'min', 'abs', 'floor', 'ceil', 'sqrt', 'pow', 'round', 'sign', 'Infinity',
    'const', 'let', 'function', 'return', 'if', 'else', 'for', 'while', 'of', 'in', 'new', 'class', 'null', 'undefined', 'true', 'false', 'typeof', 'break', 'continue',
    'Map', 'Set', 'Array', 'Number', 'JSON', 'parseInt', 'parseFloat',
  ],
};

for (const [lang, words] of Object.entries(MUST_HAVE)) {
  test(`${lang} dictionary covers required words`, () => {
    const labels = new Set(dictionaries[lang].map((e) => e.label));
    const missing = words.filter((w) => !labels.has(w));
    expect(missing).toEqual([]);
  });

  test(`${lang} entries are well-formed and unique`, () => {
    const seen = new Set<string>();
    for (const e of dictionaries[lang]) {
      expect(e.label.length).toBeGreaterThan(0);
      expect(e.signature.length).toBeGreaterThan(0);
      expect(e.doc.length).toBeGreaterThan(0);
      expect(e.insertText.length).toBeGreaterThan(0);
      const key = `${e.label}|${e.signature}`;
      expect(seen.has(key), `duplicate: ${key}`).toBe(false);
      seen.add(key);
    }
  });

  test(`${lang} insertText snippets are syntactically valid`, () => {
    for (const e of dictionaries[lang]) {
      const tokens = e.insertText.match(/\$(\{\d+(:[^}]*)?\}|\d+)|\$(?!\{|\d)/g) ?? [];
      const bare = tokens.filter((t) => t === '$');
      expect(bare, `bad $ syntax in ${e.label}: ${e.insertText}`).toEqual([]);
      const numbered = e.insertText.match(/\$(\{)?[1-9]/);
      if (numbered) {
        expect(e.insertText.includes('$0'), `snippet with placeholders must contain $0: ${e.label}`).toBe(true);
      }
    }
  });
}
