import { describe, expect, it } from 'vitest';
import {
  buildOpenApiDocument,
  forbiddenPrefixFor,
  PREFIX_FORBIDDEN_DESCRIPTIONS,
} from './openapi.js';

function operations() {
  const doc = buildOpenApiDocument();
  return Object.entries(doc.paths ?? {}).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([, op]) => op && typeof op === 'object' && 'responses' in op)
      .map(([method, op]) => ({
        key: `${method.toUpperCase()} ${path}`,
        path,
        responses: (
          op as { responses: Record<string, { description: string }> }
        ).responses,
      })),
  );
}

describe('OpenAPI per-prefix 403', () => {
  it.each(Object.entries(PREFIX_FORBIDDEN_DESCRIPTIONS))(
    'every %s operation documents its 403',
    (prefix, description) => {
      const ops = operations().filter(
        (op) =>
          (op.path === prefix || op.path.startsWith(`${prefix}/`)) &&
          forbiddenPrefixFor(op.path) === prefix,
      );
      expect(ops.length).toBeGreaterThan(0);
      for (const op of ops) {
        expect(op.responses['403']?.description, op.key).toBe(description);
      }
    },
  );

  it('users operations name user-admin, not site-admin', () => {
    expect(forbiddenPrefixFor('/api/admin/users')).toBe('/api/admin/users');
    expect(forbiddenPrefixFor('/api/admin/users/{id}/access')).toBe(
      '/api/admin/users',
    );
    expect(forbiddenPrefixFor('/api/admin/usersettings')).toBe('/api/admin');
    expect(forbiddenPrefixFor('/api/health')).toBeUndefined();
  });

  it('public operations document no 403', () => {
    const ops = operations().filter(
      (op) =>
        !Object.keys(PREFIX_FORBIDDEN_DESCRIPTIONS).some((prefix) =>
          op.path.startsWith(`${prefix}/`),
        ),
    );
    expect(ops.length).toBeGreaterThan(0);
    for (const op of ops) expect(op.responses['403'], op.key).toBeUndefined();
  });

  it('names each prefix’s group', () => {
    expect(PREFIX_FORBIDDEN_DESCRIPTIONS['/api/admin']).toContain(
      '`site-admin`',
    );
    expect(PREFIX_FORBIDDEN_DESCRIPTIONS['/api/admin/users']).toContain(
      '`user-admin` group',
    );
    expect(PREFIX_FORBIDDEN_DESCRIPTIONS['/api/notebook']).toContain(
      '`notebook` group',
    );
  });
});
