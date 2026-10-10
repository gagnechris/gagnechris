import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { projectCardViews, type Project } from '@gagnechris/shared';
import { SAMPLE_PROJECTS } from '@gagnechris/shared/fixtures/sample-projects';
import { ProjectsIndexBody, PublicLinkContext } from '@gagnechris/public-ui';
import { renderProjectsIndexBodyHtml } from '@gagnechris/public-ui/server';
import SiteLink from '../components/SiteLink';
import { projectsIndexFromDocument } from './publishedProjects';

const normalize = (html: string): string => {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template.innerHTML;
};

const LISTS: Record<string, readonly Project[]> = {
  'one of each stage, an href card and an unlinked idea': SAMPLE_PROJECTS,
  'an external href, no pitch, no stack': [
    {
      ...SAMPLE_PROJECTS[1]!,
      slug: 'elsewhere',
      name: 'Elsewhere & "co"',
      pitch: '',
      stack: [],
      demo: null,
      href: 'https://example.com/a?b=1&c=2',
    },
  ],
  'nothing published': [],
};

const parsed = (html: string) =>
  projectsIndexFromDocument(
    new DOMParser().parseFromString(html, 'text/html'),
  )!;

const InApp = ({ children }: { children: ReactNode }) => (
  <MemoryRouter>
    <PublicLinkContext.Provider value={SiteLink}>
      {children}
    </PublicLinkContext.Provider>
  </MemoryRouter>
);

describe('ProjectsIndexBody in the public app', () => {
  test.each(Object.entries(LISTS))(
    'reads back the cards the publisher rendered, and prints its markup, for %s',
    (_name, projects) => {
      const prerender = renderProjectsIndexBodyHtml(projects);
      const fromDocument = parsed(prerender);
      expect(fromDocument).toEqual(projectCardViews(projects));

      const { container } = render(
        <InApp>
          <ProjectsIndexBody projects={fromDocument} />
        </InApp>,
      );
      expect(container.innerHTML).toBe(normalize(prerender));
    },
  );

  test('lists by order; each entry with a destination is one link', () => {
    render(
      <InApp>
        <ProjectsIndexBody projects={projectCardViews(SAMPLE_PROJECTS)} />
      </InApp>,
    );
    const items = within(screen.getByRole('list')).getAllByRole('listitem');
    expect(
      items.map(
        (li) => within(li).getByRole('heading', { level: 2 }).textContent,
      ),
    ).toEqual(['Posts', 'Notebook', 'Don’t Feed the Bears', '[Next project]']);

    const links = items.map((li) => within(li).queryAllByRole('link'));
    expect(links.map((l) => l.length)).toEqual([1, 1, 1, 0]);
    expect(links.flat().map((a) => a.getAttribute('href'))).toEqual([
      '/projects/posts',
      '/projects/notebook',
      '/dont-feed-the-bears',
    ]);
    // The whole card is the link: preview, stage, name, pitch and stack.
    expect(links[0]![0]!.closest('li')!.firstElementChild).toBe(links[0]![0]);
  });

  test('an idea with no page is not focusable', () => {
    const { container } = render(
      <InApp>
        <ProjectsIndexBody projects={projectCardViews(SAMPLE_PROJECTS)} />
      </InApp>,
    );
    const idea = container.querySelector('[data-slug="next-project"]')!;
    expect(
      idea.querySelectorAll('a, button, [tabindex], input, select, textarea'),
    ).toHaveLength(0);
  });

  test('stage is text, with the note after it', () => {
    render(
      <InApp>
        <ProjectsIndexBody projects={projectCardViews(SAMPLE_PROJECTS)} />
      </InApp>,
    );
    const stages = [...document.querySelectorAll('.project-stage')].map((p) => [
      p.getAttribute('data-stage'),
      p.textContent,
    ]);
    expect(stages).toEqual([
      ['live', 'Live · since 2026'],
      ['building', 'Building'],
      ['live', 'Live · for fun'],
      ['idea', 'Idea'],
    ]);
  });

  test('preview: the image, else a dashed box for ideas, else the demo mini-UI', () => {
    const { container } = render(
      <InApp>
        <ProjectsIndexBody projects={projectCardViews(SAMPLE_PROJECTS)} />
      </InApp>,
    );
    const previews = [...container.querySelectorAll('.project-preview')];
    expect(previews.map((p) => p.className)).toEqual([
      'project-preview project-preview--posts',
      'project-preview project-preview--notebook',
      'project-preview project-preview--image',
      'project-preview project-preview--idea',
    ]);
    expect(previews[2]!.querySelector('img')).toHaveAttribute('alt', '');
    expect(
      previews.filter((p) => p.getAttribute('aria-hidden') === 'true'),
    ).toHaveLength(3);
  });

  test('says so when nothing is published', () => {
    render(
      <InApp>
        <ProjectsIndexBody projects={[]} />
      </InApp>,
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Projects',
    );
    expect(screen.getByText(/The first project is on its way/)).toBeVisible();
    expect(screen.queryByRole('list')).toBeNull();
  });
});
