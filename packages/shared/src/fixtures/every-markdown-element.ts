/** A post body using every element the post editor can produce; shared by the post page tests and snapshots. */
export const EVERY_MARKDOWN_ELEMENT = `A paragraph with **bold**, *italic*, ~~struck~~, \`inline code\` and a [link](https://example.com/a-long-path). It runs long enough to wrap onto several lines at desktop width, so the measure can be checked against a real paragraph of prose rather than a short line.

## A second-level heading

> A blockquote that runs long enough to wrap onto a second line, so the indent and the rule beside it can be checked.

- An unordered item
- Another item, with a nested list
  - A nested item
- [x] A finished task
- [ ] An open task

1. The first ordered item
2. The second ordered item

### A third-level heading

\`\`\`ts
export const readingMinutes = (markdown: string): number => Math.max(1, Math.round(countWords(markdown) / 230));
\`\`\`

![A view of the site](https://gagnechris.com/og-image.jpg "A caption under the image")

| Column one | Column two | Column three | Column four | Column five | Column six |
| ---------- | ---------- | ------------ | ----------- | ----------- | ---------- |
| A wide table cell | that keeps going | and going | so the table | is wider than | a phone screen |
| 1 | 2 | 3 | 4 | 5 | 6 |

---

#### A fourth-level heading

A closing paragraph.
`;

/**
 * A rendered markdown body reduced to structure and visible text, so the web
 * HTML and a native render can be compared. Tags follow HTML; inline content
 * directly in an `li` counts as a `p`, and code-block text drops its final
 * newline.
 */
export type MarkdownTreeNode =
  | string
  | {
      tag: string;
      attrs?: Record<string, string | number | boolean>;
      children: MarkdownTreeNode[];
    };

const INLINE_TAGS = new Set(['strong', 'em', 'del', 'code', 'a', 'img', 'br']);

const isInline = (node: MarkdownTreeNode): boolean =>
  typeof node === 'string' || INLINE_TAGS.has(node.tag);

/** Merge adjacent text, collapse spaces outside `pre`, trim block edges, drop empty text. */
export const tidyMarkdownTree = (
  nodes: readonly MarkdownTreeNode[],
  parentTag = '',
): MarkdownTreeNode[] => {
  const merged: MarkdownTreeNode[] = [];
  for (const node of nodes) {
    const tidied =
      typeof node === 'string'
        ? parentTag === 'pre'
          ? node
          : node.replace(/[ \t\r\n]+/g, ' ')
        : { ...node, children: tidyMarkdownTree(node.children, node.tag) };
    const last = merged[merged.length - 1];
    if (typeof tidied === 'string' && typeof last === 'string') {
      merged[merged.length - 1] = last + tidied;
    } else {
      merged.push(tidied);
    }
  }
  if (parentTag === 'pre') return merged;
  const out: MarkdownTreeNode[] = [];
  merged.forEach((node, i) => {
    if (typeof node !== 'string') return out.push(node);
    const blockBefore = i === 0 || !isInline(merged[i - 1]!);
    const blockAfter = i === merged.length - 1 || !isInline(merged[i + 1]!);
    let text = node;
    if (blockBefore && !INLINE_TAGS.has(parentTag)) text = text.trimStart();
    if (blockAfter && !INLINE_TAGS.has(parentTag)) text = text.trimEnd();
    if (text) out.push(text);
  });
  if (parentTag !== 'li') return out;
  // Tight list items hold their text without a `p`.
  const wrapped: MarkdownTreeNode[] = [];
  let run: MarkdownTreeNode[] = [];
  const flush = () => {
    if (run.length) wrapped.push({ tag: 'p', children: run });
    run = [];
  };
  for (const node of out) {
    if (isInline(node)) run.push(node);
    else {
      flush();
      wrapped.push(node);
    }
  }
  flush();
  return wrapped;
};

/** The every-element body, plus task embeds, repeated to at least `bytes` characters. */
export const markdownNoteOfSize = (bytes: number): string => {
  const section = (n: number) =>
    `${EVERY_MARKDOWN_ELEMENT}\n{{task:01J9Z3A00000000000000000${String(n % 100).padStart(2, '0')}}}\n- [ ] A plain task ${n}\n\n`;
  let note = '';
  for (let n = 0; note.length < bytes; n++) note += section(n);
  return note;
};

