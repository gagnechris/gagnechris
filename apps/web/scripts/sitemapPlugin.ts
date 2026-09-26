import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { parseFrontmatter } from '../src/utils/frontmatter.ts'

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

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
    .flatMap((filename) => {
      const raw = fs.readFileSync(path.join(postsDir, filename), 'utf8')
      const { data } = parseFrontmatter(raw)
      const slug = data.slug?.trim()
      if (!slug) {
        return []
      }
      return [{ slug, date: data.date?.trim() || undefined }]
    })
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
      const postsDir = path.join(appRoot, 'src/posts')
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
      const outPath = path.join(appRoot, 'dist/sitemap.xml')
      fs.writeFileSync(outPath, xml)
    },
  }
}
