import type { Home } from '@gagnechris/shared';

/** Singleton home page — one item, fetched by key (no GSI1 row, see docs/data-model.md). */
export const HOME_ID = 'current';

export function homePk(): string {
  return `HOME#${HOME_ID}`;
}

export function homeMetaSk(): string {
  return 'META';
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

export function metaToHome(item: HomeMetaItem): Home {
  return {
    name: item.name,
    title: item.title,
    about: item.about,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
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
