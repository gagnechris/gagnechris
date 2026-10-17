import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const SOURCE = /\.(?:[cm]?[jt]s|tsx)$/;

const PACKAGES = ['data', 'shared', 'app-core', 'ui'];

// Exports nothing outside their package imports yet. Trim a name and drop it
// here; never add one.
const KNOWN_UNUSED = new Set(
  JSON.parse(
    readFileSync(join(ROOT, 'scripts/test/exports-unused.json'), 'utf8'),
  ) as string[],
);

type ExportMap = Record<string, string | Record<string, string>>;

/** Each TS entry of the package's `exports`, by import specifier. */
function entries(dir: string): Map<string, string> {
  const pkg = JSON.parse(
    readFileSync(join(ROOT, 'packages', dir, 'package.json'), 'utf8'),
  ) as { name: string; exports: ExportMap };
  const out = new Map<string, string>();
  for (const [key, target] of Object.entries(pkg.exports)) {
    const file = typeof target === 'string' ? target : target.types;
    if (!file?.endsWith('.ts')) continue;
    const specifier = key === '.' ? pkg.name : `${pkg.name}${key.slice(1)}`;
    out.set(specifier, resolve(ROOT, 'packages', dir, file));
  }
  return out;
}

/**
 * Each entry's exports, and those it names itself: a module it re-exports
 * whole with `export *` (the wire schemas) is the package's public surface by
 * design.
 */
function exportsOf(files: string[]) {
  const program = ts.createProgram(files, {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    jsx: ts.JsxEmit.ReactJSX,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const namesOf = (symbol: ts.Symbol) =>
    checker.getExportsOfModule(symbol).map((s) => s.name);
  return new Map(
    files.map((file) => {
      const source = program.getSourceFile(file)!;
      const all = namesOf(checker.getSymbolAtLocation(source)!);
      const wholesale = new Set(
        source.statements.flatMap((node) =>
          ts.isExportDeclaration(node) &&
          !node.exportClause &&
          node.moduleSpecifier
            ? namesOf(checker.getSymbolAtLocation(node.moduleSpecifier)!)
            : [],
        ),
      );
      return [file, { all, named: all.filter((n) => !wholesale.has(n)) }];
    }),
  );
}

/** Named imports by specifier, plus files that import in a way that names nothing (`import *`, `export *`, `import()`). */
function importsOf(path: string, text: string, specifiers: Set<string>) {
  const names = new Map<string, Set<string>>();
  const opaque: string[] = [];
  const add = (specifier: string, name: string) => {
    if (!names.has(specifier)) names.set(specifier, new Set());
    names.get(specifier)!.add(name);
  };
  const ours = (node: ts.Node | undefined): string | null =>
    !!node && ts.isStringLiteralLike(node) && specifiers.has(node.text)
      ? node.text
      : null;
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node)) {
      const spec = ours(node.moduleSpecifier);
      const clause = node.importClause;
      const bindings = clause?.namedBindings;
      if (spec && clause) {
        if (clause.name || (bindings && !ts.isNamedImports(bindings)))
          opaque.push(path);
        else if (bindings)
          for (const el of bindings.elements)
            add(spec, (el.propertyName ?? el.name).text);
      }
    } else if (ts.isExportDeclaration(node)) {
      const spec = ours(node.moduleSpecifier);
      if (spec) {
        if (node.exportClause && ts.isNamedExports(node.exportClause))
          for (const el of node.exportClause.elements)
            add(spec, (el.propertyName ?? el.name).text);
        else opaque.push(path);
      }
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      const spec = ours(node.argument.literal);
      // `typeof import(pkg)` types a module mock and names nothing it uses.
      if (spec && !(node.isTypeOf && !node.qualifier)) {
        if (node.qualifier)
          add(
            spec,
            ts.isIdentifier(node.qualifier)
              ? node.qualifier.text
              : node.qualifier.left.getText(),
          );
        else opaque.push(path);
      }
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      ours(node.arguments[0])
    ) {
      opaque.push(path);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { names, opaque };
}

const tracked = execFileSync('git', ['ls-files', '-z'], {
  cwd: ROOT,
  encoding: 'utf8',
})
  .split('\0')
  .filter((p) => SOURCE.test(p));

function consumerImports(dir: string, specifiers: Set<string>) {
  const names = new Map<string, Set<string>>();
  const opaque: string[] = [];
  const own = `packages/${dir}/`;
  const name = [...specifiers][0]!;
  for (const path of tracked) {
    if (path.startsWith(own)) continue;
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (!text.includes(name)) continue;
    const found = importsOf(path, text, specifiers);
    for (const [spec, set] of found.names)
      for (const n of set) {
        if (!names.has(spec)) names.set(spec, new Set());
        names.get(spec)!.add(n);
      }
    opaque.push(...found.opaque);
  }
  return { names, opaque };
}

describe.each(PACKAGES)('@gagnechris/%s exports', (dir) => {
  const byEntry = entries(dir);
  const exported = exportsOf([...byEntry.values()]);
  const { names, opaque } = consumerImports(dir, new Set(byEntry.keys()));
  const listed = [...byEntry].flatMap(([spec, file]) =>
    exported
      .get(file)!
      .named.map((n) => ({ key: `${spec}: ${n}`, spec, name: n })),
  );

  it('are imported only by name', () => {
    expect(opaque).toEqual([]);
  });

  it('are each imported by some tracked file outside the package', () => {
    const unused = listed
      .filter(
        ({ key, spec, name }) =>
          !names.get(spec)?.has(name) && !KNOWN_UNUSED.has(key),
      )
      .map(({ key }) => key);
    expect(unused.sort()).toEqual([]);
  });

  it('cover every name consumers import', () => {
    const missing = [...byEntry].flatMap(([spec, file]) => {
      const known = new Set(exported.get(file)!.all);
      return [...(names.get(spec) ?? [])]
        .filter((n) => !known.has(n))
        .map((n) => `${spec}: ${n}`);
    });
    expect(missing.sort()).toEqual([]);
  });
});

it('lists as known unused only names the packages still export', () => {
  const all = new Set(
    PACKAGES.flatMap((dir) => {
      const byEntry = entries(dir);
      const exported = exportsOf([...byEntry.values()]);
      return [...byEntry].flatMap(([spec, file]) =>
        exported.get(file)!.named.map((n) => `${spec}: ${n}`),
      );
    }),
  );
  expect([...KNOWN_UNUSED].filter((key) => !all.has(key))).toEqual([]);
});
