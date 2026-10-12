import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const PACKAGE = '@gagnechris/data';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const INDEX = join(ROOT, 'packages', 'data', 'src', 'index.ts');
const SOURCE = /\.(?:[cm]?[jt]s|tsx)$/;

function packageExports(): string[] {
  const program = ts.createProgram([INDEX], {
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    noEmit: true,
    skipLibCheck: true,
  });
  const checker = program.getTypeChecker();
  const symbol = checker.getSymbolAtLocation(program.getSourceFile(INDEX)!)!;
  return checker.getExportsOfModule(symbol).map((s) => s.name);
}

const isPackage = (specifier: ts.Node | undefined): boolean =>
  !!specifier &&
  ts.isStringLiteralLike(specifier) &&
  (specifier.text === PACKAGE || specifier.text.startsWith(`${PACKAGE}/`));

/** Named imports from the package, plus any import it cannot name (`import *`, `export *`, `import()`). */
function importsOf(path: string, text: string) {
  const names = new Set<string>();
  const opaque: string[] = [];
  const file = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && isPackage(node.moduleSpecifier)) {
      const bindings = node.importClause?.namedBindings;
      if (node.importClause?.name || (bindings && !ts.isNamedImports(bindings)))
        opaque.push(path);
      else if (bindings)
        for (const el of bindings.elements)
          names.add((el.propertyName ?? el.name).text);
    } else if (
      ts.isExportDeclaration(node) &&
      isPackage(node.moduleSpecifier)
    ) {
      if (node.exportClause && ts.isNamedExports(node.exportClause))
        for (const el of node.exportClause.elements)
          names.add((el.propertyName ?? el.name).text);
      else opaque.push(path);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument) &&
      isPackage(node.argument.literal)
    ) {
      if (node.qualifier)
        names.add(
          ts.isIdentifier(node.qualifier)
            ? node.qualifier.text
            : node.qualifier.left.getText(),
        );
      else opaque.push(path);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      isPackage(node.arguments[0])
    ) {
      opaque.push(path);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return { names, opaque };
}

function consumerImports() {
  const files = execFileSync('git', ['ls-files', '-z'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter((p) => SOURCE.test(p) && !p.startsWith('packages/data/'));
  const names = new Set<string>();
  const opaque: string[] = [];
  for (const path of files) {
    const text = readFileSync(join(ROOT, path), 'utf8');
    if (!text.includes(PACKAGE)) continue;
    const found = importsOf(path, text);
    for (const name of found.names) names.add(name);
    opaque.push(...found.opaque);
  }
  return { names, opaque };
}

describe(`${PACKAGE} exports`, () => {
  const exported = packageExports();
  const { names, opaque } = consumerImports();

  it('are imported only by name', () => {
    expect(opaque).toEqual([]);
  });

  it('are each imported by some tracked file outside the package', () => {
    expect(exported.length).toBeGreaterThan(0);
    expect(exported.filter((name) => !names.has(name)).sort()).toEqual([]);
  });

  it('cover every name consumers import', () => {
    const known = new Set(exported);
    expect([...names].filter((name) => !known.has(name)).sort()).toEqual([]);
  });
});
