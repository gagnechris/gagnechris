import { render } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import { useGetApiClient } from '@gagnechris/app-core';
import { WorkspaceQueryProvider } from './WorkspaceQueryProvider';

const createApiClient = vi.hoisted(() => vi.fn(() => ({})));
vi.mock('../api/client', () => ({ createApiClient }));

test('every caller shares one API client, so a token refresh is shared too', () => {
  const seen: unknown[] = [];
  function Probe() {
    const getClient = useGetApiClient();
    seen.push(getClient(), getClient());
    return null;
  }
  const { rerender } = render(
    <WorkspaceQueryProvider>
      <Probe />
    </WorkspaceQueryProvider>,
  );
  rerender(
    <WorkspaceQueryProvider>
      <Probe />
    </WorkspaceQueryProvider>,
  );
  expect(createApiClient).toHaveBeenCalledTimes(1);
  expect(new Set(seen).size).toBe(1);
});
