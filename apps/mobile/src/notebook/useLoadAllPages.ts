import { useEffect } from 'react';

/** Keeps fetching until the cursor runs out; list pages aren't date-ordered. */
export function useLoadAllPages(query: {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  isError: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && !isError) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, isError, fetchNextPage]);
}
