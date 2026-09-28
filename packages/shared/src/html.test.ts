import { describe, expect, it } from 'vitest';
import {
  escapeHtml,
  replaceMeta,
  upsertCanonical,
  upsertMeta,
} from './html.js';

describe('escapeHtml', () => {
  it('escapes &, <, >, ", and \'', () => {
    expect(escapeHtml(`<a href="x"> & 'y'`)).toBe(
      '&lt;a href=&quot;x&quot;&gt; &amp; &#39;y&#39;',
    );
  });
});

describe('replaceMeta / upsertMeta / upsertCanonical', () => {
  const shell = `<html><head>
<title>Old</title>
<meta name="description" content="old" />
<meta property="og:title" content="old" />
<link rel="canonical" href="https://example.com/" />
</head><body></body></html>`;

  it('replaces existing meta by name/property without mangling $', () => {
    const next = replaceMeta(
      shell,
      'name',
      'description',
      'Making $$$ with $&',
    );
    expect(next).toContain(
      '<meta name="description" content="Making $$$ with $&" />',
    );
    expect(next).not.toContain('<meta name="description" content="old" />');
  });

  it('appends missing meta before </head>', () => {
    const next = upsertMeta(
      shell,
      'property',
      'article:published_time',
      '2026-01-01',
    );
    expect(next).toContain(
      '<meta property="article:published_time" content="2026-01-01" />\n</head>',
    );
  });

  it('replaces existing canonical', () => {
    const next = upsertCanonical(shell, 'https://example.com/blog');
    expect(next).toContain(
      '<link rel="canonical" href="https://example.com/blog" />',
    );
    expect(next.match(/rel="canonical"/g)?.length).toBe(1);
  });
});
