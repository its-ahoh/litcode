# Dictionary Generators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hand-written Monaco autocomplete dictionaries with build-time generated ones for Java, Python, JS/TS, and Go, derived from each language's standard library.

**Architecture:** One native extractor per language (JDK reflection, Python `inspect`, TypeScript compiler API, `go/doc`) each writes a common intermediate JSON; a shared Node emitter (`emit.mjs`) validates, dedupes, derives snippet insertText, and writes committed `lib/dicts/generated/<lang>.ts` files. Hand-written keyword-template snippets live in `lib/dicts/snippets/` and win over generated entries on merge. The runtime provider (`entrypoints/monaco.content.ts`) is untouched.

**Tech Stack:** Node 22 (ESM `.mjs` scripts, no new deps), `typescript` package (already a devDependency), local JDK 11 (`java` single-file launch), Python 3.13, Go 1.25, vitest, WXT.

**Spec:** `docs/superpowers/specs/2026-07-07-dict-generators-design.md`

**Facts about this machine/repo the plan relies on:**
- `java` (11.0.28 via jenv), `python3` (3.13), `go` (1.25.1) are all on PATH.
- `package.json` has `"type": "commonjs"` — generator scripts use `.mjs` so they run as ESM without a TS runner.
- `DictEntry` = `{ label, kind, signature, doc, insertText }`, `DictKind` = `'method' | 'function' | 'keyword' | 'module' | 'class' | 'snippet' | 'constant'` (`lib/dicts/types.ts`).
- Existing tests in `tests/dicts.test.ts` assert MUST_HAVE labels per language, well-formedness (non-empty fields, unique `label|signature`), and snippet `$n` syntax (note: a snippet containing numbered placeholders must contain the literal substring `$0` — so never emit `${0:...}`).
- `vitest.config.ts` includes only `tests/**/*.test.ts`; vitest runs from the repo root (relative `fs` paths resolve there).
- eslint lints all non-ignored files; generated output will be added to eslint ignores.
- CI requires the prebuilt `extension/` dir to match a fresh build (`npm run pack` refreshes it).

**Intermediate JSON contract (extractor → emitter):**

```json
{
  "language": "python",
  "entries": [
    {
      "label": "pollFirst",
      "kind": "method",
      "container": "java.util.Deque",
      "signature": "deque.pollFirst()",
      "doc": "Retrieves and removes the first element of this deque",
      "arity": 0,
      "insertText": "optional-explicit-override"
    }
  ]
}
```

- `arity` = number of required parameters (extractors cap at 3). Used by the emitter to derive `insertText` when absent: 0 → `name()$0`, 1 → `name($0)`, n ≥ 2 → `name($1, …, $n-1, $0)`. Non-callable kinds default to `label`.
- `container` is informational; the emitter dedupes by `label|kind` and merges container names into the doc.
- Empty `doc` is allowed in raw JSON; the emitter falls back to the signature.

---

### Task 1: Shared emitter (`emit.mjs`)

**Files:**
- Create: `scripts/gen-dicts/emit.mjs`
- Test: `tests/gen-dicts-emit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/gen-dicts-emit.test.ts`:

```ts
import { expect, test } from 'vitest';
// Plain-JS ESM module; no type declarations on purpose.
// @ts-expect-error untyped .mjs import
import { deriveInsertText, dedupe, validate, renderModule } from '../scripts/gen-dicts/emit.mjs';

test('deriveInsertText derives from arity for callables', () => {
  expect(deriveInsertText({ label: 'peek', kind: 'method', arity: 0 })).toBe('peek()$0');
  expect(deriveInsertText({ label: 'charAt', kind: 'method', arity: 1 })).toBe('charAt($0)');
  expect(deriveInsertText({ label: 'merge', kind: 'function', arity: 3 })).toBe('merge($1, $2, $0)');
  // missing arity defaults to 1
  expect(deriveInsertText({ label: 'find', kind: 'method' })).toBe('find($0)');
});

test('deriveInsertText respects explicit insertText and non-callable kinds', () => {
  expect(deriveInsertText({ label: 'ArrayDeque', kind: 'class', insertText: 'ArrayDeque<$0>' })).toBe('ArrayDeque<$0>');
  expect(deriveInsertText({ label: 'break', kind: 'keyword' })).toBe('break');
  expect(deriveInsertText({ label: 'inf', kind: 'constant' })).toBe('inf');
});

test('dedupe merges duplicate label|kind, keeps lowest arity, notes containers', () => {
  const out = dedupe([
    { label: 'addFirst', kind: 'method', container: 'java.util.Deque', signature: 'deque.addFirst(a)', doc: 'Add to head', arity: 1 },
    { label: 'addFirst', kind: 'method', container: 'java.util.ArrayDeque', signature: 'deque.addFirst(a)', doc: '', arity: 1 },
    { label: 'sort', kind: 'function', container: 'java.util.Arrays', signature: 'Arrays.sort(a, b, c)', doc: 'Sort a range', arity: 3 },
    { label: 'sort', kind: 'function', container: 'java.util.Arrays', signature: 'Arrays.sort(a)', doc: 'Sort an array', arity: 1 },
  ]);
  expect(out).toHaveLength(2);
  const addFirst = out.find((e: { label: string }) => e.label === 'addFirst');
  expect(addFirst.doc).toBe('Add to head (on Deque/ArrayDeque)');
  const sort = out.find((e: { label: string }) => e.label === 'sort');
  expect(sort.signature).toBe('Arrays.sort(a)');
});

test('dedupe falls back to signature when doc is empty', () => {
  const out = dedupe([{ label: 'x', kind: 'method', signature: 'a.x()', doc: '', arity: 0 }]);
  expect(out[0].doc).toBe('a.x()');
});

test('validate reports bad entries', () => {
  expect(validate([{ label: 'ok', kind: 'method', signature: 's', doc: '' }])).toEqual([]);
  expect(validate([{ label: '', kind: 'method', signature: 's', doc: '' }]).length).toBeGreaterThan(0);
  expect(validate([{ label: 'x', kind: 'bogus', signature: 's', doc: '' }]).length).toBeGreaterThan(0);
  expect(validate([{ label: 'x', kind: 'method', signature: '', doc: '' }]).length).toBeGreaterThan(0);
});

test('renderModule emits a sorted, typed TS module with header', () => {
  const src = renderModule('javaGenerated', [
    { label: 'poll', kind: 'method', signature: 'q.poll()', doc: 'Poll', arity: 0 },
    { label: 'ArrayDeque', kind: 'class', signature: 'ArrayDeque<E>', doc: 'A deque', insertText: 'ArrayDeque<$0>' },
  ]);
  expect(src).toContain('// GENERATED by scripts/gen-dicts');
  expect(src).toContain("import type { DictEntry } from '../types';");
  expect(src).toContain('export const javaGenerated: DictEntry[] = [');
  // class sorts before method
  expect(src.indexOf('"ArrayDeque"')).toBeLessThan(src.indexOf('"poll"'));
  // insertText derived from arity during render
  expect(src).toContain('"poll()$0"');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/gen-dicts-emit.test.ts`
Expected: FAIL — cannot resolve `../scripts/gen-dicts/emit.mjs`.

- [ ] **Step 3: Write the emitter**

Create `scripts/gen-dicts/emit.mjs`:

