const OPEN = '/api/notebook/notes/daily/{area}/{date}/open';
const DAILY = '/api/notebook/notes/daily/{area}/{date}';

type MockClient = {
  GET: (path: string, init?: never) => unknown;
  POST?: (path: string, init?: never) => unknown;
};

/** Answers the open-daily POST with the mock's daily GET, for mocks that carry nothing in. */
export const openDailyViaGet = <C extends MockClient>(client: C): C => ({
  ...client,
  POST: (path: string, init?: never) =>
    path === OPEN ? client.GET(DAILY, init) : client.POST?.(path, init),
});
