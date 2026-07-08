# Dictionary Generators for Autocomplete — Design

**Date:** 2026-07-07
**Status:** Approved

## Problem

The Monaco autocomplete dictionaries in `lib/dicts/` are hand-written word lists.
Anything nobody typed in is invisible — e.g. Java's `Deque` interface and half its
methods (`pop`, `peekFirst`, `peekLast`, `offerFirst`, `offerLast`) are missing.
Hand-curation cannot keep the lists complete or consistent, and adding languages
(Go) means writing hundreds of entries by hand.

## Goal

Replace hand-written dictionaries with **build-time generated** ones derived from
each language's authoritative standard library, for **Java, Python, JS/TS, and Go**,
while keeping the runtime completion provider in `entrypoints/monaco.content.ts`
unchanged.

## Decisions (from brainstorming)

1. **Toolchains OK** — generators may shell out to a locally installed JDK,
   Python 3, and Go. JS/TS uses the `typescript` devDependency (no toolchain).
2. **Curated allowlist** — extract everything from allowlisted classes/modules
   only (LeetCode-relevant), not the full stdlib. Complete within scope, small
   bundle, no noise.
3. **Commit generated files** — `lib/dicts/generated/<lang>.ts` are committed
   (same pattern as the prebuilt `extension/` dir). `npm run build` never needs
   toolchains; only regeneration does.
4. **Generated replaces hand-written** — delete `lib/dicts/{java,python,javascript}.ts`.
   Each language keeps a small hand-written `lib/dicts/snippets/<lang>.ts` for
   keyword snippets (`for`/`if`/`while` templates etc.) that generators cannot
   produce. `index.ts` concatenates `[...snippets, ...generated]`.

## Architecture

Native extractor per language + shared emitter, communicating via a common
intermediate JSON:

```
scripts/gen-dicts/
  allowlists/             # per-language JSON: which classes/modules/packages to emit
    java.json  python.json  javascript.json  go.json
  java/Extract.java       # JDK reflection (+ src.zip Javadoc first sentences)
  python/extract.py       # inspect.signature() + inspect.getdoc()
  ts/extract.ts           # TypeScript compiler API over lib.es2023.d.ts
  go/extract.go           # go/doc + go/types over allowlisted packages
  emit.ts                 # <lang>.raw.json → lib/dicts/generated/<lang>.ts
  run.sh                  # orchestrator: toolchain checks, run extractors, run emitter
```

- `npm run gen:dicts` runs `run.sh`. Extractors write `<lang>.raw.json` to a temp
  dir; `emit.ts` converts each to a committed `DictEntry[]` TypeScript file.
- A missing toolchain skips that language with a warning; one extractor failing
  does not block the others; the emitter fails loudly on schema violations.

### Alternatives considered

- **All-Node parsing** (typeshed / Javadoc HTML / Go sources parsed from Node):
  no toolchains, but 3–5× the parsing code and fragile. Rejected — toolchains OK.
- **LSP harvesting** (run 4 language servers, record completions): maximum
  fidelity but far more machinery than a one-shot dump justifies. Rejected.

## Intermediate JSON schema

Each extractor writes:

```json
{
  "language": "java",
  "entries": [
    {
      "label": "pollFirst",
      "kind": "method",
      "container": "java.util.Deque",
      "signature": "deque.pollFirst()",
      "doc": "Retrieves and removes the first element of this deque, or returns null if empty",
      "insertText": "pollFirst()$0",
      "sortHint": 10
    }
  ]
}
```

`kind` must be one of the existing `DictKind` values (`method`, `function`,
`keyword`, `module`, `class`, `snippet`, `constant`).

### Per-language extraction rules

- **Java** — reflection over allowlisted classes. Instance methods → `method`;
  static methods of utility classes (`Arrays`, `Math`, `Collections`) →
  `function`; classes/interfaces themselves → `class` with generic-aware
  insertText (`ArrayDeque<$0>`). Docs: first sentence of Javadoc read from
  `$JAVA_HOME/lib/src.zip`; falls back to the signature when absent.
- **Python** — `inspect.signature()` + first line of `inspect.getdoc()` over
  allowlisted modules and builtin types. `str`/`list`/`dict`/`set`/`tuple`
  methods → `method`; module functions (`heapq.heappush`) → `function`;
  keywords from the `keyword` module → `keyword`.
