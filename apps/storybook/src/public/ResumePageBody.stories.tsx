import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  PublicLink,
  ResumePageBody,
  ResumeSections,
  ResumeUnavailableBody,
} from '@gagnechris/public-ui';
import { DEFAULT_RESUME, resumeIntro } from '@gagnechris/shared/render';
import '@web/public.css';
import '@web/pages/Resume.css';
import { catalog } from '../catalog';
import { withSiteChrome } from './siteChrome';

const meta = {
  title: 'Public site/ResumePageBody',
  component: ResumePageBody,
  parameters: {
    layout: 'fullscreen',
    ...catalog(
      '`apps/mobile/app/site/resume/index.tsx` (sections in `Card` from `apps/mobile/src/site/ui.tsx`, `LoadError`)',
      'The Resume page: title, headline and summary with Download PDF and contact links, then Experience (older roles folded into Earlier roles), Strengths and skills, and Education.',
    ),
  },
  decorators: [withSiteChrome('/resume')],
  args: {
    intro: resumeIntro(DEFAULT_RESUME),
    body: { content: DEFAULT_RESUME.content },
  },
} satisfies Meta<typeof ResumePageBody>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const EveryRoleExpanded: Story = {
  args: {
    body: {
      content: { ...DEFAULT_RESUME.content, earlierRolesThrough: undefined },
    },
  },
};

export const NoHeadlineOrPdf: Story = {
  args: {
    intro: { ...resumeIntro(DEFAULT_RESUME), headline: null, pdfPath: null },
  },
};

export const AfterDownload: Story = {
  args: {
    note: (
      <div className="resume-bear-note" role="status">
        <p>
          Download started. While you wait —{' '}
          <PublicLink href="/dont-feed-the-bears?from=resume">
            Don't Feed the Bears
          </PublicLink>
          ?
        </p>
        <button
          type="button"
          className="resume-bear-note__dismiss"
          aria-label="Dismiss bear game note"
        >
          ×
        </button>
      </div>
    ),
  },
};

export const Unavailable: Story = {
  render: () => <ResumeUnavailableBody />,
};

export const SectionsOnly: Story = {
  parameters: { layout: 'padded', siteChrome: false },
  render: () => (
    <div className="resume-page">
      <div className="resume-body">
        <ResumeSections content={DEFAULT_RESUME.content} />
      </div>
    </div>
  ),
};
