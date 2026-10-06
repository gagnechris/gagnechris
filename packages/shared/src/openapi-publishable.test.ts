import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './openapi.js';

const doc = buildOpenApiDocument();
const summary = (path: string, method: 'get' | 'post' | 'put' | 'delete') =>
  (doc.paths?.[path]?.[method] as { summary?: string } | undefined)?.summary;

describe('publishable OpenAPI paths', () => {
  it('says resume unpublish replaces the page and deletes the PDF', () => {
    expect(summary('/api/admin/resume/unpublish', 'post')).toBe(
      'Unpublish resume (the page says "Resume available on request" and resume.pdf is deleted)',
    );
  });

  it.each([
    ['/api/admin/posts/{id}', true],
    ['/api/admin/projects/{id}', true],
    ['/api/admin/home', false],
    ['/api/admin/resume', false],
  ])(
    '%s has get, update, publish, unpublish and discard',
    (path, collection) => {
      expect(summary(path, 'get')).toBeDefined();
      expect(summary(path, 'put')).toBeDefined();
      for (const action of ['publish', 'unpublish', 'discard']) {
        expect(summary(`${path}/${action}`, 'post'), action).toBeDefined();
      }
      expect(summary(path, 'delete') !== undefined).toBe(collection);
    },
  );
});
