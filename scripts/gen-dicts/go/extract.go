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
	"sort"
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

func isDeprecated(docStr string) bool {
	return strings.Contains(docStr, "Deprecated:")
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
	if isDeprecated(f.Doc) {
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
			if isDeprecated(t.Doc) {
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

	// builtins: append/len/make/copy/... from GOROOT/src/builtin/builtin.go.
	// go/doc's "factory function" heuristic reassigns functions whose param
	// or return type matches a declared type (e.g. append's `[]Type` return
	// matches the `type Type int` placeholder) from d.Funcs into that type's
	// Funcs slice — so we must also collect d.Types[*].Funcs to get
	// append/cap/copy/len/make/new/complex/real/imag/recover, sorted by name
	// for determinism since they arrive grouped by type rather than sorted.
	if d := parsePkg(filepath.Join(goroot, "src", "builtin"), "builtin"); d != nil {
		var builtinFuncs []*doc.Func
		builtinFuncs = append(builtinFuncs, d.Funcs...)
		for _, t := range d.Types {
			builtinFuncs = append(builtinFuncs, t.Funcs...)
		}
		sort.Slice(builtinFuncs, func(i, j int) bool {
			return builtinFuncs[i].Name < builtinFuncs[j].Name
		})
		for _, f := range builtinFuncs {
			if isDeprecated(f.Doc) {
				continue
			}
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
