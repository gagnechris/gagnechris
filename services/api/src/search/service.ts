import {
  noteDisplayTitle,
  replaceTaskEmbeds,
  taskEmbedFallbackLine,
  type Note,
  type NotebookArea,
  type TaskStatus,
} from '@gagnechris/shared';
import { notesRepository, type NotesRepository } from '../notes/repository.js';
import { tasksRepository, type TasksRepository } from '../tasks/repository.js';
import { collectPages } from '../data/collect-pages.js';
import { rankTextFields } from './match.js';

export const SEARCHED_TYPES = ['note', 'task'] as const;

export type SearchHit = {
  type: (typeof SEARCHED_TYPES)[number];
  id: string;
  area: NotebookArea;
  title: string;
  date?: string;
  /** Task hits only, so a result can be checked off without reading the task. */
  status?: TaskStatus;
  version?: number;
  snippet: string;
  matches: { start: number; end: number }[];
};

const SCAN_PAGE = 100;
/** Per-type scan cap; a personal notebook stays well under it (see docs/data-model.md). */
const SCAN_CAP = 2000;

export async function searchNotebook(
  userId: string,
  query: { q: string; area?: NotebookArea; limit?: number },
  deps?: { notes?: NotesRepository; tasks?: TasksRepository },
): Promise<{ notes: SearchHit[]; tasks: SearchHit[] }> {
  const notesRepo = deps?.notes ?? notesRepository();
  const tasksRepo = deps?.tasks ?? tasksRepository();
  const limit = query.limit ?? 20;

  const [notes, tasks] = await Promise.all([
    collectPages(
      (cursor) =>
        notesRepo.list(userId, { area: query.area, cursor, limit: SCAN_PAGE }),
      SCAN_CAP,
      (n) => !n.deleted,
    ),
    collectPages(
      (cursor) =>
        tasksRepo.list(userId, { area: query.area, cursor, limit: SCAN_PAGE }),
      SCAN_CAP,
      (t) => !t.deleted,
    ),
  ]);

  const tasksById = new Map(tasks.map((t) => [t.id, t]));
  // Embeds match and read as the task's title, never as the raw token.
  const searchableBody = (note: Note) =>
    replaceTaskEmbeds(note.bodyMarkdown, (embed) => {
      const task = tasksById.get(embed.id);
      return task ? taskEmbedFallbackLine(embed, task) : '';
    });

  const noteHits = notes
    .map((note) => {
      const ranked = rankTextFields(query.q, {
        title: noteDisplayTitle(note),
        body: searchableBody(note),
        tags: note.tags,
      });
      if (!ranked) return undefined;
      return {
        type: 'note' as const,
        id: note.id,
        area: note.area,
        title: ranked.title,
        ...(note.type === 'daily' && note.date ? { date: note.date } : {}),
        snippet: ranked.snippet,
        matches: ranked.matches,
        score: ranked.score,
      };
    })
    .filter((h): h is NonNullable<typeof h> => Boolean(h))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...hit }) => hit);

  const taskHits = tasks
    .map((task) => {
      const ranked = rankTextFields(query.q, {
        title: task.title,
        body: task.description,
        tags: task.tags,
      });
      if (!ranked) return undefined;
      return {
        type: 'task' as const,
        id: task.id,
        area: task.area,
        title: ranked.title,
        status: task.status,
        version: task.version,
        snippet: ranked.snippet,
        matches: ranked.matches,
        score: ranked.score,
      };
    })
    .filter((h): h is NonNullable<typeof h> => Boolean(h))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ score: _s, ...hit }) => hit);

  return { notes: noteHits, tasks: taskHits };
}
