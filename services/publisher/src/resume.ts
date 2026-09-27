import type { Resume } from '@gagnechris/shared';

export type ResumeMetaRecord = {
  pk?: string;
  sk?: string;
  entityType?: string;
  name: string;
  pdfPath: string;
  content: Resume['content'];
  status: Resume['status'];
  publishedAt?: string | null;
  updatedAt: string;
  seo?: Resume['seo'];
  version?: number;
};

export function metaToResume(item: ResumeMetaRecord): Resume {
  return {
    name: item.name,
    pdfPath: item.pdfPath,
    content: item.content,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version ?? 0,
  };
}
