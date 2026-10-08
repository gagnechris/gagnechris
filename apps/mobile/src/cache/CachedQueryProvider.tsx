import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  IsRestoringProvider,
  QueryClientProvider,
} from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { createAppQueryClient } from './policy';
import { startCacheSession } from './session';

type Props = {
  /** Cognito `sub` of the signed-in user; null reads and writes nothing. */
  sub: string | null;
  children: ReactNode;
};

const CacheSessionProvider = ({ sub, children }: Props) => {
  const [queryClient] = useState(createAppQueryClient);
  const [isRestoring, setIsRestoring] = useState(sub !== null);

  useEffect(() => {
    if (sub === null) return;
    const session = startCacheSession(queryClient, sub, AsyncStorage);
    let mounted = true;
    void session.restored.finally(() => {
      if (mounted) setIsRestoring(false);
    });
    return () => {
      mounted = false;
      void session.stop();
    };
  }, [queryClient, sub]);

  return (
    <QueryClientProvider client={queryClient}>
      <IsRestoringProvider value={isRestoring}>{children}</IsRestoringProvider>
    </QueryClientProvider>
  );
};

/** Each user gets a fresh query client, so no other user's data stays in memory. */
export const CachedQueryProvider = (props: Props) => (
  <CacheSessionProvider key={props.sub ?? ''} {...props} />
);
