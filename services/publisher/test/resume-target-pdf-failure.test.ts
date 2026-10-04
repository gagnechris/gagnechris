import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_RESUME } from '@gagnechris/shared';
import type { SiteStorage } from '../src/storage.js';

const buildResumePdfArtifact = vi.fn();

vi.mock('../src/resume-pdf.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/resume-pdf.js')>();
  return {
    ...actual,
    buildResumePdfArtifact: (...args: unknown[]) =>
      buildResumePdfArtifact(...args),
  };
});

const publishedResume = {
  ...DEFAULT_RESUME,
  pdfPath: '/resume.pdf',
  status: 'published' as const,
  publishedAt: '2026-09-27T00:00:00.000Z',
  version: 1,
  hasUnpublishedChanges: false,
};

function memoryStorage(): SiteStorage & { puts: string[] } {
  const objects = new Map<string, string | Uint8Array>();
  const puts: string[] = [];
  return {
    puts,
    async readShell() {
      return '<html><head></head><body><div id="root"></div></body></html>';
    },
    async read(key) {
      const v = objects.get(key);
      return typeof v === 'string' ? v : undefined;
    },
    async put(key, body) {
      objects.set(key, body);
      puts.push(key);
      return true;
    },
    async delete(key) {
      if (!objects.has(key)) return false;
      objects.delete(key);
      return true;
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate() {},
  };
}

describe('resume target PDF failure', () => {
  beforeEach(() => {
    buildResumePdfArtifact.mockReset();
    buildResumePdfArtifact.mockResolvedValue({ ok: false });
  });

  it('sets resumePdfFailed and omits resume.pdf when PDF generation fails', async () => {
    const { runPublishTargets } =
      await import('../src/publish-targets/orchestrator.js');
    const { default: resumeTarget } =
      await import('../src/publish-targets/targets/resume.target.js');

    const storage = memoryStorage();
    const result = await runPublishTargets({
      targets: [resumeTarget],
      scope: {
        allPosts: false,
        postSlugs: new Set(),
        slugsToRemove: new Set(),
        feeds: false,
        home: false,
        resume: true,
        projectIds: new Set(),
        touchedEntityTypes: new Set(['resume']),
      },
      storage,
      sources: {
        listPublishedPosts: async () => ({ posts: [], corruptSlugs: [] }),
        listPublishedProjects: async () => ({ projects: [], corruptSlugs: [] }),
        getPublishedResume: async () => ({
          status: 'ok' as const,
          entity: publishedResume,
        }),
        getPublishedHome: async () => ({ status: 'missing' as const }),
      },
    });

    expect(buildResumePdfArtifact).toHaveBeenCalled();
    expect(result.resumePdfFailed).toBe(true);
    expect(result.resumePublished).toBe(true);
    expect(storage.puts).toContain('resume/index.html');
    expect(storage.puts).not.toContain('resume.pdf');
    expect(result.invalidated).toEqual(['/resume*']);
  });
});
