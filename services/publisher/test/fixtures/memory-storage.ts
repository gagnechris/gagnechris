import { SITE_SHELL_KEY, type SiteStorage } from '../../src/storage.js';

export const TEST_SHELL =
  '<html><head><title>x</title></head><body><div id="root"></div></body></html>';

export type MemoryStorage = SiteStorage & {
  /** Bodies as UTF-8 text, keyed like S3. `_shell.html` is seeded. */
  objects: Map<string, string>;
  /** Keys of puts that wrote, in order. */
  puts: string[];
  /** Keys of deletes that removed something, in order. */
  deletes: string[];
  /** Every non-empty `invalidate` call. */
  invalidations: string[][];
  /** The next put waits for `until`; resolves once that put has started. */
  holdNextPut(until: Promise<void>): Promise<void>;
  /** Clears the recorded puts, deletes and invalidations. */
  resetLog(): void;
};

/** Same skip and idempotence rules as the S3 and filesystem storage. */
export function memoryStorage(
  opts: { shell?: string; seed?: Record<string, string> } = {},
): MemoryStorage {
  const objects = new Map<string, string>([
    [SITE_SHELL_KEY, opts.shell ?? TEST_SHELL],
    ...Object.entries(opts.seed ?? {}),
  ]);
  const puts: string[] = [];
  const deletes: string[] = [];
  const invalidations: string[][] = [];
  let hold: { until: Promise<void>; reached: () => void } | undefined;
  return {
    objects,
    puts,
    deletes,
    invalidations,
    holdNextPut(until) {
      return new Promise((reached) => {
        hold = { until, reached };
      });
    },
    resetLog() {
      puts.length = 0;
      deletes.length = 0;
      invalidations.length = 0;
    },
    async readShell() {
      const shell = objects.get(SITE_SHELL_KEY);
      if (!shell) throw new Error(`Site shell ${SITE_SHELL_KEY} is missing`);
      return shell;
    },
    async read(key) {
      return objects.get(key);
    },
    async put({ key, body }) {
      if (hold) {
        const { until, reached } = hold;
        hold = undefined;
        reached();
        await until;
      }
      const text =
        typeof body === 'string' ? body : Buffer.from(body).toString('utf8');
      if (objects.get(key) === text) return false;
      objects.set(key, text);
      puts.push(key);
      return true;
    },
    async delete(key) {
      if (!objects.delete(key)) return false;
      deletes.push(key);
      return true;
    },
    async list(prefix) {
      return [...objects.keys()].filter((k) => k.startsWith(prefix));
    },
    async invalidate(paths) {
      if (paths.length > 0) invalidations.push([...paths]);
    },
  };
}
