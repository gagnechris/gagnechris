import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { projectPageView } from '@gagnechris/shared/render';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import type { Project, ProjectPageView } from '@gagnechris/shared';
import { ProjectPageBody, PublicLinkContext } from '@gagnechris/public-ui';
import { renderProjectPageBodyHtml } from '@gagnechris/public-ui/server';
import SiteLink from '../components/SiteLink';
import ProjectDemoSlot from './ProjectDemoSlot';
import { projectPageViewFromDocument } from './publishedProject';

const normalize = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML;
};

const posts = SAMPLE_PROJECTS.find((p) => p.slug === 'posts')!;
const notebook = SAMPLE_PROJECTS.find((p) => p.slug === 'notebook')!;

const LOG = [
  {
    id: '01B',
    slug: 'newer',
    title: 'Newer & "better"',
    publishedAt: '2026-03-02T10:00:00.000Z',
  },
  { id: '01A', slug: 'welcome', title: 'Welcome', publishedAt: null },
];

const PAGES: Record<string, [Project, typeof LOG]> = {
  'a demo with no preview image, steps and a Build log': [
    {
      ...posts,
      bodyMarkdown:
        '## Why I built it\n\nBecause.\n\n## How publishing works\n\n1. Write.\n2. Publish.',
      links: [
        { label: 'Source', url: 'https://github.com/gagnechris' },
        { label: 'Posts', url: '/posts' },
      ],
    },
    LOG,
  ],
  'a demo with a preview image, label rows and no posts': [
    {
      ...notebook,
      previewImage: '/media/projects/notebook.png',
      bodyMarkdown:
        '## How it’s built\n\n- **Stack** TypeScript\n- **Data** DynamoDB',
    },
    [],
  ],
  'no demo, no pitch, no stack, an idea': [
    {
      ...notebook,
      demo: null,
      pitch: '',
      stack: [],
      stage: 'idea',
      stageNote: '',
    },
    [],
  ],
};

const InApp = ({ project }: { project: ProjectPageView }) => (
  <MemoryRouter>
    <PublicLinkContext.Provider value={SiteLink}>
      <ProjectPageBody
        project={project}
        demoSlot={<ProjectDemoSlot project={project} />}
      />
    </PublicLinkContext.Provider>
  </MemoryRouter>
);

describe('projectPageViewFromDocument', () => {
  test.each(Object.entries(PAGES))(
    'reads back %s, which the app renders as published',
    (_name, [project, log]) => {
      const view = projectPageView(project, log);
      const prerender = renderProjectPageBodyHtml(view);
      const parsed = projectPageViewFromDocument(
        new DOMParser().parseFromString(prerender, 'text/html'),
      )!;
      expect(parsed).toEqual({
        ...view,
        buildLog: view.buildLog.map((p) => ({
          ...p,
          publishedAt: p.publishedAt?.slice(0, 10) ?? null,
        })),
      });

      const { container } = render(<InApp project={parsed} />);
      expect(container.innerHTML).toBe(normalize(prerender));
    },
  );

  test('no demo slot without a demo', () => {
    const { container } = render(
      <InApp project={projectPageView({ ...notebook, demo: null })} />,
    );
    expect(container.querySelector('.project-demo')).toBeNull();
    expect(container.textContent).not.toContain('Try it');
  });
});
