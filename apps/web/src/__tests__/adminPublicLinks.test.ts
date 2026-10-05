// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const adminDir = path.join(srcDir, 'admin');
// EditorActionBar renders the admin's View live link.
const workspaceDir = path.join(srcDir, 'workspace');

const PUBLIC_LINK_REL = 'noopener noreferrer';

const LINK_ATTRIBUTES = new Set(['href', 'viewLiveHref']);

const startsAtRoot = (text: string) =>
  text.startsWith('/') && !text.startsWith('//');

const isPublicUrlCall = (node: ts.Node) =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'publicUrl';

/** Root-relative paths in admin link attributes; on the admin host they open the admin app. */
const relativePublicLinks = (fileName: string, source: string): string[] => {
  const file = parse(fileName, source);
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

const parse = (fileName: string, source: string) =>
  ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

const literalText = (node: ts.Node | undefined): string | undefined => {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
    return node.text;
  if (ts.isJsxExpression(node)) return literalText(node.expression);
  return undefined;
};

const mentionsPublicUrl = (node: ts.Node): boolean =>
  isPublicUrlCall(node) ||
  (ts.isIdentifier(node) && node.text === 'viewLiveHref') ||
  ts.forEachChild(node, mentionsPublicUrl) === true;

/**
 * Public-site links that leak the admin host as referrer or open in the admin
 * tab: new-tab elements without `rel="noopener noreferrer"`, links built from
 * `publicUrl` or `viewLiveHref` that don't open a new tab, and any other `rel`
 * set on rendered links.
 */
const leakyPublicLinks = (fileName: string, source: string): string[] => {
  const file = parse(fileName, source);
  const found: string[] = [];
  const report = (node: ts.Node) => {
    const { line } = file.getLineAndCharacterOfPosition(node.getStart());
    found.push(`${fileName}:${line + 1}`);
  };
  const visit = (node: ts.Node): void => {
    if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
      const attribute = (name: string) =>
        node.attributes.properties.find(
          (p): p is ts.JsxAttribute =>
            ts.isJsxAttribute(p) && p.name.getText() === name,
        );
      const href = attribute('href');
      const opensNewTab =
        literalText(attribute('target')?.initializer) === '_blank';
      const linksPublic =
        href?.initializer !== undefined && mentionsPublicUrl(href.initializer);
      if (
        (opensNewTab || linksPublic) &&
        (!opensNewTab ||
          literalText(attribute('rel')?.initializer) !== PUBLIC_LINK_REL)
      ) {
        report(node);
      }
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'setAttribute' &&
      literalText(node.arguments[0]) === 'rel' &&
      literalText(node.arguments[1]) !== PUBLIC_LINK_REL
    ) {
      report(node);
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
  return found;
};

const isWithPublicUrlsCall = (node: ts.Node | undefined) =>
  node !== undefined &&
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === 'withPublicUrls';

/** Rendered HTML whose root-relative links and images would resolve against the admin host. */
const unroutedInnerHtml = (fileName: string, source: string): string[] => {
  const file = parse(fileName, source);
  const found: string[] = [];
  const visit = (node: ts.Node): void => {
    if (
      ts.isJsxAttribute(node) &&
      node.name.getText() === 'dangerouslySetInnerHTML'
    ) {
      const value =
        node.initializer && ts.isJsxExpression(node.initializer)
          ? node.initializer.expression
          : undefined;
      const html =
        value && ts.isObjectLiteralExpression(value)
          ? value.properties.find(
              (p): p is ts.PropertyAssignment =>
                ts.isPropertyAssignment(p) && p.name.getText() === '__html',
            )?.initializer
          : undefined;
      if (!isWithPublicUrlsCall(html)) {
        const { line } = file.getLineAndCharacterOfPosition(node.getStart());
        found.push(`${fileName}:${line + 1}`);
      }
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

  it('flags public-site links without noopener noreferrer in a new tab', () => {
    expect(
      leakyPublicLinks(
        'x.tsx',
        [
          '<Button href={viewLiveHref} target="_blank" rel="noopener">x</Button>;',
          '<a href={publicUrl(`/posts/${slug}`)}>x</a>;',
          '<a href="https://x.example" target="_blank">x</a>;',
          "link.setAttribute('rel', 'noopener');",
          '<Button href={viewLiveHref} target="_blank" rel="noopener noreferrer">x</Button>;',
          '<a href={publicUrl("/")} target="_blank" rel="noopener noreferrer">x</a>;',
          "link.setAttribute('rel', 'noopener noreferrer');",
          '<a href="#top">x</a>;',
        ].join('\n'),
      ),
    ).toEqual(['x.tsx:1', 'x.tsx:2', 'x.tsx:3', 'x.tsx:4']);
  });

  it('every admin link to the public site opens a new tab with noopener noreferrer', () => {
    const files = [...adminSources(adminDir), ...adminSources(workspaceDir)];
    expect(files.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(['EditorActionBar.tsx', 'publicUrl.ts']),
    );
    const found = files.flatMap((file) =>
      leakyPublicLinks(
        path.relative(srcDir, file),
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(found).toEqual([]);
  });

  it('flags rendered HTML not routed through withPublicUrls', () => {
    expect(
      unroutedInnerHtml(
        'x.tsx',
        [
          '<div dangerouslySetInnerHTML={{ __html: renderPostMarkdownToHtml(md) }} />;',
          '<div dangerouslySetInnerHTML={{ __html: html }} />;',
          '<div dangerouslySetInnerHTML={props} />;',
          '<div dangerouslySetInnerHTML={{ __html: withPublicUrls(renderProjectMarkdownToHtml(md)) }} />;',
          '<div dangerouslySetInnerHTML={{ __html: withPublicUrls(previewHtml) }} />;',
        ].join('\n'),
      ),
    ).toEqual(['x.tsx:1', 'x.tsx:2', 'x.tsx:3']);
  });

  it('every admin preview routes its HTML through withPublicUrls', () => {
    const files = adminSources(adminDir);
    expect(files.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining(['PostBodyPreview.tsx', 'ProjectBodyPreview.tsx']),
    );
    const found = files.flatMap((file) =>
      unroutedInnerHtml(
        path.relative(adminDir, file),
        fs.readFileSync(file, 'utf8'),
      ),
    );
    expect(found).toEqual([]);
  });
});