```js
// Shared emitter for gen-dicts: converts <lang>.raw.json extractor output
// into committed lib/dicts/generated/<lang>.ts DictEntry[] modules.
// Usage: node scripts/gen-dicts/emit.mjs <dir-containing-*.raw.json>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KINDS = new Set(['method', 'function', 'keyword', 'module', 'class', 'snippet', 'constant']);

const LANGS = {
  java: { file: 'java.ts', exportName: 'javaGenerated' },
  python: { file: 'python.ts', exportName: 'pythonGenerated' },
  javascript: { file: 'javascript.ts', exportName: 'javascriptGenerated' },
  go: { file: 'go.ts', exportName: 'goGenerated' },
};

export function validate(entries) {
  const errors = [];
  entries.forEach((e, i) => {
    if (!e.label) errors.push(`entry ${i}: empty label`);
    if (!KINDS.has(e.kind)) errors.push(`entry ${i} (${e.label}): bad kind "${e.kind}"`);
    if (!e.signature) errors.push(`entry ${i} (${e.label}): empty signature`);
  });
  return errors;
}

export function deriveInsertText(e) {
  if (e.insertText) return e.insertText;
  if (e.kind === 'method' || e.kind === 'function') {
    const n = e.arity ?? 1;
    if (n <= 0) return `${e.label}()$0`;
    if (n === 1) return `${e.label}($0)`;
    const stops = [];
    for (let i = 1; i < n; i++) stops.push(`$${i}`);
    stops.push('$0');
    return `${e.label}(${stops.join(', ')})`;
  }
  return e.label;
}

const short = (c) => c.split(/[./]/).pop();

export function dedupe(entries) {
  const byKey = new Map();
  for (const e of entries) {
    const key = `${e.label}|${e.kind}`;
    const prev = byKey.get(key);
    if (!prev) {
      byKey.set(key, { ...e, containers: e.container ? [e.container] : [] });
      continue;
    }
    if (e.container && !prev.containers.includes(e.container)) prev.containers.push(e.container);
    // Keep the lowest-arity overload so the popup shows the simplest form.
    if ((e.arity ?? 1) < (prev.arity ?? 1)) {
      prev.arity = e.arity;
      prev.signature = e.signature;
    }
    if (!prev.doc && e.doc) prev.doc = e.doc;
  }
  return [...byKey.values()].map(({ containers, ...e }) => {
    const doc = e.doc || e.signature;
    return {
      ...e,
      doc: containers.length > 1 ? `${doc} (on ${containers.map(short).join('/')})` : doc,
    };
  });
}

const KIND_ORDER = ['class', 'method', 'function', 'constant', 'module', 'keyword', 'snippet'];

export function renderModule(exportName, entries) {
  const sorted = [...entries].sort(
    (a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label),
  );
  const s = (v) => JSON.stringify(v);
  const lines = sorted.map(
    (e) =>
      `  { label: ${s(e.label)}, kind: ${s(e.kind)}, signature: ${s(e.signature)}, doc: ${s(e.doc)}, insertText: ${s(deriveInsertText(e))} },`,
  );
  return [
    '// GENERATED by scripts/gen-dicts — do not edit. Regenerate with: npm run gen:dicts',
    "import type { DictEntry } from '../types';",
    '',
    `export const ${exportName}: DictEntry[] = [`,
    ...lines,
    '];',
    '',
  ].join('\n');
}

function main() {
  const rawDir = process.argv[2];
  if (!rawDir) {
    console.error('usage: node emit.mjs <raw-json-dir>');
    process.exit(1);
  }
  const outDir = path.join('lib', 'dicts', 'generated');
  fs.mkdirSync(outDir, { recursive: true });
  let wrote = 0;
  for (const f of fs.readdirSync(rawDir).filter((n) => n.endsWith('.raw.json'))) {
    const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf8'));
    const lang = LANGS[raw.language];
    if (!lang) {
      console.error(`unknown language "${raw.language}" in ${f}`);
      process.exit(1);
    }
    const errors = validate(raw.entries);
    if (errors.length) {
      console.error(`${f}:\n  ${errors.join('\n  ')}`);
      process.exit(1);
    }
    const entries = dedupe(raw.entries);
    fs.writeFileSync(path.join(outDir, lang.file), renderModule(lang.exportName, entries));
    console.log(`wrote ${path.join(outDir, lang.file)} (${entries.length} entries)`);
    wrote++;
  }
  if (!wrote) {
    console.error(`no *.raw.json files found in ${rawDir}`);
    process.exit(1);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/gen-dicts-emit.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Lint and commit**

```bash
npm run lint
git add scripts/gen-dicts/emit.mjs tests/gen-dicts-emit.test.ts
git commit -m "feat(gen-dicts): shared emitter converting raw JSON to DictEntry modules"
```

---

### Task 2: Orchestrator `run.sh` + npm script

**Files:**
- Create: `scripts/gen-dicts/run.sh`
- Modify: `package.json` (add script)
- Modify: `eslint.config.mjs:6` (ignore generated output)

- [ ] **Step 1: Create `scripts/gen-dicts/run.sh`**

```bash
#!/usr/bin/env bash
# Regenerate lib/dicts/generated/*.ts from local toolchains.
# Missing toolchains (or not-yet-written extractors) are skipped with a warning;
# already-committed generated files for skipped languages are left untouched.
set -uo pipefail
cd "$(dirname "$0")/../.."

RAW="$(mktemp -d)"
trap 'rm -rf "$RAW"' EXIT
GD=scripts/gen-dicts
AL=$GD/allowlists
ok=0

if [ -f "$GD/python/extract.py" ]; then
  if command -v python3 >/dev/null; then
    python3 "$GD/python/extract.py" "$AL/python.json" "$RAW/python.raw.json" && ok=1
  else
    echo "WARN: python3 not found - skipping Python dictionary" >&2
  fi
fi

if [ -f "$GD/ts/extract.mjs" ]; then
  node "$GD/ts/extract.mjs" "$AL/javascript.json" "$RAW/javascript.raw.json" && ok=1
fi

if [ -f "$GD/java/Extract.java" ]; then
  if command -v java >/dev/null; then
    node -e "console.log(require('./$AL/java.json').map(e => e.class + ' ' + e.recv).join('\n'))" > "$RAW/java.allow"
    java "$GD/java/Extract.java" "$RAW/java.allow" "$RAW/java.raw.json" && ok=1
  else
    echo "WARN: java not found - skipping Java dictionary" >&2
  fi
fi

if [ -f "$GD/go/extract.go" ]; then
  if command -v go >/dev/null; then
    go run "$GD/go/extract.go" "$AL/go.json" "$RAW/go.raw.json" && ok=1
  else
    echo "WARN: go not found - skipping Go dictionary" >&2
  fi
fi

if [ "$ok" = 0 ]; then
  echo "ERROR: no extractor produced output" >&2
  exit 1
fi
node "$GD/emit.mjs" "$RAW"
```

Then: `chmod +x scripts/gen-dicts/run.sh`

- [ ] **Step 2: Add the npm script**

In `package.json`, add to `"scripts"` (after `"pack"`):

```json
    "gen:dicts": "bash scripts/gen-dicts/run.sh",
```

- [ ] **Step 3: Ignore generated output in eslint**

In `eslint.config.mjs`, change line 6 to:

```js
  { ignores: ['.wxt/**', '.output/**', 'node_modules/**', 'extension/**', 'lib/dicts/generated/**'] },
```

- [ ] **Step 4: Verify the failure path works**

Run: `npm run gen:dicts`
Expected: exits 1 with `ERROR: no extractor produced output` (no extractors exist yet).

- [ ] **Step 5: Commit**

```bash
git add scripts/gen-dicts/run.sh package.json eslint.config.mjs
git commit -m "feat(gen-dicts): run.sh orchestrator and gen:dicts npm script"
```

---

### Task 3: Python extractor

**Files:**
- Create: `scripts/gen-dicts/allowlists/python.json`
- Create: `scripts/gen-dicts/python/extract.py`
- Create: `lib/dicts/generated/python.ts` (generated, committed)
- Test: `tests/generated-dicts.test.ts` (new file, Python section)

- [ ] **Step 1: Write the failing canary test**

Create `tests/generated-dicts.test.ts`:

```ts
import { expect, test } from 'vitest';
import { pythonGenerated } from '../lib/dicts/generated/python';

function labels(entries: { label: string }[]) {
  return new Set(entries.map((e) => e.label));
}

test('python generated dictionary covers canary symbols', () => {
  const l = labels(pythonGenerated);
  const want = [
    // the ones the old hand-written dict had
    'append', 'popleft', 'appendleft', 'heappush', 'heappop', 'heapify',
    'Counter', 'defaultdict', 'deque', 'bisect_left', 'insort', 'lru_cache',
    'cache', 'inf', 'gcd', 'sorted', 'len', 'enumerate',
    // ones it did NOT have — the point of generating
    'rotate', 'extendleft', 'most_common', 'heappushpop', 'nlargest',
    'nsmallest', 'product', 'groupby', 'comb', 'isqrt',
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('python generated entries are well-formed', () => {
  for (const e of pythonGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: FAIL — cannot resolve `../lib/dicts/generated/python`.

- [ ] **Step 3: Create the allowlist**

Create `scripts/gen-dicts/allowlists/python.json`:

```json
{
  "builtin_types": ["str", "list", "dict", "set", "tuple"],
  "builtins": [
    "len", "range", "enumerate", "zip", "map", "filter", "sum", "min", "max",
    "abs", "all", "any", "print", "reversed", "sorted", "isinstance", "divmod",
    "pow", "round", "ord", "chr", "int", "float", "bool", "iter", "next",
    "hash", "type", "repr", "bin", "hex", "format", "frozenset", "slice"
  ],
  "modules": {
    "heapq": null,
    "collections": ["deque", "Counter", "defaultdict", "OrderedDict"],
    "bisect": null,
    "itertools": null,
    "functools": ["lru_cache", "cache", "reduce", "cmp_to_key"],
    "math": null,
    "re": null,
    "string": null
  }
}
```

(`null` = take every public member of the module.)

- [ ] **Step 4: Write the extractor**

Create `scripts/gen-dicts/python/extract.py`:

```python
#!/usr/bin/env python3
"""Extract allowlisted stdlib symbols into the gen-dicts raw JSON format.

Usage: python3 extract.py <allowlist.json> <out.raw.json>
"""
import builtins
import importlib
import inspect
import json
import keyword
import sys

entries = []


def first_line(obj):
    doc = inspect.getdoc(obj)
    return doc.splitlines()[0].strip().rstrip('.') if doc else ''


def arity_of(obj):
    """Number of required positional params (self excluded), capped at 3."""
    try:
        sig = inspect.signature(obj)
    except (ValueError, TypeError):
        return 1
    n = 0
    for p in sig.parameters.values():
        if p.name == 'self':
            continue
        if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD) and p.default is p.empty:
            n += 1
    return min(n, 3)


def sig_text(prefix, name, obj):
    try:
        s = str(inspect.signature(obj)).replace('(self, ', '(').replace('(self)', '()')
    except (ValueError, TypeError):
        s = '(...)'
    if len(s) > 60:
        s = '(...)'
    return f'{prefix}{name}{s}'


def add(label, kind, container, signature, doc, arity=None, insert=None):
    e = {'label': label, 'kind': kind, 'container': container,
         'signature': signature, 'doc': doc}
    if arity is not None:
        e['arity'] = arity
    if insert is not None:
        e['insertText'] = insert
    entries.append(e)


def add_class_members(cls, cls_label, container):
    for name in dir(cls):
        if name.startswith('_'):
            continue
        m = getattr(cls, name)
        if callable(m):
            add(name, 'method', container, sig_text(f'{cls_label}.', name, m),
                first_line(m), arity_of(m))


def main():
    allow = json.load(open(sys.argv[1]))

    for tname in allow['builtin_types']:
        t = getattr(builtins, tname)
        add(tname, 'class', 'builtins', f'{tname}()', first_line(t), insert=f'{tname}($0)')
        add_class_members(t, tname, tname)

    for name in allow['builtins']:
        fn = getattr(builtins, name)
        if isinstance(fn, type):
            add(name, 'class', 'builtins', sig_text('', name, fn), first_line(fn),
                insert=f'{name}($0)')
        else:
            add(name, 'function', 'builtins', sig_text('', name, fn),
                first_line(fn), arity_of(fn))

    for modname, members in allow['modules'].items():
        mod = importlib.import_module(modname)
        add(modname.split('.')[-1], 'module', modname, f'import {modname}',
            first_line(mod), insert=modname.split('.')[-1])
        names = members if members else [n for n in dir(mod) if not n.startswith('_')]
        for name in names:
            obj = getattr(mod, name)
            if isinstance(obj, type):
                add(name, 'class', modname, f'{modname}.{name}()', first_line(obj),
                    insert=f'{name}($0)')
                add_class_members(obj, name, f'{modname}.{name}')
            elif callable(obj):
                add(name, 'function', modname, sig_text(f'{modname}.', name, obj),
                    first_line(obj), arity_of(obj))
            elif isinstance(obj, (int, float, str)):
                add(name, 'constant', modname, f'{modname}.{name}',
                    f'Constant {modname}.{name}', insert=name)

    for kw in keyword.kwlist:
        add(kw, 'keyword', 'keywords', kw, f'Python keyword "{kw}"', insert=kw)

    json.dump({'language': 'python', 'entries': entries}, open(sys.argv[2], 'w'), indent=1)
    print(f'python: {len(entries)} entries')


main()
```

- [ ] **Step 5: Generate and verify**

Run: `npm run gen:dicts`
Expected: `python: N entries` (N in the low thousands before dedup), then `wrote lib/dicts/generated/python.ts (M entries)` with M roughly 400–900. The TS extractor line may also run if Task 4 landed first; that's fine.

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: PASS.

- [ ] **Step 6: Spot-check the output**

Run: `grep -c 'label:' lib/dicts/generated/python.ts && grep 'label: "heappushpop"' lib/dicts/generated/python.ts`
Expected: a count, and one `heappushpop` line with kind `"function"` and a real doc string.

- [ ] **Step 7: Commit**

```bash
git add scripts/gen-dicts/allowlists/python.json scripts/gen-dicts/python/extract.py lib/dicts/generated/python.ts tests/generated-dicts.test.ts
git commit -m "feat(gen-dicts): Python extractor and generated dictionary"
```

---

### Task 4: JS/TS extractor

**Files:**
- Create: `scripts/gen-dicts/allowlists/javascript.json`
- Create: `scripts/gen-dicts/ts/extract.mjs`
- Create: `lib/dicts/generated/javascript.ts` (generated, committed)
- Test: `tests/generated-dicts.test.ts` (append JS section)

- [ ] **Step 1: Write the failing canary test**

Append to `tests/generated-dicts.test.ts` (add the import at the top of the file):

```ts
import { javascriptGenerated } from '../lib/dicts/generated/javascript';
```

and the tests at the bottom:

```ts
test('javascript generated dictionary covers canary symbols', () => {
  const l = labels(javascriptGenerated);
  const want = [
    // old hand-written coverage
    'push', 'splice', 'reduce', 'flatMap', 'padStart', 'fromCharCode',
    'includes', 'has', 'set', 'get', 'max', 'floor', 'Infinity', 'parseInt',
    // new coverage the old dict lacked
    'findLast', 'findLastIndex', 'padEnd', 'at', 'toSorted', 'toReversed',
    'trunc', 'cbrt', 'hypot', 'codePointAt', 'localeCompare',
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('javascript generated entries are well-formed', () => {
  for (const e of javascriptGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: FAIL — cannot resolve `../lib/dicts/generated/javascript`.

- [ ] **Step 3: Create the allowlist**

Create `scripts/gen-dicts/allowlists/javascript.json`:

```json
{
  "instances": {
    "Array": "arr",
    "ReadonlyArray": "arr",
    "String": "str",
    "Map": "map",
    "Set": "set",
    "RegExp": "re",
    "Promise": "promise",
    "Number": "num"
  },
  "statics": {
    "ArrayConstructor": "Array",
    "StringConstructor": "String",
    "NumberConstructor": "Number",
    "ObjectConstructor": "Object",
    "MapConstructor": "Map",
    "SetConstructor": "Set",
    "PromiseConstructor": "Promise",
    "BigIntConstructor": "BigInt",
    "Math": "Math",
    "JSON": "JSON"
  },
  "globals": ["parseInt", "parseFloat", "isNaN", "isFinite"],
  "constants": ["Infinity", "NaN"],
  "classes": ["Map", "Set", "Array", "Number", "Object", "RegExp", "Promise", "BigInt", "String", "Boolean"],
  "modules": ["JSON", "Math"]
}
```

- [ ] **Step 4: Write the extractor**

Create `scripts/gen-dicts/ts/extract.mjs`:

```js
// Extract allowlisted ES2023 lib symbols via the TypeScript compiler API.
// Usage: node extract.mjs <allowlist.json> <out.raw.json>
// Pure syntax walk over lib.es2023.d.ts and its /// <reference lib> closure —
// no type checker needed.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

const req = createRequire(import.meta.url);
const allow = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outPath = process.argv[3];

const libDir = path.dirname(req.resolve('typescript'));
const seen = new Set();
const sources = [];

function loadLib(name) {
  const file = path.join(libDir, `lib.${name}.d.ts`);
  if (seen.has(file) || !fs.existsSync(file)) return;
  seen.add(file);
  const text = fs.readFileSync(file, 'utf8');
  sources.push(ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true));
  for (const ref of ts.preProcessFile(text).libReferenceDirectives) loadLib(ref.fileName);
}
loadLib('es2023');

const entries = [];
const add = (e) => entries.push(e);

function docOf(node) {
  const c = node.jsDoc?.[0]?.comment;
  const text = typeof c === 'string' ? c : c ? c.map((p) => p.text ?? '').join('') : '';
  const first = text.split(/\.\s|\n\n/)[0].replace(/\s+/g, ' ').trim();
  return first.endsWith('.') ? first.slice(0, -1) : first;
}

function requiredArity(params) {
  let n = 0;
  for (const p of params) {
    if (p.questionToken || p.dotDotDotToken || p.initializer) break;
    n++;
  }
  return Math.min(n, 3);
}

function sigOf(prefix, name, params) {
  return `${prefix}${name}(${params.map((p) => p.name.getText()).join(', ')})`;
}

for (const sf of sources) {
  for (const st of sf.statements) {
    if (ts.isInterfaceDeclaration(st)) {
      const iname = st.name.text;
      const recv = allow.instances[iname];
      const owner = allow.statics[iname];
      if (!recv && !owner) continue;
      for (const m of st.members) {
        const name = m.name && ts.isIdentifier(m.name) ? m.name.text : null;
        if (!name) continue;
        if (ts.isMethodSignature(m)) {
          if (recv) {
            add({ label: name, kind: 'method', container: iname,
              signature: sigOf(`${recv}.`, name, m.parameters),
              doc: docOf(m), arity: requiredArity(m.parameters) });
          } else {
            add({ label: name, kind: 'function', container: iname,
              signature: sigOf(`${owner}.`, name, m.parameters),
              doc: docOf(m), arity: requiredArity(m.parameters) });
          }
        } else if (ts.isPropertySignature(m)) {
          if (recv) {
            // Instance properties (arr.length, map.size) complete after a dot,
            // so they use the 'method' kind, with a plain-name insertText.
            add({ label: name, kind: 'method', container: iname,
              signature: `${recv}.${name}`, doc: docOf(m), insertText: name });
          } else {
            add({ label: name, kind: 'constant', container: iname,
              signature: `${owner}.${name}`, doc: docOf(m), insertText: name });
          }
        }
      }
    } else if (ts.isFunctionDeclaration(st) && st.name && allow.globals.includes(st.name.text)) {
      add({ label: st.name.text, kind: 'function', container: 'global',
        signature: sigOf('', st.name.text, st.parameters),
        doc: docOf(st), arity: requiredArity(st.parameters) });
    } else if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) {
        const name = ts.isIdentifier(d.name) ? d.name.text : null;
        if (!name) continue;
        if (allow.constants.includes(name)) {
          add({ label: name, kind: 'constant', container: 'global',
            signature: name, doc: docOf(st), insertText: name });
        } else if (allow.modules.includes(name)) {
          add({ label: name, kind: 'module', container: 'global',
            signature: name, doc: docOf(st), insertText: name });
        } else if (allow.classes.includes(name)) {
          add({ label: name, kind: 'class', container: 'global',
            signature: `new ${name}()`, doc: docOf(st), insertText: `${name}($0)` });
        }
      }
    }
  }
}

fs.writeFileSync(outPath, JSON.stringify({ language: 'javascript', entries }, null, 1));
console.log(`javascript: ${entries.length} entries`);
```

- [ ] **Step 5: Generate and verify**

Run: `npm run gen:dicts`
Expected: `javascript: N entries` and `wrote lib/dicts/generated/javascript.ts (M entries)`.

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: PASS (Python + JS tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-dicts/allowlists/javascript.json scripts/gen-dicts/ts/extract.mjs lib/dicts/generated/javascript.ts tests/generated-dicts.test.ts
git commit -m "feat(gen-dicts): JS/TS extractor from lib.es2023.d.ts"
```

---

### Task 5: Java extractor

**Files:**
- Create: `scripts/gen-dicts/allowlists/java.json`
- Create: `scripts/gen-dicts/java/Extract.java`
- Create: `lib/dicts/generated/java.ts` (generated, committed)
- Test: `tests/generated-dicts.test.ts` (append Java section)

- [ ] **Step 1: Write the failing canary test**

Append to `tests/generated-dicts.test.ts` (import at top):

```ts
import { javaGenerated } from '../lib/dicts/generated/java';
```

tests at bottom:

```ts
test('java generated dictionary covers canary symbols including Deque', () => {
  const l = labels(javaGenerated);
  const want = [
    // the Deque gap that motivated this work
    'Deque', 'pollFirst', 'pollLast', 'peekFirst', 'peekLast', 'offerFirst',
    'offerLast', 'getFirst', 'getLast', 'pop', 'push', 'addFirst', 'addLast',
    // old hand-written coverage
    'charAt', 'substring', 'toCharArray', 'parseInt', 'getOrDefault',
    'containsKey', 'binarySearch', 'ArrayDeque', 'PriorityQueue', 'TreeMap',
    // new coverage the old dict lacked
    'computeIfAbsent', 'floorKey', 'ceilingKey', 'descendingIterator',
    'lastIndexOf', 'repeat', 'chars', 'Stack', 'List', 'Map',
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('java generated entries are well-formed', () => {
  for (const e of javaGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: FAIL — cannot resolve `../lib/dicts/generated/java`.

- [ ] **Step 3: Create the allowlist**

Create `scripts/gen-dicts/allowlists/java.json` (objects: FQCN + the receiver name used in signatures):

```json
[
  { "class": "java.lang.String", "recv": "str" },
  { "class": "java.lang.StringBuilder", "recv": "sb" },
  { "class": "java.lang.Math", "recv": "Math" },
  { "class": "java.lang.Integer", "recv": "num" },
  { "class": "java.lang.Long", "recv": "num" },
  { "class": "java.lang.Character", "recv": "ch" },
  { "class": "java.lang.Boolean", "recv": "flag" },
  { "class": "java.lang.Double", "recv": "num" },
  { "class": "java.util.List", "recv": "list" },
  { "class": "java.util.ArrayList", "recv": "list" },
  { "class": "java.util.LinkedList", "recv": "list" },
  { "class": "java.util.Map", "recv": "map" },
  { "class": "java.util.HashMap", "recv": "map" },
  { "class": "java.util.TreeMap", "recv": "map" },
  { "class": "java.util.Set", "recv": "set" },
  { "class": "java.util.HashSet", "recv": "set" },
  { "class": "java.util.TreeSet", "recv": "set" },
  { "class": "java.util.Deque", "recv": "deque" },
  { "class": "java.util.ArrayDeque", "recv": "deque" },
  { "class": "java.util.Queue", "recv": "queue" },
  { "class": "java.util.PriorityQueue", "recv": "pq" },
  { "class": "java.util.Stack", "recv": "stack" },
  { "class": "java.util.Arrays", "recv": "Arrays" },
  { "class": "java.util.Collections", "recv": "Collections" },
  { "class": "java.util.Comparator", "recv": "cmp" },
  { "class": "java.util.Iterator", "recv": "it" },
  { "class": "java.util.Random", "recv": "rand" }
]
```

- [ ] **Step 4: Write the extractor**

Create `scripts/gen-dicts/java/Extract.java` (run directly via Java 11 single-file launch; input is the flattened `fqcn recv` lines that `run.sh` produces from the JSON allowlist):

```java
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.lang.reflect.TypeVariable;
import java.nio.file.FileSystem;
import java.nio.file.FileSystems;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Reflects over allowlisted JDK classes and writes gen-dicts raw JSON.
 * Usage: java Extract.java <allowlist-lines-file> <out.raw.json>
 * Each allowlist line: "<fqcn> <receiverName>".
 * Docs come from $JAVA_HOME/lib/src.zip Javadoc first sentences when available.
 */
public class Extract {
    static StringBuilder json = new StringBuilder();
    static boolean first = true;
    static FileSystem srcZip = null;
    static Map<String, String> srcCache = new HashMap<>();

    public static void main(String[] args) throws Exception {
        List<String> lines = Files.readAllLines(Paths.get(args[0]));
        openSrcZip();
        json.append("{\"language\":\"java\",\"entries\":[\n");
        for (String line : lines) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] parts = line.split("\\s+");
            emitClass(parts[0], parts[1]);
        }
        json.append("\n]}\n");
        Files.writeString(Paths.get(args[1]), json.toString());
        System.out.println("java: done");
    }

    static void openSrcZip() {
        try {
            Path p = Paths.get(System.getProperty("java.home"), "lib", "src.zip");
            if (Files.exists(p)) srcZip = FileSystems.newFileSystem(p, (ClassLoader) null);
            else System.err.println("WARN: no src.zip; docs fall back to signatures");
        } catch (Exception e) {
            System.err.println("WARN: cannot open src.zip; docs fall back to signatures");
        }
    }

    static String classSource(String fqcn) {
        if (srcZip == null) return null;
        return srcCache.computeIfAbsent(fqcn, k -> {
            try {
                Path p = srcZip.getPath("java.base", k.replace('.', '/') + ".java");
                return Files.exists(p) ? Files.readString(p) : null;
            } catch (Exception e) {
                return null;
            }
        });
    }

    static String firstSentence(String raw) {
        String doc = raw.replaceAll("(?m)^\\s*\\*", " ");
        doc = doc.replaceAll("\\{@\\w+\\s+([^}]*)\\}", "$1");
        doc = doc.replaceAll("<[^>]+>", "");
        doc = doc.replaceAll("\\s+", " ").trim();
        int dot = doc.indexOf(". ");
        if (dot >= 0) doc = doc.substring(0, dot);
        if (doc.endsWith(".")) doc = doc.substring(0, doc.length() - 1);
        if (doc.startsWith("@")) return "";
        return doc;
    }

    static String methodDoc(String fqcn, String member) {
        String src = classSource(fqcn);
        if (src == null) return "";
        Pattern p = Pattern.compile(
            "/\\*\\*(.*?)\\*/\\s*(?:@\\w+[^\\n]*\\n\\s*)*[^;{}/]*?\\b"
                + Pattern.quote(member) + "\\s*\\(",
            Pattern.DOTALL);
        Matcher m = p.matcher(src);
        return m.find() ? firstSentence(m.group(1)) : "";
    }

    static String classDoc(String fqcn, String simple) {
        String src = classSource(fqcn);
        if (src == null) return "";
        Pattern p = Pattern.compile(
            "/\\*\\*(.*?)\\*/\\s*(?:@\\w+[^\\n]*\\n\\s*)*public\\s+(?:abstract\\s+|final\\s+)?(?:class|interface)\\s+"
                + Pattern.quote(simple) + "\\b",
            Pattern.DOTALL);
        Matcher m = p.matcher(src);
        return m.find() ? firstSentence(m.group(1)) : "";
    }

    static String params(int n) {
        String[] names = {"a", "b", "c"};
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < Math.min(n, 3); i++) {
            if (i > 0) b.append(", ");
            b.append(names[i]);
        }
        return b.toString();
    }

    static void emitClass(String fqcn, String recv) throws Exception {
        Class<?> c = Class.forName(fqcn);
        String simple = c.getSimpleName();
        TypeVariable<?>[] tps = c.getTypeParameters();
        String sig = simple;
        String insert = simple;
        if (tps.length > 0) {
            List<String> names = new ArrayList<>();
            for (TypeVariable<?> tv : tps) names.add(tv.getName());
            sig = simple + "<" + String.join(", ", names) + ">";
            insert = simple + "<" + (tps.length == 1 ? "$0" : "$1, $0") + ">";
        }
        String cdoc = classDoc(fqcn, simple);
        entry(simple, "class", fqcn, sig, cdoc.isEmpty() ? sig : cdoc, null, insert);

        for (Method m : c.getMethods()) {
            if (m.isSynthetic() || m.isBridge()) continue;
            String name = m.getName();
            Class<?> dc = m.getDeclaringClass();
            if (dc == Object.class && !name.equals("toString") && !name.equals("equals")
                && !name.equals("hashCode")) continue;
            boolean isStatic = Modifier.isStatic(m.getModifiers());
            int arity = Math.min(m.getParameterCount(), 3);
            String msig = (isStatic ? simple : recv) + "." + name + "(" + params(m.getParameterCount()) + ")";
            String doc = methodDoc(fqcn, name);
            if (doc.isEmpty() && dc != c) doc = methodDoc(dc.getName(), name);
            entry(name, isStatic ? "function" : "method", fqcn, msig,
                doc.isEmpty() ? msig : doc, arity, null);
        }
    }

    static void entry(String label, String kind, String container, String sig,
                      String doc, Integer arity, String insertText) {
        if (!first) json.append(",\n");
        first = false;
        json.append("{\"label\":").append(q(label))
            .append(",\"kind\":").append(q(kind))
            .append(",\"container\":").append(q(container))
            .append(",\"signature\":").append(q(sig))
            .append(",\"doc\":").append(q(doc));
        if (arity != null) json.append(",\"arity\":").append(arity);
        if (insertText != null) json.append(",\"insertText\":").append(q(insertText));
        json.append("}");
    }

    static String q(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (char ch : s.toCharArray()) {
            switch (ch) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\t': b.append("\\t"); break;
                case '\r': break;
                default:
                    if (ch < 0x20) b.append(' ');
                    else b.append(ch);
            }
        }
        return b.append('"').toString();
    }
}
```

- [ ] **Step 5: Generate and verify**

Run: `npm run gen:dicts`
Expected: `java: done`, then `wrote lib/dicts/generated/java.ts (M entries)`.

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: PASS (Python + JS + Java tests). If `pop`/`peekFirst` are missing, check that `java.util.Deque` resolved (the extractor throws on `Class.forName` failure — the class name in the allowlist must be exact).

- [ ] **Step 6: Verify the Deque fix end-to-end**

Run: `grep -n '"Deque"' lib/dicts/generated/java.ts && grep -n '"peekLast"' lib/dicts/generated/java.ts`
Expected: both present; `Deque` entry has a real Javadoc first sentence (e.g. "A linear collection that supports element insertion and removal at both ends").

- [ ] **Step 7: Commit**

```bash
git add scripts/gen-dicts/allowlists/java.json scripts/gen-dicts/java/Extract.java lib/dicts/generated/java.ts tests/generated-dicts.test.ts
git commit -m "feat(gen-dicts): Java extractor via JDK reflection + src.zip Javadoc"
```

---

### Task 6: Go extractor

**Files:**
- Create: `scripts/gen-dicts/allowlists/go.json`
- Create: `scripts/gen-dicts/go/extract.go`
- Create: `lib/dicts/generated/go.ts` (generated, committed)
- Test: `tests/generated-dicts.test.ts` (append Go section)

- [ ] **Step 1: Write the failing canary test**

Append to `tests/generated-dicts.test.ts` (import at top):

```ts
import { goGenerated } from '../lib/dicts/generated/go';
```

tests at bottom:

```ts
test('go generated dictionary covers canary symbols', () => {
  const l = labels(goGenerated);
  const want = [
    'Ints', 'Slice', 'SliceStable', 'SearchInts',       // sort
    'Itoa', 'Atoi',                                     // strconv
    'Join', 'Split', 'Contains', 'Repeat', 'TrimSpace', // strings
    'Init', 'Push', 'Pop', 'Fix',                       // container/heap
    'PushBack', 'PushFront',                            // container/list
    'Abs', 'Sqrt', 'Floor', 'Ceil', 'Max',              // math
    'Println', 'Printf', 'Sprintf',                     // fmt
    'append', 'len', 'make', 'copy', 'cap',             // builtins
    'sort', 'strings', 'strconv', 'heap', 'list', 'fmt', 'slices', 'maps',
    'func', 'range', 'defer', 'chan', 'select', 'go',   // keywords
  ];
  expect(want.filter((w) => !l.has(w))).toEqual([]);
});

