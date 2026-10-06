import { gzipSync } from 'node:zlib';
import type { Plugin } from 'vite';

/** Never in a web build: `@uiw/react-codemirror`'s basic setup and the server sanitizer. */
export const BANNED_MODULES: readonly RegExp[] = [
  /\/node_modules\/@uiw\//,
  /\/node_modules\/@codemirror\/(?:autocomplete|search|lint|theme-one-dark)\//,
  /\/node_modules\/(?:sanitize-html|postcss|htmlparser2)\//,
];

/** Only Preview needs these; opening an editor must not download them. */
export const PREVIEW_ONLY_MODULES: readonly RegExp[] = [
  /\/node_modules\/(?:marked|dompurify)\//,
];

export type EditorBudget = {
  /** Always loaded before an editor (entry and layout), relative to apps/web. */
  shell: readonly string[];
  /** Editor route modules, relative to apps/web. */
  routes: readonly string[];
  maxGzipBytes: number;
};

export const ADMIN_EDITOR_BUDGET: EditorBudget = {
  shell: ['src/admin/AdminLayout.tsx'],
  routes: ['src/admin/PostEditorPage.tsx', 'src/admin/ProjectEditorPage.tsx'],
  maxGzipBytes: 120 * 1024,
};

export type BundleChunk = {
  fileName: string;
  isEntry: boolean;
  facadeModuleId: string | null;
  imports: readonly string[];
  moduleIds: readonly string[];
  gzipBytes: number;
};

const normalize = (id: string) => id.replace(/\\/g, '/').replace(/^\0/, '');

const packageOf = (id: string) => {
  const parts = id.slice(id.lastIndexOf('/node_modules/') + 14).split('/');
  return parts[0]!.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]!;
};

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;

/** Every problem with the chunks an editor open downloads; empty means within budget. */
export function editorBundleProblems(
  chunks: readonly BundleChunk[],
  budget: EditorBudget | null,
): string[] {
  const problems: string[] = [];
  const byFile = new Map(chunks.map((c) => [c.fileName, c]));
  for (const chunk of chunks) {
    const banned = new Set(
      chunk.moduleIds
        .map(normalize)
        .filter((id) => BANNED_MODULES.some((re) => re.test(id)))
        .map(packageOf),
    );
    for (const name of banned) problems.push(`${name} is in ${chunk.fileName}`);
  }
  if (!budget) return problems;

  const facade = (src: string) => {
    const chunk = chunks.find((c) =>
      c.facadeModuleId
        ? normalize(c.facadeModuleId).endsWith(`/${src}`)
        : false,
    );
    if (!chunk) problems.push(`no chunk for ${src}`);
    return chunk;
  };
  const closure = (start: BundleChunk[]) => {
    const seen = new Set<string>();
    const queue = start.map((c) => c.fileName);
    while (queue.length) {
      const file = queue.pop()!;
      if (seen.has(file)) continue;
      seen.add(file);
      queue.push(...(byFile.get(file)?.imports ?? []));
    }
    return seen;
  };
  const shell = closure([
    ...chunks.filter((c) => c.isEntry),
    ...budget.shell.flatMap((src) => facade(src) ?? []),
  ]);

  for (const route of budget.routes) {
    const chunk = facade(route);
    if (!chunk) continue;
    const opened = [...closure([chunk])]
      .filter((file) => !shell.has(file))
      .map((file) => byFile.get(file)!)
      .sort((a, b) => b.gzipBytes - a.gzipBytes);
    const total = opened.reduce((sum, c) => sum + c.gzipBytes, 0);
    if (total > budget.maxGzipBytes) {
      problems.push(
        `opening ${route} downloads ${kb(total)} gzipped (budget ${kb(budget.maxGzipBytes)}): ${opened
          .map((c) => `${c.fileName} ${kb(c.gzipBytes)}`)
          .join(', ')}`,
      );
    }
    for (const c of opened) {
      const previewOnly = new Set(
        c.moduleIds
          .map(normalize)
          .filter((id) => PREVIEW_ONLY_MODULES.some((re) => re.test(id)))
          .map(packageOf),
      );
      for (const name of previewOnly) {
        problems.push(`opening ${route} downloads ${name} (in ${c.fileName})`);
      }
    }
  }
  return problems;
}

/** Fails the build on a banned module or an editor open over `budget`. */
export function editorBundlePlugin(budget: EditorBudget | null): Plugin {
  return {
    name: 'editor-bundle',
    apply: 'build',
    api: { budget },
    generateBundle(_options, bundle) {
      const chunks: BundleChunk[] = [];
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        chunks.push({
          fileName: output.fileName,
          isEntry: output.isEntry,
          facadeModuleId: output.facadeModuleId,
          imports: output.imports,
          moduleIds: output.moduleIds,
          gzipBytes: gzipSync(output.code).length,
        });
      }
      const problems = editorBundleProblems(chunks, budget);
      if (problems.length > 0) {
        this.error(`Editor bundle check failed:\n  ${problems.join('\n  ')}`);
      }
    },
  };
}
