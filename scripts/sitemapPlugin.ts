import fs from 'node:fs'
import path from 'node:path'
import type { Plugin } from 'vite'
import { parseFrontmatter } from '../src/utils/frontmatter'

const SITE_URL = 'https://gagnechris.com'

type SitemapEntry = {
  loc: string
  lastmod: string
  changefreq: string
  priority: string
}

const formatDate = (value?: string) => {
  if (value && /^\d{4}-\d{2}-\d{2}/.test(value)) {
    return value.slice(0, 10)
  }
  return new Date().toISOString().slice(0, 10)
}

const loadPublishedPosts = (postsDir: string) => {
  if (!fs.existsSync(postsDir)) {
    return []
  }

  return fs
    .readdirSync(postsDir)
    .filter((filename) => filename.endsWith('.md'))
    .map((filename) => {
      const raw = fs.readFileSync(path.join(postsDir, filename), 'utf8')
      const { data } = parseFrontmatter(raw)
      return {
        slug: data.slug?.trim(),
        date: data.date?.trim(),
      }
    })
    .filter((post): post is { slug: string; date?: string } => Boolean(post.slug))
}

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
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`
}

export function sitemapPlugin(): Plugin {
  return {
    name: 'generate-sitemap',
    apply: 'build',
    closeBundle() {
      const root = process.cwd()
      const postsDir = path.join(root, 'src/posts')
      const today = formatDate()

      const staticEntries: SitemapEntry[] = [
        { loc: `${SITE_URL}/`, lastmod: today, changefreq: 'monthly', priority: '1.0' },
        { loc: `${SITE_URL}/resume`, lastmod: today, changefreq: 'monthly', priority: '0.8' },
        { loc: `${SITE_URL}/blog`, lastmod: today, changefreq: 'weekly', priority: '0.9' },
        { loc: `${SITE_URL}/contact`, lastmod: today, changefreq: 'monthly', priority: '0.6' },
      ]

      const postEntries: SitemapEntry[] = loadPublishedPosts(postsDir).map((post) => ({
        loc: `${SITE_URL}/blog/${post.slug}`,
        lastmod: formatDate(post.date),
        changefreq: 'monthly',
        priority: '0.7',
      }))

      const xml = buildSitemapXml([...staticEntries, ...postEntries])
      const outPath = path.join(root, 'dist/sitemap.xml')
      fs.writeFileSync(outPath, xml)
    },
  }
}
