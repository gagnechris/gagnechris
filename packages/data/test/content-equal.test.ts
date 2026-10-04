import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import {
  homeContentEqual,
  postContentEqual,
  resumeContentEqual,
} from '../src/items.js';

describe('contentEqual deep equality', () => {
  it('postContentEqual ignores seo map key order', () => {
    expect(
      postContentEqual(
        {
          slug: 'a',
          title: 't',
          excerpt: '',
          bodyMarkdown: 'b',
          tags: ['x', 'y'],
          coverImage: null,
          seo: { title: 'S', description: 'D' },
        },
        {
          slug: 'a',
          title: 't',
          excerpt: '',
          bodyMarkdown: 'b',
          tags: ['x', 'y'],
          coverImage: null,
          seo: { description: 'D', title: 'S' },
        },
      ),
    ).toBe(true);
  });

  it('homeContentEqual ignores seo map key order', () => {
    expect(
      homeContentEqual(
        { name: 'n', title: 't', about: 'a', seo: { title: 'S' } },
        { name: 'n', title: 't', about: 'a', seo: { title: 'S' } },
      ),
    ).toBe(true);
  });

  it('resumeContentEqual ignores nested content key order', () => {
    const content = DEFAULT_RESUME.content;
    const reordered = {
      skills: content.skills,
      education: content.education,
      experience: content.experience,
      summary: content.summary,
      competencies: content.competencies,
      earlierRolesThrough: content.earlierRolesThrough,
      headline: content.headline,
    };
    expect(
      resumeContentEqual(
        {
          name: 'n',
          pdfPath: '/r.pdf',
          content,
          seo: { description: 'd', title: 't' },
        },
        {
          name: 'n',
          pdfPath: '/r.pdf',
          content: reordered,
          seo: { title: 't', description: 'd' },
        },
      ),
    ).toBe(true);
  });
});