- **JS/TS** — TypeScript compiler API walks `lib.es2023.d.ts` interface members
  for allowlisted globals. JSDoc comments give docs; declared signatures give
  parameter names.
- **Go** — `go/doc` on allowlisted packages. Package functions → `method`
  (see wrinkle below); builtins/keywords → `keyword`; package names → `module`
  so `sort`, `strings` complete at top level.

### Go wrinkle

Go is a new language for the extension. The provider's after-dot heuristic shows
only `method` entries after `.`. In Go, dot-completion follows a *package* name
(`sort.Ints`), so package-level functions are emitted as kind `method` with the
package in the signature (`sort.Ints(a)`). The dictionary is registered under
both `golang` and `go` Monaco language IDs; whichever LeetCode uses matches.

## Emitter responsibilities (`emit.ts`, shared)

1. Validate every entry against the `DictEntry` shape; `kind` must exist in the
   runtime `KIND_MAP`.
2. **Deduplicate by (label, kind)** within a language — e.g. `add` exists on
   List/Set/Deque; keep one entry and merge containers into the doc
   ("List/Set/Deque").
3. Derive `insertText` uniformly: zero-arg → `name()$0`; one-arg → `name($0)`;
   multi-arg → `name($1, $0)`-style tab stops (arity known from extraction).
4. Emit a `// GENERATED by scripts/gen-dicts — do not edit` header and stable
   (sorted) output so diffs are reviewable.

## Allowlists (initial)

- **Java** — `java.lang`: String, StringBuilder, Math, Integer, Long, Character,
  Boolean, Double; `java.util`: List, ArrayList, LinkedList, Map, HashMap,
  TreeMap, Set, HashSet, TreeSet, Deque, ArrayDeque, Queue, PriorityQueue,
  Stack, Arrays, Collections, Comparator, Iterator, Random.
- **Python** — builtins (incl. str/list/dict/set/tuple methods), `collections`
  (deque, Counter, defaultdict, OrderedDict), `heapq`, `bisect`, `itertools`,
  `functools` (lru_cache, reduce, cmp_to_key), `math`, `re`, `string`.
- **JS/TS** — Array, String, Map, Set, Object, Number, Math, JSON, RegExp,
  Promise, BigInt, and global functions (parseInt, parseFloat, isNaN).
- **Go** — `sort`, `strings`, `strconv`, `container/heap`, `container/list`,
  `math`, `fmt`, `slices`, `maps`, plus builtins (append, len, make, copy, …).

## Runtime wiring (`lib/dicts/index.ts`)

```ts
export const dictionaries = {
  python:     [...pythonSnippets, ...pythonGen],
  python3:    [...pythonSnippets, ...pythonGen],
  java:       [...javaSnippets, ...javaGen],
  javascript: [...jsSnippets, ...jsGen],
  typescript: [...jsSnippets, ...jsGen],
  golang:     [...goSnippets, ...goGen],
  go:         [...goSnippets, ...goGen],
};
```

`entrypoints/monaco.content.ts` is untouched.

## Testing (vitest, in `tests/`)

- **Schema test** — every generated entry has a valid kind, non-empty
  label/signature/doc/insertText, and balanced `$n` tab stops.
- **Canary test per language** — asserts known symbols exist. Java: `Deque`,
  `pollFirst`, `peekLast` (the regression that motivated this). Python:
  `heappush`, `Counter`. JS: `flatMap`, `padStart`. Go: `sort.Slice`.
- **Size guard** — each generated file < ~250 KB so the content-script bundle
  stays sane.

## Error handling

- `run.sh` checks for `java`, `python3`, `go` on PATH; missing toolchain →
  skip that language with a warning, continue with the rest.
- Extractor failure for one language does not block others.
- `emit.ts` fails loudly (non-zero exit, no file written) on schema violations
  rather than emitting bad entries.

## Out of scope

- Languages beyond Java/Python/JS/TS/Go (C++, C#, Rust, …).
- A real language server / type-aware completion.
- CI freshness check for generated dicts (possible follow-up, mirroring the
  existing `extension/` sync check).
- Prefix-filtering in the runtime provider (only needed if generated dict size
  causes measurable lag; size guard should prevent this).
