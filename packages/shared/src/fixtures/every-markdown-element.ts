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
