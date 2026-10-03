import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';

const appRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);

const SITE_URL = 'https://gagnechris.com';

type SitemapEntry = {
  loc: string;
  lastmod: string;
  changefreq: string;
  priority: string;
};

const formatDate = (value?: string) => {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
};

const buildSitemapXml = (entries: SitemapEntry[]) => {
  const urls = entries
    .map(
      (entry) => `  <url>
    <loc>${entry.loc}</loc>
    <lastmod>${entry.lastmod}</lastmod>
    <changefreq>${entry.changefreq}</changefreq>
    <priority>${entry.priority}</priority>
  </url>`,
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
};

/**
 * Build-time sitemap for static SPA routes only.
 * Blog post URLs are owned by the publisher (`rebuildPublishedSite` → sitemap.xml).
 * deploy-web excludes dist sitemap from deleting publisher's copy and re-invokes republish-all.
 */
export function sitemapPlugin(): Plugin {
  return {
    name: 'generate-sitemap',
    apply: 'build',
    closeBundle() {
      const today = formatDate();

      const staticEntries: SitemapEntry[] = [
        {
          loc: `${SITE_URL}/`,
          lastmod: today,
          changefreq: 'monthly',
          priority: '1.0',
        },
        {
          loc: `${SITE_URL}/resume`,
          lastmod: today,
          changefreq: 'monthly',
          priority: '0.8',
        },
        {
          loc: `${SITE_URL}/writing`,
          lastmod: today,
          changefreq: 'weekly',
          priority: '0.9',
        },
        {
          loc: `${SITE_URL}/contact`,
          lastmod: today,
          changefreq: 'monthly',
          priority: '0.6',
        },
      ];

      const xml = buildSitemapXml(staticEntries);
      const outPath = path.join(appRoot, 'dist/sitemap.xml');
      fs.writeFileSync(outPath, xml);
    },
  };
}