test('go generated entries are well-formed', () => {
  for (const e of goGenerated) {
    expect(e.label.length).toBeGreaterThan(0);
    expect(e.signature.length).toBeGreaterThan(0);
    expect(e.doc.length).toBeGreaterThan(0);
    expect(e.insertText.length).toBeGreaterThan(0);
  }
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: FAIL — cannot resolve `../lib/dicts/generated/go`.

- [ ] **Step 3: Create the allowlist**

Create `scripts/gen-dicts/allowlists/go.json`:

```json
{
  "packages": ["sort", "strings", "strconv", "container/heap", "container/list", "math", "fmt", "slices", "maps"]
}
```

- [ ] **Step 4: Write the extractor**

Create `scripts/gen-dicts/go/extract.go`:

```go
// Extracts allowlisted Go stdlib symbols into the gen-dicts raw JSON format.
// Usage: go run extract.go <allowlist.json> <out.raw.json>
//
// Design note: package-level functions get kind "method" (not "function")
// because in Go they complete after a dot (`sort.Ints`), and the runtime
// provider shows only kind==='method' entries after a dot.
package main

import (
	"encoding/json"
	"fmt"
	"go/ast"
	"go/doc"
	"go/parser"
	"go/token"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type Entry struct {
	Label      string `json:"label"`
	Kind       string `json:"kind"`
	Container  string `json:"container,omitempty"`
	Signature  string `json:"signature"`
	Doc        string `json:"doc"`
	Arity      *int   `json:"arity,omitempty"`
	InsertText string `json:"insertText,omitempty"`
}

type Allow struct {
	Packages []string `json:"packages"`
}

var entries []Entry

var goKeywords = []string{
	"break", "case", "chan", "const", "continue", "default", "defer", "else",
	"fallthrough", "for", "func", "go", "goto", "if", "import", "interface",
	"map", "package", "range", "return", "select", "struct", "switch", "type",
	"var", "nil", "true", "false", "iota",
}

func arityPtr(n int) *int {
	if n > 3 {
		n = 3
	}
	return &n
}

func paramNames(fl *ast.FieldList) []string {
	var names []string
	if fl == nil {
		return names
	}
	for _, f := range fl.List {
		if len(f.Names) == 0 {
			names = append(names, "x")
			continue
		}
		for _, n := range f.Names {
			names = append(names, n.Name)
		}
	}
	return names
}

func synopsis(s string) string {
	return strings.TrimSuffix(strings.TrimSpace(doc.Synopsis(s)), ".")
}

func addFunc(prefix, container string, f *doc.Func) {
	if !ast.IsExported(f.Name) {
		return
	}
	names := paramNames(f.Decl.Type.Params)
	sig := prefix + "." + f.Name + "(" + strings.Join(names, ", ") + ")"
	entries = append(entries, Entry{
		Label: f.Name, Kind: "method", Container: container,
		Signature: sig, Doc: synopsis(f.Doc), Arity: arityPtr(len(names)),
	})
}

func parsePkg(dir, importPath string) *doc.Package {
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, func(fi os.FileInfo) bool {
		return !strings.HasSuffix(fi.Name(), "_test.go")
	}, parser.ParseComments)
	if err != nil {
		fmt.Fprintln(os.Stderr, "WARN: skip", importPath, err)
		return nil
	}
	base := filepath.Base(importPath)
	astPkg, ok := pkgs[base]
	if !ok {
		return nil
	}
	mode := doc.Mode(0)
	if importPath == "builtin" {
		mode = doc.AllDecls
	}
	return doc.New(astPkg, importPath, mode)
}

func main() {
	raw, err := os.ReadFile(os.Args[1])
	if err != nil {
		panic(err)
	}
	var allow Allow
	if err := json.Unmarshal(raw, &allow); err != nil {
		panic(err)
	}
	out, err := exec.Command("go", "env", "GOROOT").Output()
	if err != nil {
		panic(err)
	}
	goroot := strings.TrimSpace(string(out))

	for _, pkgPath := range allow.Packages {
		d := parsePkg(filepath.Join(goroot, "src", pkgPath), pkgPath)
		if d == nil {
			continue
		}
		base := filepath.Base(pkgPath)
		entries = append(entries, Entry{
			Label: base, Kind: "module", Container: pkgPath,
			Signature: `import "` + pkgPath + `"`, Doc: synopsis(d.Doc), InsertText: base,
		})
		for _, f := range d.Funcs {
			addFunc(base, pkgPath, f)
		}
		for _, t := range d.Types {
			if !ast.IsExported(t.Name) {
				continue
			}
			entries = append(entries, Entry{
				Label: t.Name, Kind: "class", Container: pkgPath,
				Signature: pkgPath + "." + t.Name, Doc: synopsis(t.Doc), InsertText: t.Name,
			})
			recv := strings.ToLower(t.Name[:1])
			for _, m := range t.Methods {
				addFunc(recv, pkgPath+"."+t.Name, m)
			}
			for _, f := range t.Funcs { // constructors like list.New
				addFunc(base, pkgPath, f)
			}
		}
	}

	// builtins: append/len/make/copy/... from GOROOT/src/builtin/builtin.go
	if d := parsePkg(filepath.Join(goroot, "src", "builtin"), "builtin"); d != nil {
		for _, f := range d.Funcs {
			names := paramNames(f.Decl.Type.Params)
			entries = append(entries, Entry{
				Label: f.Name, Kind: "function", Container: "builtin",
				Signature: f.Name + "(" + strings.Join(names, ", ") + ")",
				Doc:       synopsis(f.Doc), Arity: arityPtr(len(names)),
			})
		}
	}

	for _, kw := range goKeywords {
		entries = append(entries, Entry{
			Label: kw, Kind: "keyword", Signature: kw,
			Doc: `Go keyword "` + kw + `"`, InsertText: kw,
		})
	}

	b, err := json.MarshalIndent(map[string]interface{}{
		"language": "go", "entries": entries,
	}, "", " ")
	if err != nil {
		panic(err)
	}
	if err := os.WriteFile(os.Args[2], b, 0o644); err != nil {
		panic(err)
	}
	fmt.Printf("go: %d entries\n", len(entries))
}
```

Note: builtin funcs in `builtin.go` are lowercase (`append`, `len`), so `addFunc`'s `IsExported` check would drop them — that's why the builtin loop inlines its own append with kind `function` instead of calling `addFunc`.

- [ ] **Step 5: Generate and verify**

Run: `npm run gen:dicts`
Expected: `go: N entries` and `wrote lib/dicts/generated/go.ts (M entries)`.

Run: `npx vitest run tests/generated-dicts.test.ts`
Expected: PASS (all four languages).

- [ ] **Step 6: Commit**

```bash
git add scripts/gen-dicts/allowlists/go.json scripts/gen-dicts/go/extract.go lib/dicts/generated/go.ts tests/generated-dicts.test.ts
git commit -m "feat(gen-dicts): Go extractor via go/doc"
```

---

### Task 7: Snippets split, wiring, and replacing the hand-written dicts

**Files:**
- Create: `lib/dicts/snippets/python.ts`
- Create: `lib/dicts/snippets/java.ts`
- Create: `lib/dicts/snippets/javascript.ts`
- Create: `lib/dicts/snippets/go.ts`
- Modify: `lib/dicts/index.ts` (full rewrite)
- Delete: `lib/dicts/python.ts`, `lib/dicts/java.ts`, `lib/dicts/javascript.ts`
- Modify: `tests/dicts.test.ts` (extend MUST_HAVE, add golang)
- Modify: `tests/generated-dicts.test.ts` (add size guard)

- [ ] **Step 1: Extend the existing dictionary test (failing first)**

In `tests/dicts.test.ts`, make these changes:

To the `java` MUST_HAVE array, append:

```ts
    // Deque interface + methods that the hand-written dict was missing
    'Deque', 'pop', 'peekFirst', 'peekLast', 'offerFirst', 'offerLast', 'getFirst', 'getLast',
    'Stack', 'List', 'Map', 'Set', 'Queue', 'Long', 'Double', 'Random', 'Iterator',
```

After the `javascript` entry in `MUST_HAVE`, add a new `golang` key:

```ts
  golang: [
    'Ints', 'Slice', 'Itoa', 'Atoi', 'Join', 'Split', 'Contains', 'Repeat',
    'Init', 'Push', 'Pop', 'Fix', 'PushBack', 'PushFront',
    'Abs', 'Sqrt', 'Floor', 'Ceil', 'Println', 'Printf', 'Sprintf',
    'append', 'len', 'make', 'copy', 'cap',
    'sort', 'strings', 'strconv', 'heap', 'list', 'fmt', 'slices', 'maps',
    'func', 'for', 'if', 'else', 'range', 'return', 'struct', 'map', 'defer', 'chan', 'select', 'go', 'var', 'switch',
  ],
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/dicts.test.ts`
Expected: FAIL — `java dictionary covers required words` reports the Deque additions missing, and `dictionaries.golang` is undefined (TypeError).

- [ ] **Step 3: Create the snippets files**

Create `lib/dicts/snippets/python.ts` — the template keywords the generator can't produce (plain keywords now come from the generated kwlist):

```ts
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
```

Create `lib/dicts/snippets/java.ts` — Java keywords are not derivable by reflection, so all keyword entries move here (carried over from the old `lib/dicts/java.ts`):

```ts
import type { DictEntry } from '../types';

export const javaSnippets: DictEntry[] = [
  { label: 'public', kind: 'keyword', signature: 'public', doc: 'Public access modifier', insertText: 'public' },
  { label: 'private', kind: 'keyword', signature: 'private', doc: 'Private access modifier', insertText: 'private' },
  { label: 'static', kind: 'keyword', signature: 'static', doc: 'Static member modifier', insertText: 'static' },
  { label: 'final', kind: 'keyword', signature: 'final', doc: 'Modifier for immutable/non-inheritable declarations', insertText: 'final' },
  { label: 'void', kind: 'keyword', signature: 'void', doc: 'No-return-value type', insertText: 'void' },
  { label: 'int', kind: 'keyword', signature: 'int', doc: '32-bit integer type', insertText: 'int' },
  { label: 'long', kind: 'keyword', signature: 'long', doc: '64-bit integer type', insertText: 'long' },
  { label: 'char', kind: 'keyword', signature: 'char', doc: 'Single-character type', insertText: 'char' },
  { label: 'boolean', kind: 'keyword', signature: 'boolean', doc: 'Boolean type', insertText: 'boolean' },
  { label: 'double', kind: 'keyword', signature: 'double', doc: 'Double-precision floating-point type', insertText: 'double' },
  { label: 'new', kind: 'keyword', signature: 'new ClassName(args)', doc: 'Create a new object instance', insertText: 'new' },
  { label: 'return', kind: 'keyword', signature: 'return expr;', doc: 'Return a value from a method', insertText: 'return' },
  { label: 'if', kind: 'keyword', signature: 'if (condition) {}', doc: 'Conditional branch', insertText: 'if (${1:condition}) {\n    $0\n}' },
  { label: 'else', kind: 'keyword', signature: 'else {}', doc: 'Default branch of a conditional', insertText: 'else {\n    $0\n}' },
  { label: 'for', kind: 'keyword', signature: 'for (init; cond; step) {}', doc: 'Classic for loop', insertText: 'for (int ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    $0\n}' },
  { label: 'while', kind: 'keyword', signature: 'while (condition) {}', doc: 'Conditional loop', insertText: 'while (${1:condition}) {\n    $0\n}' },
  { label: 'break', kind: 'keyword', signature: 'break;', doc: 'Break out of the current loop/switch', insertText: 'break' },
  { label: 'continue', kind: 'keyword', signature: 'continue;', doc: 'Skip the rest of the current loop iteration', insertText: 'continue' },
  { label: 'class', kind: 'keyword', signature: 'class Name {}', doc: 'Define a class', insertText: 'class ${1:Name} {\n    $0\n}' },
  { label: 'extends', kind: 'keyword', signature: 'class A extends B', doc: 'Extend a parent class', insertText: 'extends' },
  { label: 'implements', kind: 'keyword', signature: 'class A implements B', doc: 'Implement an interface', insertText: 'implements' },
  { label: 'null', kind: 'keyword', signature: 'null', doc: 'Null reference constant', insertText: 'null' },
  { label: 'true', kind: 'keyword', signature: 'true', doc: 'Boolean true value', insertText: 'true' },
  { label: 'false', kind: 'keyword', signature: 'false', doc: 'Boolean false value', insertText: 'false' },
];
```

Create `lib/dicts/snippets/javascript.ts` — JS keywords (not in lib.d.ts) plus the curated `new Map()` / `new Set()` class snippets that override the generic generated ones:

```ts
import type { DictEntry } from '../types';

export const javascriptSnippets: DictEntry[] = [
  { label: 'const', kind: 'keyword', signature: 'const name = value;', doc: 'Declare a block-scoped constant', insertText: 'const' },
  { label: 'let', kind: 'keyword', signature: 'let name = value;', doc: 'Declare a block-scoped variable', insertText: 'let' },
  { label: 'function', kind: 'keyword', signature: 'function name(args) {}', doc: 'Define a function', insertText: 'function ${1:name}(${2:args}) {\n    $0\n}' },
  { label: 'return', kind: 'keyword', signature: 'return expr;', doc: 'Return a value from a function', insertText: 'return' },
  { label: 'if', kind: 'keyword', signature: 'if (condition) {}', doc: 'Conditional branch', insertText: 'if (${1:condition}) {\n    $0\n}' },
  { label: 'else', kind: 'keyword', signature: 'else {}', doc: 'Default branch of a conditional', insertText: 'else {\n    $0\n}' },
  { label: 'for', kind: 'keyword', signature: 'for (init; cond; step) {}', doc: 'Classic for loop', insertText: 'for (let ${1:i} = 0; ${1:i} < ${2:n}; ${1:i}++) {\n    $0\n}' },
  { label: 'while', kind: 'keyword', signature: 'while (condition) {}', doc: 'Conditional loop', insertText: 'while (${1:condition}) {\n    $0\n}' },
  { label: 'of', kind: 'keyword', signature: 'for (const x of iterable) {}', doc: 'Iterate over the values of an iterable', insertText: 'of' },
  { label: 'in', kind: 'keyword', signature: 'for (const key in obj) {}', doc: 'Iterate over the enumerable property names of an object', insertText: 'in' },
  { label: 'new', kind: 'keyword', signature: 'new ClassName(args)', doc: 'Create a new object instance', insertText: 'new' },
  { label: 'class', kind: 'keyword', signature: 'class Name {}', doc: 'Define a class', insertText: 'class ${1:Name} {\n    $0\n}' },
  { label: 'null', kind: 'keyword', signature: 'null', doc: 'Represents an empty value', insertText: 'null' },
  { label: 'undefined', kind: 'keyword', signature: 'undefined', doc: 'Represents an undefined value', insertText: 'undefined' },
  { label: 'true', kind: 'keyword', signature: 'true', doc: 'Boolean true value', insertText: 'true' },
  { label: 'false', kind: 'keyword', signature: 'false', doc: 'Boolean false value', insertText: 'false' },
  { label: 'typeof', kind: 'keyword', signature: 'typeof x', doc: 'Return a string indicating the type of the operand', insertText: 'typeof' },
  { label: 'break', kind: 'keyword', signature: 'break;', doc: 'Break out of the current loop/switch', insertText: 'break' },
  { label: 'continue', kind: 'keyword', signature: 'continue;', doc: 'Skip the rest of the current loop iteration', insertText: 'continue' },
  { label: 'Map', kind: 'class', signature: 'new Map()', doc: 'Collection of key-value pairs, keys can be of any type', insertText: 'new Map()$0' },
  { label: 'Set', kind: 'class', signature: 'new Set()', doc: 'Collection of unique values', insertText: 'new Set()$0' },
];
```

Create `lib/dicts/snippets/go.ts`:

```ts
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
```

- [ ] **Step 4: Rewrite `lib/dicts/index.ts` and delete the old dicts**

Replace the entire content of `lib/dicts/index.ts` with:

```ts
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
```

Then delete the old hand-written dictionaries:

```bash
git rm lib/dicts/python.ts lib/dicts/java.ts lib/dicts/javascript.ts
```

- [ ] **Step 5: Add the size guard**

Append to `tests/generated-dicts.test.ts` (add `import fs from 'node:fs';` at the top):

```ts
test('generated dictionaries stay within the size budget', () => {
  for (const lang of ['java', 'python', 'javascript', 'go']) {
    const size = fs.statSync(`lib/dicts/generated/${lang}.ts`).size;
    expect(size, `${lang}.ts is ${size} bytes`).toBeLessThan(250_000);
  }
});
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: ALL PASS — including the pre-existing `dicts.test.ts` MUST_HAVE/well-formed/snippet-syntax tests now running against merged snippet+generated dictionaries, for `golang` too. If a MUST_HAVE word is missing, check whether dedupe dropped it or the allowlist lacks its container; fix the allowlist and re-run `npm run gen:dicts`, not the generated file.

- [ ] **Step 7: Lint and typecheck via build**

```bash
npm run lint
npx tsc --noEmit
```

Expected: clean (warnings allowed, no errors).

- [ ] **Step 8: Commit**

```bash
git add lib/dicts tests/dicts.test.ts tests/generated-dicts.test.ts
git commit -m "feat: replace hand-written autocomplete dicts with generated ones + Go support"
```

---

### Task 8: Full verification, extension rebuild, docs

**Files:**
- Modify: `extension/` (rebuilt via `npm run pack`)
- Possibly modify: `README.md`, `README.zh-CN.md` (autocomplete feature description)

- [ ] **Step 1: Regenerate from scratch and confirm stability**

```bash
npm run gen:dicts
git status --short
```

Expected: no diff (generation is deterministic for a fixed toolchain).

- [ ] **Step 2: Full suite + build**

```bash
npm test && npm run lint && npm run build
```

Expected: all pass; WXT build succeeds.

- [ ] **Step 3: Rebuild the committed extension bundle**

```bash
npm run pack
git status --short extension/
```

Expected: `extension/` shows changes (the content script bundle now embeds the generated dictionaries). This keeps the CI sync check green.

- [ ] **Step 4: Update README feature description if it names languages**

Run: `grep -n -i 'autocomplete\|complete' README.md README.zh-CN.md`
If the autocomplete feature bullet lists supported languages, add Go and note the dictionaries are generated from each language's stdlib. Skip if no language list is present.

- [ ] **Step 5: Manual smoke test (recommended)**

Load `extension/` as an unpacked extension in Chrome, open any LeetCode problem, switch the editor to Java, and type `deque.` — `pollFirst`, `peekLast`, `offerFirst` should appear. Switch to Go and type `sort.` — `Ints`, `Slice` should appear.

- [ ] **Step 6: Commit**

```bash
git add extension README.md README.zh-CN.md
git commit -m "chore: rebuild extension with generated dictionaries; docs"
```
