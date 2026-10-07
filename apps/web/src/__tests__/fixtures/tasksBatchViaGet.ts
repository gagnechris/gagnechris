import { openDailyViaGet } from './openDailyViaGet';

const BATCHES: Record<string, string> = {
  '/api/notebook/tasks/batch': '/api/notebook/tasks/{id}',
  '/api/notebook/notes/batch': '/api/notebook/notes/{id}',
};

type Result = { data?: unknown; error?: unknown };
type MockClient = {
  GET: (path: string, init?: never) => unknown;
  POST?: (path: string, init?: never) => unknown;
};

/** Answers the tasks and notes batch POSTs with the mock's detail GET per id. */
export const tasksBatchViaGet = <C extends MockClient>(client: C): C => ({
  ...client,
  POST: async (path: string, init?: never) => {
    const detail = BATCHES[path];
    if (!detail) return client.POST?.(path, init);
    const { ids } = (init as unknown as { body: { ids: string[] } }).body;
    const items = [];
    for (const id of ids) {
      const res = (await client.GET(detail, {
        params: { path: { id } },
      } as never)) as Result;
      const entity = res.data as { deleted?: boolean } | undefined;
      if (entity && !res.error && !entity.deleted) items.push(entity);
    }
    return { data: { items }, error: undefined, response: { status: 200 } };
  },
});

/** `openDailyViaGet` plus the batch reads, for page mocks written per GET. */
export const withNotebookRoutes = <C extends MockClient>(client: C): C =>
  tasksBatchViaGet(openDailyViaGet(client));
