/* global process, console */
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

function isDeprecated(node) {
  return (node.jsDoc?.[0]?.tags ?? []).some((t) => t.tagName.text === 'deprecated');
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
        if (!name || isDeprecated(m)) continue;
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
    } else if (ts.isFunctionDeclaration(st) && st.name && allow.globals.includes(st.name.text) && !isDeprecated(st)) {
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
