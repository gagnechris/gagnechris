import { describe, expect, it } from 'vitest';
import {
  parseIfMatch,
  resolveExpectedVersion,
} from '../src/data/concurrency.js';
import { InvalidHeaderError } from '../src/data/errors.js';
import { readExpectedVersion } from '../src/data/versioned-route.js';
import { makeEvent } from './support/make-event.js';

describe('If-Match parsing', () => {
  it('parses strong and weak quoted versions', () => {
    expect(parseIfMatch({ 'if-match': '"3"' })).toEqual({
      kind: 'version',
      version: 3,
    });
    expect(parseIfMatch({ 'If-Match': 'W/"3"' })).toEqual({
      kind: 'version',
      version: 3,
    });
  });

  it('parses * as any-existing', () => {
    expect(parseIfMatch({ 'if-match': '*' })).toEqual({ kind: 'any' });
  });

  it('rejects malformed If-Match with a 400 error', () => {
    expect(() => parseIfMatch({ 'If-Match': 'abc' })).toThrow(
      InvalidHeaderError,
    );
    expect(() => parseIfMatch({ 'If-Match': '"3", "4"' })).toThrow(
      InvalidHeaderError,
    );
    expect(() => parseIfMatch({ 'If-Match': 'W/"x"' })).toThrow(
      InvalidHeaderError,
    );
  });

  it('prefers If-Match over body version', () => {
    const event = makeEvent('PUT', '/x', {
      headers: { 'If-Match': 'W/"2"' },
      jwtClaims: { sub: 'u' },
    });
    expect(resolveExpectedVersion(event, { version: 9 })).toEqual({
      expected: 2,
      fromIfMatch: true,
    });
    const star = makeEvent('PUT', '/x', {
      headers: { 'If-Match': '*' },
      jwtClaims: { sub: 'u' },
    });
    expect(resolveExpectedVersion(star, {})).toEqual({
      expected: 'any',
      fromIfMatch: true,
    });
  });

  it('readExpectedVersion maps malformed If-Match to 400', () => {
    const event = makeEvent('PUT', '/x', {
      headers: { 'If-Match': 'abc' },
      jwtClaims: { sub: 'u' },
    });
    const resolved = readExpectedVersion(event, {});
    expect(resolved.ok).toBe(false);
    if (resolved.ok) return;
    expect(resolved.response.statusCode).toBe(400);
    expect(JSON.parse(resolved.response.body as string)).toMatchObject({
      error: 'bad_request',
      message: 'Invalid If-Match header',
    });
  });
});
