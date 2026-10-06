import { describe, expect, it } from 'vitest';
import { postMatchesQuery } from './post-search.js';

const post = { title: 'Shipping CDK', slug: 'shipping-cdk', tags: ['AWS'] };

describe('postMatchesQuery', () => {
  it.each([
    ['ship', true],
    ['  CDK ', true],
    ['shipping-c', true],
    ['aws', true],
    ['terraform', false],
    ['', true],
    ['   ', true],
  ])('%j -> %s', (q, expected) => {
    expect(postMatchesQuery(post, q)).toBe(expected);
  });
});
