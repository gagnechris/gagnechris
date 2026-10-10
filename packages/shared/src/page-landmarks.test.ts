import { describe, expect, it } from 'vitest';
import { DEFAULT_RESUME } from './resume-default.js';
import {
  renderResumeBodyHtml,
  renderResumeUnavailableBodyHtml,
} from './resume-html.js';

const BODIES: [string, string][] = [
  ['resume', renderResumeBodyHtml(DEFAULT_RESUME)],
  ['resume unavailable', renderResumeUnavailableBodyHtml()],
];

describe('every page body is one <main> that holds its <h1>', () => {
  it.each(BODIES)('%s', (_page, html) => {
    const count = (tag: string) => html.split(tag).length - 1;
    expect(html).toMatch(/^<main[ >]/);
    expect(html).toMatch(/<\/main>$/);
    expect(count('<main')).toBe(1);
    expect(count('<h1')).toBe(1);
    expect(html).not.toContain('<aside');
  });
});
