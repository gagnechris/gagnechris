// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appOrigin, publicSiteOrigin } from '../../scripts/webApps.ts';

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

describe('appOrigin', () => {
  it('links the admin and Notebook hosts in builds and their dev servers in dev', () => {
    expect(appOrigin('admin', undefined, 'build')).toBe(
      'https://admin.gagnechris.com',
    );
    expect(appOrigin('notebook', undefined, 'build')).toBe(
      'https://notebook.gagnechris.com',
    );
    expect(appOrigin('admin', '', 'serve')).toBe('http://localhost:5174');
    expect(appOrigin('notebook', '', 'serve')).toBe('http://localhost:5175');
    expect(appOrigin('notebook', 'http://127.0.0.1:4300', 'serve')).toBe(
      'http://127.0.0.1:4300',
    );
  });
});
