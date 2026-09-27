import type { Resume } from '@gagnechris/shared';

export { nowIso } from '../data/singleton-repository.js';

/** Singleton resume — draft META + optional PUBLISHED snapshot (see docs/data-model.md). */
export const RESUME_ID = 'current';

export function resumePk(): string {
  return `RESUME#${RESUME_ID}`;
}

export function resumeMetaSk(): string {
  return 'META';
}

export function resumePublishedSk(): string {
  return 'PUBLISHED';
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

export function resumeContentEqual(
  a: Pick<Resume, 'name' | 'pdfPath' | 'content' | 'seo'>,
  b: Pick<Resume, 'name' | 'pdfPath' | 'content' | 'seo'>,
): boolean {
  return (
    a.name === b.name &&
    a.pdfPath === b.pdfPath &&
    JSON.stringify(a.content) === JSON.stringify(b.content) &&
    JSON.stringify(a.seo ?? null) === JSON.stringify(b.seo ?? null)
  );
}

export function metaToResume(
  item: ResumeMetaItem,
  hasUnpublishedChanges = false,
): Resume {
  return {
    name: item.name,
    pdfPath: item.pdfPath,
    content: item.content,
    status: item.status,
    publishedAt: item.publishedAt ?? null,
    updatedAt: item.updatedAt,
    seo: item.seo ?? null,
    version: item.version,
    hasUnpublishedChanges,
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

export function buildResumePublishedItem(resume: Resume): ResumeMetaItem {
  return {
    ...buildResumeMetaItem(resume),
    sk: resumePublishedSk(),
    status: 'published',
  };
}
