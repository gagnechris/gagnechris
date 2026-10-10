import { expect } from 'vitest';
import {
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { keys, taskDueGsi1Sk } from '@gagnechris/data';
import { makeEvent } from './make-event.js';
import { corpusNote, corpusTask, dayFromIndex } from './paging-cases.js';
import { dispatchRoutes, type RouteDef } from '../../src/router.js';
import { NotesRepository } from '../../src/notes/repository.js';
import { createNoteRoutes } from '../../src/notes/handlers.js';
import { TasksRepository } from '../../src/tasks/repository.js';
import { createTaskRoutes } from '../../src/tasks/handlers.js';

export {
  AREAS,
  CORPUS_TODAY,
  PRIORITIES,
  SCHEDULE_QUERIES,
  STATUSES,
  corpusNote,
  corpusTask,
  expectExactIds,
  testUlid,
} from './paging-cases.js';

export const PAGING_USER = 'user-paging-1';

export async function seedPagingCorpus(
  doc: DynamoDBDocumentClient,
  table: string,
  counts = { notes: 150, tasks: 150 },
) {
  const notes = new NotesRepository(
    doc,
    table,
    () => '2026-10-02T12:00:00.000Z',
  );
  const tasks = new TasksRepository(
    doc,
    table,
    () => '2026-10-02T12:00:00.000Z',
  );
  for (let i = 0; i < counts.notes; i += 1) {
    const n = corpusNote(i);
    const daily = n.type === 'daily';
    await notes.createFromRequest(PAGING_USER, {
      id: n.id,
      area: n.area,
      type: n.type,
      ...(daily ? { date: dayFromIndex(i) } : {}),
      title: `note ${i}`,
      bodyMarkdown: '',
      tags: [],
      pinned: false,
    });
  }
  for (let i = 0; i < counts.tasks; i += 1) {
    const t = corpusTask(i);
    await tasks.createFromRequest(PAGING_USER, {
      id: t.id,
      area: t.area,
      title: `task ${i}`,
      description: '',
      priority: t.priority,
      status: t.status,
      dueDate:
        i % 4 === 0 ? null : `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`,
      startDate: t.startDate,
      someday: t.someday,
      tags: [],
    });
  }
  return {
    routes: [...createNoteRoutes(notes), ...createTaskRoutes(tasks)],
    notes,
    tasks,
  };
}

export async function walkRoute(
  routes: RouteDef[],
  path: string,
  query: Record<string, string>,
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | undefined;
  for (let guard = 0; guard < 500; guard += 1) {
    const res = await dispatchRoutes(
      routes,
      makeEvent('GET', path, {
        query: { ...query, ...(cursor ? { cursor } : {}) },
        jwtClaims: { sub: PAGING_USER },
      }),
      'GET',
      path,
    );
    expect(res?.statusCode).toBe(200);
    const body = JSON.parse(res!.body as string) as {
      items: Array<Record<string, unknown>>;
      nextCursor?: string;
    };
    expect(body.items.length).toBeLessThanOrEqual(Number(query.limit));
    all.push(...body.items);
    cursor = body.nextCursor;
    if (!cursor) return all;
  }
  throw new Error('paging did not terminate');
}

/** Rewrites a task row to the shape stored before startDate existed. */
export async function storeAsLegacyTask(
  doc: DynamoDBDocumentClient,
  table: string,
  userId: string,
  id: string,
  startDate: string | null,
): Promise<void> {
  await doc.send(
    new UpdateCommand({
      TableName: table,
      Key: keys.notebook.task.meta(userId, id),
      UpdateExpression: startDate
        ? 'SET dueDate = :due, gsi1sk = :sk REMOVE startDate, someday'
        : 'SET dueDate = :due REMOVE startDate, someday',
      ExpressionAttributeValues: {
        ':due': startDate,
        ...(startDate ? { ':sk': taskDueGsi1Sk(startDate, id) } : {}),
      },
    }),
  );
}
