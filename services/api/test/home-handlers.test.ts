import { expect, vi } from 'vitest';
import { DEFAULT_HOME, type Home } from '@gagnechris/shared';
import { createHomeRoutes } from '../src/home/handlers.js';
import { definePublishableHandlerTests } from './support/publishable-handler.suite.js';

const sampleHome: Home = {
  ...DEFAULT_HOME,
  status: 'published',
  publishedAt: '2026-09-27T01:00:00.000Z',
  updatedAt: '2026-09-27T01:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

definePublishableHandlerTests({
  label: 'home',
  foreignMethod: 'GET',
  foreignPath: '/api/admin/resume',
  basePath: '/api/admin/home',
  sample: sampleHome,
  updateBody: {
    version: 1,
    hasUnpublishedChanges: false,
    name: 'Chris Gagne',
    about: 'New about copy.',
  },
  assertGetBody: (body) => {
    expect(body.name).toBe('Chris Gagne');
    expect(body.title).toBe('Engineering Leader');
  },
  assertUpdateInput: (input) => {
    expect(input.about).toBe('New about copy.');
  },
  createRoutes: (repo) => createHomeRoutes(repo as never),
  createRepo: () => ({
    get: vi.fn(),
    getOrCreate: vi.fn(),
    update: vi.fn(),
    publish: vi.fn(),
    unpublish: vi.fn(),
    discard: vi.fn(),
  }),
});
