// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const adminDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../admin',
);

const LINK_ATTRIBUTES = new Set(['href', 'viewLiveHref']);

const startsAtRoot = (text: string) =>
  text.startsWith('/') && !text.startsWith('//');

const isPublicUrlCall = (node: ts.Node) =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'publicUrl';

/** Root-relative paths in admin link attributes; on the admin host they open the admin app. */
const relativePublicLinks = (fileName: string, source: string): string[] => {
  const file = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const found: string[] = [];
  const scan = (node: ts.Node): void => {
    if (isPublicUrlCall(node)) return;
    const text =
      ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
        ? node.text
        : ts.isTemplateExpression(node)
          ? node.head.text
          : undefined;
    if (text !== undefined && startsAtRoot(text)) {
      const { line } = file.getLineAndCharacterOfPosition(node.getStart());
      found.push(`${fileName}:${line + 1} ${node.getText()}`);
    }
    ts.forEachChild(node, scan);
  };
  const visit = (node: ts.Node): void => {
    if (
      (ts.isJsxAttribute(node) || ts.isPropertyAssignment(node)) &&
      LINK_ATTRIBUTES.has(node.name.getText())
    ) {
      if (node.initializer) scan(node.initializer);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

const adminSources = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return adminSources(full);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)
      ? [full]
      : [];
  });

describe('admin links to the public site', () => {
  it('flags root-relative link paths and allows publicUrl and in-page links', () => {
    expect(
      relativePublicLinks(
        'x.tsx',
        [
          'const a = <a href="/posts">p</a>;',
          'const b = <Bar viewLiveHref={ok ? `/posts/${slug}` : null} />;',
          "const c = <Bar viewLiveHref={project.href ?? '/projects'} />;",
          "const d = { href: '/resume' };",
          'const e = <Bar viewLiveHref={publicUrl(`/posts/${slug}`)} />;',
          'const f = <a href="#role-end">x</a>;',
          'const g = <a href="//cdn.example.com/x">x</a>;',
          'const h = <Link to="/projects">x</Link>;',
        ].join('\n'),
      ),
    ).toEqual([
      'x.tsx:1 "/posts"',
      'x.tsx:2 `/posts/${slug}`',
      "x.tsx:3 '/projects'",
      "x.tsx:4 '/resume'",
    ]);
  });

  it('no admin source links to a root-relative public path', () => {
    const files = adminSources(adminDir);
    expect(files.length).toBeGreaterThan(5);
    const found = files.flatMap((file) =>
      relativePublicLinks(
        path.relative(adminDir, file),
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(found).toEqual([]);
  });
});
