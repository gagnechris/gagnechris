// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { publicSiteOrigin } from '../../scripts/webApps.ts';

describe('publicSiteOrigin', () => {
  it('builds link to gagnechris.com and dev servers to the public dev server', () => {
    expect(publicSiteOrigin(undefined, 'build')).toBe('https://gagnechris.com');
    expect(publicSiteOrigin(' ', 'serve')).toBe('http://localhost:5173');
  });

  it('takes VITE_PUBLIC_SITE_ORIGIN when set', () => {
    expect(publicSiteOrigin('http://127.0.0.1:4177', 'build')).toBe(
      'http://127.0.0.1:4177',
    );
  });

  it('rejects anything that is not a bare origin', () => {
    expect(() => publicSiteOrigin('gagnechris.com', 'build')).toThrow(
      /must be an origin/,
    );
    expect(() => publicSiteOrigin('https://gagnechris.com/', 'build')).toThrow(
      /must be an origin/,
    );
  });
});
