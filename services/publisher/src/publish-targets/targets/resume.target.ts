import { renderResumePage, renderResumeUnavailablePage } from '../../render.js';
import { buildResumePdfArtifact, RESUME_PDF_KEY } from '../../resume-pdf.js';
import type { PublishArtifact, PublishTarget } from '../types.js';
import { CACHE_HTML } from '../types.js';

const target: PublishTarget = {
  id: 'resume',
  optionBPaths: ['/resume'],
  adminMutationPrefixes: ['/api/admin/resume'],
  matches(scope) {
    return scope.resume;
  },
  needsCatalog() {
    return false;
  },
  needsShell() {
    return true;
  },
  async run(ctx) {
    const { shell, sources } = ctx;
    const lookup = await sources.getPublishedResume();
    if (lookup.status === 'corrupt') {
      // Preserve live HTML + PDF; do not treat as unpublished.
      return {};
    }
    if (lookup.status === 'ok') {
      const resume = lookup.entity;
      const artifacts: PublishArtifact[] = [
        {
          key: 'resume/index.html',
          body: renderResumePage(shell, resume),
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
      ];
      const pdf = await buildResumePdfArtifact(resume);
      let resumePdfFailed = false;
      if (pdf.ok) {
        artifacts.push(pdf.artifact);
      } else {
        resumePdfFailed = true;
      }
      return {
        artifacts,
        invalidationPaths: ['/resume*'],
        resumePublished: true,
        resumePdfFailed,
      };
    }
    return {
      artifacts: [
        {
          key: 'resume/index.html',
          body: renderResumeUnavailablePage(shell),
          contentType: 'text/html; charset=utf-8',
          cacheControl: CACHE_HTML,
        },
      ],
      deleteKeys: [RESUME_PDF_KEY],
      invalidationPaths: ['/resume*'],
      resumeUnpublished: true,
    };
  },
};

export default target;
