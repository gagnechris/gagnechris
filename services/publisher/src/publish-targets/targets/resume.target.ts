import { renderResumePage, renderResumeUnavailablePage } from '../../render.js';
import { buildResumePdfArtifact, RESUME_PDF_KEY } from '../../resume-pdf.js';
import { htmlArtifact } from '../artifacts.js';
import type { PublishArtifact, PublishTarget } from '../types.js';

const RESUME_PAGE_KEY = 'resume/index.html';

const target: PublishTarget = {
  id: 'resume',
  optionBPaths: ['/resume'],
  adminMutationPrefixes: ['/api/admin/resume'],
  matches(scope) {
    return scope.resume;
  },
  needs: { shell: true },
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
        htmlArtifact(RESUME_PAGE_KEY, renderResumePage(shell, resume)),
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
        htmlArtifact(RESUME_PAGE_KEY, renderResumeUnavailablePage(shell)),
      ],
      deleteKeys: [RESUME_PDF_KEY],
      invalidationPaths: ['/resume*'],
      resumeUnpublished: true,
    };
  },
};

export default target;
