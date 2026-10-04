import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from './openapi.js';
import { ULID_PATTERN, UlidSchema } from './schemas.js';

describe('UlidSchema OpenAPI pattern', () => {
  it('ULID_PATTERN is valid ECMA-262 without a trailing /i flag', () => {
    expect(ULID_PATTERN).toBe('^[0-7][0-9A-HJKMNP-TV-Z]{25}$');
    expect(ULID_PATTERN.endsWith('/i')).toBe(false);
    expect(ULID_PATTERN.includes('/i')).toBe(false);
    expect(() => new RegExp(ULID_PATTERN)).not.toThrow();
  });

  it('accepts lowercase input after uppercase normalization', () => {
    const id = '01arZ3ndektsV4rrffq48jmczc';
    expect(UlidSchema.parse(id)).toBe(id.toUpperCase());
  });

  it('emits the uppercase pattern on post id params in the generated spec', () => {
    const doc = buildOpenApiDocument();
    const getPost = doc.paths?.['/api/admin/posts/{id}']?.get;
    const idParam = getPost?.parameters?.find(
      (p) => 'name' in p && p.name === 'id' && p.in === 'path',
    );
    expect(idParam).toBeDefined();
    if (!idParam || !('schema' in idParam)) {
      throw new Error('expected path parameter schema');
    }
    const schema = idParam.schema as { pattern?: string; type?: string };
    expect(schema.pattern).toBe(ULID_PATTERN);
    expect(schema.pattern?.endsWith('/i')).toBe(false);

    const json = JSON.stringify(doc);
    const patterns = [...json.matchAll(/"pattern"\s*:\s*"([^"]*)"/g)].map(
      (m) => m[1]!,
    );
    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      expect(pattern.endsWith('/i'), `leaked /i in pattern: ${pattern}`).toBe(
        false,
      );
      expect(() => new RegExp(pattern)).not.toThrow();
    }
  });

  it('412 responses use PreconditionFailed schema with current', () => {
    const doc = buildOpenApiDocument();
    const putNote = doc.paths?.['/api/notebook/notes/{id}']?.put;
    expect(putNote?.responses?.['412']).toBeDefined();
    expect(
      putNote?.parameters?.some((p) => 'name' in p && p.name === 'if-match'),
    ).toBe(true);
    expect(putNote?.responses?.['200']?.headers?.ETag).toBeDefined();

    const putPost = doc.paths?.['/api/admin/posts/{id}']?.put;
    expect(putPost?.responses?.['412']).toBeUndefined();
    expect(
      putPost?.parameters?.some((p) => 'name' in p && p.name === 'if-match'),
    ).toBe(false);
    expect(putPost?.responses?.['200']?.headers?.ETag).toBeUndefined();

    const syncGet = doc.paths?.['/api/notebook/sync/changes']?.get;
    expect(syncGet?.responses?.['412']).toBeUndefined();

    const schemas = doc.components?.schemas ?? {};
    const precondition = schemas.PreconditionFailedErrorResponse as
      { properties?: { current?: unknown; error?: unknown } } | undefined;
    expect(precondition?.properties?.current).toBeDefined();
  });
});
