import { describe, expect, it } from 'vitest';
import {
  postLivePath,
  projectLiveHref,
  POST_PART_OF_LABEL,
  postPartOfSeparator,
  postPartOfSuffix,
} from './projects.js';

const partOf = (names: string[]) =>
  `${POST_PART_OF_LABEL} ` +
  names.map((n, i) => postPartOfSeparator(i, names.length) + n).join('') +
  postPartOfSuffix(names.length);

describe('Part of wording', () => {
  it('names one project', () => {
    expect(partOf(['Posts'])).toBe('Part of the Posts project');
  });

  it('joins two projects with "and"', () => {
    expect(partOf(['Posts', 'Notebook'])).toBe(
      'Part of the Posts and Notebook projects',
    );
  });

  it('lists three or more with commas and a final "and"', () => {
    expect(partOf(['A', 'B', 'C'])).toBe('Part of the A, B and C projects');
  });
});

describe('View live', () => {
  const project = {
    slug: 'draft-slug',
    status: 'published' as const,
    stage: 'live' as const,
    bodyMarkdown: 'Body',
    href: null,
  };

  it('opens the live slug while the draft is renamed', () => {
    expect(projectLiveHref({ ...project, publishedSlug: 'live-slug' })).toBe(
      '/projects/live-slug',
    );
    expect(postLivePath({ ...project, publishedSlug: 'live-slug' })).toBe(
      '/posts/live-slug',
    );
    expect(projectLiveHref(project)).toBe('/projects/draft-slug');
    expect(postLivePath(project)).toBe('/posts/draft-slug');
  });

  it('has nowhere to go for a draft or a project with no page', () => {
    expect(projectLiveHref({ ...project, status: 'draft' })).toBeNull();
    expect(postLivePath({ ...project, status: 'draft' })).toBeNull();
    expect(
      projectLiveHref({ ...project, stage: 'idea', bodyMarkdown: '' }),
    ).toBeNull();
    expect(projectLiveHref({ ...project, href: 'https://example.com' })).toBe(
      'https://example.com',
    );
  });
});
