import { createContext, useContext, type ReactNode } from 'react';
import type { ApiClient } from '@gagnechris/api-client';

type GetApiClient = () => ApiClient;

const ApiClientContext = createContext<GetApiClient | null>(null);

export function AppApiProvider({
  getClient,
  children,
}: {
  getClient: GetApiClient;
  children: ReactNode;
}) {
  return (
    <ApiClientContext.Provider value={getClient}>
      {children}
    </ApiClientContext.Provider>
  );
}

export function useGetApiClient(): GetApiClient {
  const getClient = useContext(ApiClientContext);
  if (!getClient) {
    throw new Error('useGetApiClient requires AppApiProvider');
  }
  return getClient;
}
