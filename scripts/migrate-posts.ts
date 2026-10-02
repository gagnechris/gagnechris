/**
 * One-time CHR-36 import of legacy bundled posts into the CMS table.
 *
 * Local:
 *   source scripts/local/env.sh && npm run migrate:posts
 *
 * Prod (writes DATA rows; publisher runs via DynamoDB Streams):
 *   AWS_PROFILE=gagnechris-admin DATA_TABLE_NAME=gagnechris-prod npm run migrate:posts
 *
 * Idempotent: skips slugs that already exist.
 */
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PostsRepository } from '@gagnechris/api/posts/repository';

type MigrateTarget = {
  file: string;
  /** Override frontmatter slug when set. */
  slug?: string;
  status: 'draft' | 'published';
};

const TARGETS: MigrateTarget[] = [
  {
    file: 'welcome-to-my-blog.md',
    slug: 'welcome',
    status: 'published',
  },
  {
    file: 'building-high-performing-teams.bak',
    status: 'draft',
  },
  {
    file: 'embracing-agentic-ai.bak',
    status: 'draft',
  },
];

type ParsedPost = {
  title: string;
  slug: string;
  excerpt: string;
  bodyMarkdown: string;
  publishedAt: string | null;
};

function fixturesDir(): string {
  return join(
    dirname(fileURLToPath(import.meta.url)),
    'migrate-posts',
    'fixtures',
  );
}

function parseFrontmatter(raw: string): ParsedPost {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Missing YAML frontmatter');
  }
  const yaml = match[1]!;
  const bodyMarkdown = match[2]!.replace(/^\uFEFF/, '').trimStart();
  const fields: Record<string, string> = {};
  for (const line of yaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf(':');
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    fields[key] = value;
  }

  const title = fields.title?.trim();
  if (!title) throw new Error('Frontmatter missing title');
  const slug = fields.slug?.trim();
  if (!slug) throw new Error('Frontmatter missing slug');

  let publishedAt: string | null = null;
  if (fields.date?.trim()) {
    const iso = new Date(`${fields.date.trim()}T00:00:00.000Z`);
    if (Number.isNaN(iso.getTime())) {
      throw new Error(`Invalid frontmatter date: ${fields.date}`);
    }
    publishedAt = iso.toISOString();
  }

  return {
    title,
    slug,
    excerpt: fields.excerpt?.trim() ?? '',
    bodyMarkdown: bodyMarkdown.trimEnd() + '\n',
    publishedAt,
  };
}

async function main(): Promise<void> {
  const table = process.env.DATA_TABLE_NAME?.trim();
  if (!table) {
    throw new Error('DATA_TABLE_NAME is required');
  }
  if (table === 'gagnechris-prod' && process.env.CONFIRM_PROD_MIGRATE !== '1') {
    throw new Error(
      'Refusing prod migrate without CONFIRM_PROD_MIGRATE=1 (table=gagnechris-prod)',
    );
  }

  const repo = new PostsRepository();
  const dir = fixturesDir();
  let created = 0;
  let skipped = 0;
  let published = 0;

  for (const target of TARGETS) {
    const raw = await readFile(join(dir, target.file), 'utf8');
    const parsed = parseFrontmatter(raw);
    const slug = target.slug ?? parsed.slug;

    const existing = await repo.getBySlug(slug);
    if (existing) {
      console.log(
        `skip  slug=${slug} id=${existing.id} status=${existing.status}`,
      );
      skipped += 1;
      continue;
    }

    const draft = await repo.create({
      title: parsed.title,
      slug,
      excerpt: parsed.excerpt,
      bodyMarkdown: parsed.bodyMarkdown,
    });
    created += 1;
    console.log(`create slug=${slug} id=${draft.id}`);

    if (target.status === 'published') {
      const live = await repo.publish(draft.id, draft.version, {
        publishedAt: parsed.publishedAt ?? undefined,
      });
      published += 1;
      console.log(
        `publish slug=${slug} id=${live.id} publishedAt=${live.publishedAt}`,
      );
    }
  }

  if (process.env.SITE_STORAGE === 'filesystem') {
    const { rebuildPublishedSite } =
      await import('@gagnechris/publisher/s3-site');
    console.log('rebuild local site…');
    await rebuildPublishedSite();
  } else if (published > 0) {
    console.log(
      'Publisher will rebuild via DynamoDB Streams (prod). Allow ~30s then check /blog/welcome.',
    );
  }

  console.log(
    `done table=${table} created=${created} published=${published} skipped=${skipped}`,
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
