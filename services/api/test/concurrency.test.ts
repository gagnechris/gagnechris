import { describe, expect, it } from 'vitest';
import {
  parseIfMatch,
  parseIfMatchVersion,
  resolveExpectedVersion,
} from '../src/data/concurrency.js';
import { makeEvent } from './support/make-event.js';

describe('If-Match parsing (CHR-162)', () => {
  it('parses strong and weak quoted versions', () => {
    expect(parseIfMatch({ 'if-match': '"3"' })).toEqual({
      kind: 'version',
      version: 3,
    });
    expect(parseIfMatch({ 'If-Match': 'W/"3"' })).toEqual({
      kind: 'version',
      version: 3,
    });
    expect(parseIfMatchVersion({ 'If-Match': 'W/"3"' })).toBe(3);
  });

  it('parses * as any-existing', () => {
    expect(parseIfMatch({ 'if-match': '*' })).toEqual({ kind: 'any' });
    expect(parseIfMatchVersion({ 'if-match': '*' })).toBeUndefined();
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
});
