import type { Home } from '@gagnechris/shared';

export type HomeMetaRecord = {
  pk?: string;
  sk?: string;
  entityType?: string;
  name: string;
  title: string;
  about: string;
  status: Home['status'];
  publishedAt?: string | null;
  updatedAt: string;
  seo?: Home['seo'];
  version?: number;
};

export function metaToHome(item: HomeMetaRecord): Home {
  return {
    name: item.name,
    title: item.title,
    about: item.about,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version ?? 0,
    hasUnpublishedChanges: false,
  };
}
