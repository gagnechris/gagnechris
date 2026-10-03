import type { Home } from '@gagnechris/shared';
import type { SiteStorage } from './storage.js';

/**
 * Survives web deploys (excluded from s3 sync) so an unpublished Home can be
 * re-injected into a fresh Vite shell instead of falling back to DEFAULT_HOME.
 */
export const HOME_LAST_PUBLISHED_KEY = 'home/last-published.json';

export type HomePublishSnapshot = Pick<
  Home,
  'name' | 'title' | 'about' | 'seo' | 'publishedAt' | 'updatedAt'
>;

export function homeToSnapshot(home: Home): HomePublishSnapshot {
  return {
    name: home.name,
    title: home.title,
    about: home.about,
    seo: home.seo,
    publishedAt: home.publishedAt,
    updatedAt: home.updatedAt,
  };
}

export function snapshotToHome(snapshot: HomePublishSnapshot): Home {
  return {
    ...snapshot,
    status: 'published',
    version: 0,
    hasUnpublishedChanges: false,
  };
}

export async function readHomePublishSnapshot(
  storage: SiteStorage,
): Promise<HomePublishSnapshot | undefined> {
  const raw = await storage.read(HOME_LAST_PUBLISHED_KEY);
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as Partial<HomePublishSnapshot>;
    if (
      typeof parsed.name !== 'string' ||
      typeof parsed.title !== 'string' ||
      typeof parsed.about !== 'string'
    ) {
      return undefined;
    }
    return {
      name: parsed.name,
      title: parsed.title,
      about: parsed.about,
      seo: parsed.seo ?? null,
      publishedAt: parsed.publishedAt ?? null,
      updatedAt:
        typeof parsed.updatedAt === 'string'
          ? parsed.updatedAt
          : new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}
