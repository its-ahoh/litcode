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
    """First paragraph of the docstring, cut at the first sentence."""
    doc = inspect.getdoc(obj)
    if not doc:
        return ''
    para = ' '.join(line.strip() for line in doc.split('\n\n')[0].splitlines())
    cut = para.find('. ')
    if cut != -1:
        para = para[:cut]
    return para.strip().rstrip('.')


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
    if n == 0 and any(p.kind == p.VAR_POSITIONAL for p in sig.parameters.values()):
        return 1
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
    for name in vars(cls):
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
