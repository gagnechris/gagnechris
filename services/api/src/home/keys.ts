import type { Home } from '@gagnechris/shared';

/** Singleton home page — draft META + optional PUBLISHED snapshot (see docs/data-model.md). */
export const HOME_ID = 'current';

export function homePk(): string {
  return `HOME#${HOME_ID}`;
}

export function homeMetaSk(): string {
  return 'META';
}

export function homePublishedSk(): string {
  return 'PUBLISHED';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export type HomeMetaItem = {
  pk: string;
  sk: string;
  entityType: 'home';
  homeId: string;
  name: string;
  title: string;
  about: string;
  status: Home['status'];
  publishedAt: string | null;
  updatedAt: string;
  seo: Home['seo'];
  version: number;
};

/** Content fields only — used to detect draft vs published snapshot drift. */
export function homeContentEqual(
  a: Pick<Home, 'name' | 'title' | 'about' | 'seo'>,
  b: Pick<Home, 'name' | 'title' | 'about' | 'seo'>,
): boolean {
  return (
    a.name === b.name &&
    a.title === b.title &&
    a.about === b.about &&
    JSON.stringify(a.seo ?? null) === JSON.stringify(b.seo ?? null)
  );
}

export function metaToHome(
  item: HomeMetaItem,
  hasUnpublishedChanges = false,
): Home {
  return {
    name: item.name,
    title: item.title,
    about: item.about,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
  };
}

export function buildHomeMetaItem(home: Home): HomeMetaItem {
  return {
    pk: homePk(),
    sk: homeMetaSk(),
    entityType: 'home',
    homeId: HOME_ID,
    name: home.name,
    title: home.title,
    about: home.about,
    status: home.status,
    publishedAt: home.publishedAt,
    updatedAt: home.updatedAt,
    seo: home.seo,
    version: home.version,
  };
}

export function buildHomePublishedItem(home: Home): HomeMetaItem {
  return {
    ...buildHomeMetaItem(home),
    sk: homePublishedSk(),
    status: 'published',
  };
}
