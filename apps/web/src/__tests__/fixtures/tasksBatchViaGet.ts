import { openDailyViaGet } from './openDailyViaGet';

const BATCH = '/api/notebook/tasks/batch';
const DETAIL = '/api/notebook/tasks/{id}';

type Result = { data?: unknown; error?: unknown };
type MockClient = {
  GET: (path: string, init?: never) => unknown;
  POST?: (path: string, init?: never) => unknown;
};

/** Answers the tasks batch POST with the mock's detail GET per id. */
export const tasksBatchViaGet = <C extends MockClient>(client: C): C => ({
  ...client,
  POST: async (path: string, init?: never) => {
    if (path !== BATCH) return client.POST?.(path, init);
    const { ids } = (init as unknown as { body: { ids: string[] } }).body;
    const items = [];
    for (const id of ids) {
      const res = (await client.GET(DETAIL, {
        params: { path: { id } },
      } as never)) as Result;
      const task = res.data as { deleted?: boolean } | undefined;
      if (task && !res.error && !task.deleted) items.push(task);
    }
    return { data: { items }, error: undefined, response: { status: 200 } };
  },
});

/** `openDailyViaGet` plus the tasks batch, for page mocks written per GET. */
export const withNotebookRoutes = <C extends MockClient>(client: C): C =>
  tasksBatchViaGet(openDailyViaGet(client));
