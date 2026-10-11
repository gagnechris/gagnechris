import { describe, expect, it } from 'vitest';
import { projectPageView } from './project-page.js';
import {
  projectCardHref,
  projectHasPage,
  selectHomeProjects,
} from './projects.js';
import { SAMPLE_PROJECTS } from './fixtures/sample-projects.js';
import type { Project } from './schemas.js';

const base: Project = {
  id: '01A',
  slug: 'notebook',
  name: 'Notebook',
  pitch: 'Notes and tasks',
  stage: 'building',
  stageNote: 'since 2026',
  previewImage: null,
  bodyMarkdown: 'Body',
  stack: ['TypeScript', 'DynamoDB'],
  links: [{ label: 'Source', url: 'https://github.com/gagnechris' }],
  demo: null,
  order: 1,
  href: null,
  status: 'published',
  publishedAt: null,
  updatedAt: '2026-10-01T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

describe('project pages', () => {
  it('decide which projects get a page and where cards link', () => {
    expect(projectHasPage(base)).toBe(true);
    expect(projectCardHref(base)).toBe('/projects/notebook');
    const idea = { ...base, stage: 'idea' as const, bodyMarkdown: ' \n' };
    expect(projectHasPage(idea)).toBe(false);
    expect(projectCardHref(idea)).toBeNull();
    expect(projectHasPage({ ...idea, bodyMarkdown: 'Why' })).toBe(true);
    const bears = { ...base, href: '/dont-feed-the-bears' };
    expect(projectHasPage(bears)).toBe(false);
    expect(projectCardHref(bears)).toBe('/dont-feed-the-bears');
  });

  it('drops links the sanitizer would not allow', () => {
    const view = projectPageView({
      ...base,
      links: [
        { label: 'Bad', url: 'javascript:alert(1)' },
        { label: 'Good', url: '/posts' },
      ],
    });
    expect(view.links).toEqual([{ label: 'Good', url: '/posts' }]);
  });
});

describe('selectHomeProjects', () => {
  it('takes the first two non-idea projects by order', () => {
    expect(selectHomeProjects(SAMPLE_PROJECTS).map((p) => p.slug)).toEqual([
      'posts',
      'notebook',
    ]);
    expect(
      selectHomeProjects(SAMPLE_PROJECTS.filter((p) => p.stage === 'idea')),
    ).toEqual([]);
  });
});
