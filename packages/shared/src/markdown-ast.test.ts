// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  EVERY_MARKDOWN_ELEMENT,
  EVERY_MARKDOWN_ELEMENT_TREE,
  markdownNoteOfSize,
  tidyMarkdownTree,
  type MarkdownTreeNode,
} from './fixtures/every-markdown-element.js';
import {
  decodeHtmlEntities,
  parseMarkdownBlocks,
  type MarkdownBlock,
  type MarkdownInline,
} from './markdown-ast.js';
import { renderMarkdownToHtml } from './markdown.js';

const el = (
  tag: string,
  children: MarkdownTreeNode[],
  attrs?: Record<string, string | number | boolean>,
): MarkdownTreeNode => (attrs ? { tag, attrs, children } : { tag, children });

const TAG_ALIASES: Record<string, string> = { b: 'strong', i: 'em', s: 'del' };
const KEPT_TAGS = new Set([
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'p',
  'strong',
  'em',
  'del',
  'blockquote',
  'ul',
  'hr',
  'table',
  'tr',
  'th',
  'td',
  'br',
]);

/** The web preview's DOM as a tree; wrappers such as `thead` and `div` flatten into their parent. */
const webTree = (html: string): MarkdownTreeNode[] => {
  const template = document.createElement('template');
  template.innerHTML = html;
  const walk = (node: Node): MarkdownTreeNode[] => {
    if (node.nodeType === Node.TEXT_NODE) return [node.textContent ?? ''];
    if (node.nodeType !== Node.ELEMENT_NODE) return [];
    const element = node as Element;
    const tag = TAG_ALIASES[element.localName] ?? element.localName;
    const children = () => [...element.childNodes].flatMap(walk);
    switch (tag) {
      case 'pre': {
        const code = element.querySelector('code');
        const lang = /language-(\S+)/.exec(code?.className ?? '')?.[1];
        const text = (code ?? element).textContent!.replace(/\n$/, '');
        return [el('pre', [text], lang ? { lang } : undefined)];
      }
      case 'code':
        return [el('code', [element.textContent ?? ''])];
      case 'a': {
        const href = element.getAttribute('href');
        return href ? [el('a', children(), { href })] : children();
      }
      case 'img': {
        const src = element.getAttribute('src');
        const alt = element.getAttribute('alt') ?? '';
        return [el('img', [], src ? { src, alt } : { alt })];
      }
      case 'ol': {
        const start = element.getAttribute('start');
        return [
          el('ol', children(), start ? { start: Number(start) } : undefined),
        ];
      }
      case 'li': {
        const box = element.querySelector(
          ':scope > input[type=checkbox], :scope > p > input[type=checkbox]',
        );
        return [
          el(
            'li',
            children(),
            box ? { checked: box.hasAttribute('checked') } : undefined,
          ),
        ];
      }
      case 'input':
        return [];
      default:
        return KEPT_TAGS.has(tag) ? [el(tag, children())] : children();
    }
  };
  return tidyMarkdownTree([...template.content.childNodes].flatMap(walk));
};

const inlineTree = (nodes: MarkdownInline[]): MarkdownTreeNode[] =>
  nodes.map((node) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'code':
        return el('code', [node.text]);
      case 'link':
        return el('a', inlineTree(node.children), { href: node.href });
      case 'image':
        return el(
          'img',
          [],
          node.src ? { src: node.src, alt: node.alt } : { alt: node.alt },
        );
      case 'break':
        return el('br', []);
      default:
        return el(node.type, inlineTree(node.children));
    }
  });

const astTree = (nodes: MarkdownBlock[]): MarkdownTreeNode[] =>
  tidyMarkdownTree(
    nodes.map((node): MarkdownTreeNode => {
      switch (node.type) {
        case 'heading':
          return el(`h${node.depth}`, inlineTree(node.children));
        case 'paragraph':
          return el('p', inlineTree(node.children));
        case 'blockquote':
          return el('blockquote', astTree(node.children));
        case 'list':
          return el(
            node.ordered ? 'ol' : 'ul',
            node.items.map((item) =>
              el(
                'li',
                astTree(item.children),
                item.task ? { checked: item.checked } : undefined,
              ),
            ),
            node.ordered && node.start !== 1
              ? { start: node.start }
              : undefined,
          );
        case 'code':
          return el(
            'pre',
            [node.text],
            node.lang ? { lang: node.lang } : undefined,
          );
        case 'hr':
          return el('hr', []);
        case 'table':
          return el('table', [
            el(
              'tr',
              node.header.map((cell) => el('th', inlineTree(cell))),
            ),
            ...node.rows.map((row) =>
              el(
                'tr',
                row.map((cell) => el('td', inlineTree(cell))),
              ),
            ),
          ]);
        case 'taskEmbed':
          return el('task-embed', [], { id: node.id });
      }
    }),
  );

const parity = (markdown: string) => ({
  native: astTree(parseMarkdownBlocks(markdown)),
  web: webTree(renderMarkdownToHtml(markdown)),
});

const TASK_ID = '01J9Z3A0000000000000000001';

