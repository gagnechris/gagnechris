import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, test } from 'vitest';

const repo = path.resolve(__dirname, '../../../..');
const webSrc = path.join(repo, 'apps/web/src');
const mobileRoot = path.join(repo, 'apps/mobile');

/** What iOS must compute exactly as web does. */
const VIEW_LOGIC = [
  'bucketTodayTasks',
  'stillOpenSource',
  'sourceNoteName',
  'comingUpDayLabel',
  'comingUpShortLabel',
  'comingUpWindow',
  'snoozeBaseDay',
  'groupUpcomingTasks',
  'noteChipLabel',
  'taskScheduleLabel',
  'taskDue',
  'noteSections',
  'noteDay',
  'noteDayLabel',
  'noteFirstLine',
  'noteOpenTaskCount',
  'taskDateMenuItems',
  'openTaskDateQuery',
  'taskDateMenuReducer',
  'taskDateMenuKey',
  'taskDateMenuIsOpen',
  'tokenInsertion',
  'newestById',
  'byNewest',
] as const;

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'node_modules' || entry.name === 'dist') return [];
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });

/** Every `{ name }` a file imports, with the specifier it comes from. */
const namedImports = (code: string): [string, string][] =>
  [
    ...code.matchAll(/import\s*(?:type\s*)?\{([^}]*)\}\s*from\s*'([^']+)'/g),
  ].flatMap((m) =>
    m[1]!
      .split(',')
      .map(
        (n) =>
          n
            .trim()
            .replace(/^type\s+/, '')
            .split(/\s+as\s+/)[0]!,
      )
      .filter(Boolean)
      .map((name): [string, string] => [name, m[2]!]),
  );

const importOf = (file: string, name: string) =>
  namedImports(readFileSync(path.join(webSrc, file), 'utf8')).find(
    ([n]) => n === name,
  )?.[1];

describe('Notebook view logic', () => {
  test('the Notebook app and the demo import it from @gagnechris/shared', () => {
    const uses: [string, string][] = [
      ['notebook/useTodayTasks.ts', 'bucketTodayTasks'],
      ['notebook/useTodayTasks.ts', 'stillOpenSource'],
      ['demos/notebook/notebookDemoState.ts', 'bucketTodayTasks'],
      ['demos/notebook/notebookDemoState.ts', 'stillOpenSource'],
      ['kit/tasks/TodayPanels.tsx', 'comingUpShortLabel'],
      ['kit/tasks/TodaySheet.tsx', 'comingUpDayLabel'],
      ['notebook/NotebookUpcomingPage.tsx', 'groupUpcomingTasks'],
      ['notebook/useNoteTaskEmbeds.tsx', 'taskScheduleLabel'],
      ['demos/notebook/index.tsx', 'taskScheduleLabel'],
      ['notebook/useTodayTasks.ts', 'taskDue'],
      ['demos/notebook/index.tsx', 'taskDue'],
      ['notebook/NotebookNotesPage.tsx', 'noteSections'],
      ['notebook/NotebookNotesPage.tsx', 'noteOpenTaskCount'],
      ['kit/tasks/TaskSyntaxInput.tsx', 'taskDateMenuReducer'],
      ['kit/markdown/taskDateMenuEditor.tsx', 'taskDateMenuReducer'],
      ['kit/markdown/taskDateMenuEditor.tsx', 'tokenInsertion'],
      ['kit/tasks/SnoozeMenu.tsx', 'taskDateMenuItems'],
    ];
    for (const [file, name] of uses) {
      expect({ file, name, from: importOf(file, name) }).toEqual({
        file,
        name,
        from: '@gagnechris/shared',
      });
    }
  });

  test('web and mobile have no local copy, and import it only from @gagnechris/shared', () => {
    const files = [...sourceFiles(webSrc), ...sourceFiles(mobileRoot)];
    const offenders: string[] = [];
    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      const where = path.relative(repo, file);
      for (const name of VIEW_LOGIC) {
        if (
          new RegExp(String.raw`\b(?:function|const)\s+${name}\b`).test(code)
        ) {
          offenders.push(`${where} defines ${name}`);
        }
      }
      for (const [name, from] of namedImports(code)) {
        if (
          (VIEW_LOGIC as readonly string[]).includes(name) &&
          from !== '@gagnechris/shared'
        ) {
          offenders.push(`${where} imports ${name} from ${from}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  test('mobile resolves @gagnechris/shared to the same package web uses', () => {
    const mobile = JSON.parse(
      readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'),
    ) as { dependencies: Record<string, string> };
    expect(
      path.resolve(
        mobileRoot,
        mobile.dependencies['@gagnechris/shared']!.replace(/^file:/, ''),
      ),
    ).toBe(path.join(repo, 'packages/shared'));
  });
});
