import { expect, vi } from 'vitest';
import { DEFAULT_RESUME, type Resume } from '@gagnechris/shared';
import { createResumeRoutes } from '../src/resume/handlers.js';
import { definePublishableHandlerTests } from './support/publishable-handler.suite.js';

const sampleResume: Resume = {
  ...DEFAULT_RESUME,
  status: 'published',
  publishedAt: '2026-09-27T01:00:00.000Z',
  updatedAt: '2026-09-27T01:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

definePublishableHandlerTests({
  label: 'resume',
  foreignMethod: 'GET',
  foreignPath: '/api/admin/posts',
  basePath: '/api/admin/resume',
  sample: sampleResume,
  updateBody: {
    version: 1,
    hasUnpublishedChanges: false,
    name: 'Chris Gagne',
    content: sampleResume.content,
  },
  assertGetBody: (body) => {
    expect(body.name).toBe('Chris Gagne');
  },
  assertUpdateInput: (input) => {
    expect(input.version).toBe(1);
  },
  createRoutes: (repo) => createResumeRoutes(repo as never),
  createRepo: () => ({
    get: vi.fn(),
    getOrCreate: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    discard: vi.fn(),
  }),
});
