import type { Resume } from '@gagnechris/shared';

/** Singleton resume — one item, fetched by key (no GSI1 row, see docs/data-model.md). */
export const RESUME_ID = 'current';

export function resumePk(): string {
  return `RESUME#${RESUME_ID}`;
}

export function resumeMetaSk(): string {
  return 'META';
}

export function nowIso(): string {
  return new Date().toISOString();
}

export type ResumeMetaItem = {
  pk: string;
  sk: string;
  entityType: 'resume';
  resumeId: string;
  name: string;
  pdfPath: string;
  content: Resume['content'];
  status: Resume['status'];
  publishedAt: string | null;
  updatedAt: string;
  seo: Resume['seo'];
  version: number;
};

export function metaToResume(item: ResumeMetaItem): Resume {
  return {
    name: item.name,
    pdfPath: item.pdfPath,
    content: item.content,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
  };
}

export function buildResumeMetaItem(resume: Resume): ResumeMetaItem {
  return {
    pk: resumePk(),
    sk: resumeMetaSk(),
    entityType: 'resume',
    resumeId: RESUME_ID,
    name: resume.name,
    pdfPath: resume.pdfPath,
    content: resume.content,
    status: resume.status,
    publishedAt: resume.publishedAt,
    updatedAt: resume.updatedAt,
    seo: resume.seo,
    version: resume.version,
  };
}