/** `EVERY_MARKDOWN_ELEMENT` as the web Notebook preview renders it. */
export const EVERY_MARKDOWN_ELEMENT_TREE: MarkdownTreeNode[] = [
  {
    tag: 'p',
    children: [
      'A paragraph with ',
      {
        tag: 'strong',
        children: ['bold'],
      },
      ', ',
      {
        tag: 'em',
        children: ['italic'],
      },
      ', ',
      {
        tag: 'del',
        children: ['struck'],
      },
      ', ',
      {
        tag: 'code',
        children: ['inline code'],
      },
      ' and a ',
      {
        tag: 'a',
        attrs: {
          href: 'https://example.com/a-long-path',
        },
        children: ['link'],
      },
      '. It runs long enough to wrap onto several lines at desktop width, so the measure can be checked against a real paragraph of prose rather than a short line.',
    ],
  },
  {
    tag: 'h2',
    children: ['A second-level heading'],
  },
  {
    tag: 'blockquote',
    children: [
      {
        tag: 'p',
        children: [
          'A blockquote that runs long enough to wrap onto a second line, so the indent and the rule beside it can be checked.',
        ],
      },
    ],
  },
  {
    tag: 'ul',
    children: [
      {
        tag: 'li',
        children: [
          {
            tag: 'p',
            children: ['An unordered item'],
          },
        ],
      },
      {
        tag: 'li',
        children: [
          {
            tag: 'p',
            children: ['Another item, with a nested list'],
          },
          {
            tag: 'ul',
            children: [
              {
                tag: 'li',
                children: [
                  {
                    tag: 'p',
                    children: ['A nested item'],
                  },
                ],
              },
            ],
          },
        ],
      },
      {
        tag: 'li',
        attrs: {
          checked: true,
        },
        children: [
          {
            tag: 'p',
            children: ['A finished task'],
          },
        ],
      },
      {
        tag: 'li',
        attrs: {
          checked: false,
        },
        children: [
          {
            tag: 'p',
            children: ['An open task'],
          },
        ],
      },
    ],
  },
  {
    tag: 'ol',
    children: [
      {
        tag: 'li',
        children: [
          {
            tag: 'p',
            children: ['The first ordered item'],
          },
        ],
      },
      {
        tag: 'li',
        children: [
          {
            tag: 'p',
            children: ['The second ordered item'],
          },
        ],
      },
    ],
  },
  {
    tag: 'h3',
    children: ['A third-level heading'],
  },
  {
    tag: 'pre',
    attrs: {
      lang: 'ts',
    },
    children: [
      'export const readingMinutes = (markdown: string): number => Math.max(1, Math.round(countWords(markdown) / 230));',
    ],
  },
  {
    tag: 'p',
    children: [
      {
        tag: 'img',
        attrs: {
          src: 'https://gagnechris.com/og-image.jpg',
          alt: 'A view of the site',
        },
        children: [],
      },
    ],
  },
  {
    tag: 'table',
    children: [
      {
        tag: 'tr',
        children: [
          {
            tag: 'th',
            children: ['Column one'],
          },
          {
            tag: 'th',
            children: ['Column two'],
          },
          {
            tag: 'th',
            children: ['Column three'],
          },
          {
            tag: 'th',
            children: ['Column four'],
          },
          {
            tag: 'th',
            children: ['Column five'],
          },
          {
            tag: 'th',
            children: ['Column six'],
          },
        ],
      },
      {
        tag: 'tr',
        children: [
          {
            tag: 'td',
            children: ['A wide table cell'],
          },
          {
            tag: 'td',
            children: ['that keeps going'],
          },
          {
            tag: 'td',
            children: ['and going'],
          },
          {
            tag: 'td',
            children: ['so the table'],
          },
          {
            tag: 'td',
            children: ['is wider than'],
          },
          {
            tag: 'td',
            children: ['a phone screen'],
          },
        ],
      },
      {
        tag: 'tr',
        children: [
          {
            tag: 'td',
            children: ['1'],
          },
          {
            tag: 'td',
            children: ['2'],
          },
          {
            tag: 'td',
            children: ['3'],
          },
          {
            tag: 'td',
            children: ['4'],
          },
          {
            tag: 'td',
            children: ['5'],
          },
          {
            tag: 'td',
            children: ['6'],
          },
        ],
      },
    ],
  },
  {
    tag: 'hr',
    children: [],
  },
  {
    tag: 'h4',
    children: ['A fourth-level heading'],
  },
  {
    tag: 'p',
    children: ['A closing paragraph.'],
  },
];