describe('parseMarkdownBlocks', () => {
  it('matches the web preview structure for every markdown element', () => {
    const { native, web } = parity(EVERY_MARKDOWN_ELEMENT);
    expect(web).toEqual(EVERY_MARKDOWN_ELEMENT_TREE);
    expect(native).toEqual(EVERY_MARKDOWN_ELEMENT_TREE);
  });

  it.each([
    [
      'loose lists and ordered starts',
      '3. one\n\n4. two\n\n   more\n\n- [x] *done*\n\n  next',
    ],
    [
      'entities',
      'a &amp; b &lt;c&gt; &copy; &#65; &#x263A; &unknown; `&amp; <b>`',
    ],
    [
      'breaks and escapes',
      'line one  \nline two\\\nthree \\*not em\\* soft\nwrap',
    ],
    [
      'autolinks and titles',
      '<https://a.example> www.b.example [t](https://c.example "T") [rel](/posts/x)',
    ],
    [
      'nested quotes and code',
      '> quote\n>\n> > inner\n>\n> ```\n> code &amp; <i>\n> ```',
    ],
  ])('matches the web preview for %s', (_name, markdown) => {
    const { native, web } = parity(markdown);
    expect(native).toEqual(web);
  });

  it('shows the same text as the web preview for inline HTML, without the tags', () => {
    const markdown =
      'a <b>bold</b> <span title="x">s</span> <script>alert(1)</script> after';
    const text = (nodes: MarkdownTreeNode[]): string =>
      nodes.map((n) => (typeof n === 'string' ? n : text(n.children))).join('');
    const { native, web } = parity(markdown);
    expect(text(native)).toBe(text(web));
    expect(native).toEqual([el('p', ['a bold s after'])]);
  });

  it('splits on task embed lines the way the web preview does', () => {
    const blocks = parseMarkdownBlocks(
      `## Standup\n\n{{task:${TASK_ID.toLowerCase()}}}\n  {{task:${TASK_ID}}}\nAfter\n\n\`\`\`\n{{task:${TASK_ID}}}\n\`\`\``,
    );
    expect(astTree(blocks)).toEqual([
      el('h2', ['Standup']),
      el('task-embed', [], { id: TASK_ID }),
      el('task-embed', [], { id: TASK_ID }),
      el('p', ['After']),
      el('pre', [`{{task:${TASK_ID}}}`]),
    ]);
    expect(blocks[2]).toEqual({ type: 'taskEmbed', id: TASK_ID, indent: '  ' });
  });

  it('keeps no HTML: tags are dropped, text kept, script content removed', () => {
    const blocks = parseMarkdownBlocks(
      '<div onclick="x()">block <b>text</b></div>\n\n<script>alert(1)</script>\n\n<iframe src="https://evil.example"></iframe>\n\nok <img src=x onerror=alert(1)> <style>p{}</style>end',
    );
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'block text' }] },
      { type: 'paragraph', children: [{ type: 'text', text: 'ok end' }] },
    ]);
    expect(JSON.stringify(blocks)).not.toMatch(/[<>]|alert|onerror/);
  });

  it('decodes entities the way a browser shows them', () => {
    expect(decodeHtmlEntities('&amp;&lt;&#106;&#x41;&nope;&#0;')).toBe(
      '&<jA&nope;\ufffd',
    );
  });
});

describe('unsafe links', () => {
  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    '&#106;avascript:alert(1)',
    'vbscript:msgbox(1)',
    'data:text/html,<script>alert(1)</script>',
    '//evil.example',
    'ftp://example.com/f',
    'https://gagnechris.com@evil.example',
    '#top',
  ])('renders [x](%s) as plain text', (href) => {
    const blocks = parseMarkdownBlocks(`a [x](<${href}>) b`);
    expect(blocks).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'a x b' }] },
    ]);
  });

  it('keeps https, mailto, tel and site paths', () => {
    const blocks = parseMarkdownBlocks(
      '[a](https://a.example) [b](mailto:a@example.com) [c](tel:+15555555555) [d](/posts/x)',
    );
    const hrefs = JSON.stringify(blocks).match(/"href":"[^"]+"/g);
    expect(hrefs).toEqual([
      '"href":"https://a.example"',
      '"href":"mailto:a@example.com"',
      '"href":"tel:+15555555555"',
      '"href":"/posts/x"',
    ]);
  });

  it('drops unsafe image sources but keeps the alt text', () => {
    expect(
      parseMarkdownBlocks(
        '![a](javascript:alert(1)) ![b](data:image/png;base64,AAAA) ![c](//evil.example/x.png)',
      ),
    ).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'image', src: null, alt: 'a', title: null },
          { type: 'text', text: ' ' },
          { type: 'image', src: null, alt: 'b', title: null },
          { type: 'text', text: ' ' },
          { type: 'image', src: null, alt: 'c', title: null },
        ],
      },
    ]);
  });
});

describe('a 20 KB note', () => {
  it('parses within a frame budget', () => {
    const note = markdownNoteOfSize(20 * 1024);
    expect(note.length).toBeGreaterThanOrEqual(20 * 1024);
    parseMarkdownBlocks(note);
    const runs = Array.from({ length: 5 }, () => {
      const start = performance.now();
      parseMarkdownBlocks(note);
      return performance.now() - start;
    }).sort((a, b) => a - b);
    // Median; about 2 ms on a laptop, generous for CI.
    expect(runs[2]).toBeLessThan(50);
  });
});
