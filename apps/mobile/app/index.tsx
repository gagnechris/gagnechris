import { useGetApiClient } from '@gagnechris/app-core';
import { HealthResponseSchema } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { apiBaseUrl } from '../src/config';
import { createUlid } from '../src/ulid';

const HomeScreen = () => {
  const getClient = useGetApiClient();
  const [ulid] = useState(() => createUlid());

  useEffect(() => {
    console.log(`[ulid] ${ulid}`);
  }, [ulid]);

  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      const result = await getClient().GET('/api/health');
      if (result.error || !result.data) {
        throw new Error(`Health failed (${result.response.status})`);
      }
      return HealthResponseSchema.parse(result.data);
    },
    retry: false,
  });

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>gagnechris</Text>
      <Text style={styles.meta}>API: {apiBaseUrl}</Text>
      <Text style={styles.meta} testID="ulid">
        ULID: {ulid}
      </Text>
      {health.isPending ? (
        <ActivityIndicator color={tokens.primary[500]} size="large" />
      ) : health.isError ? (
        <Text style={styles.error}>{health.error.message}</Text>
      ) : (
        <Text style={styles.row}>
          Health: {health.data.status} / {health.data.service}
        </Text>
      )}
    </View>
  );
};

export default HomeScreen;

// `space`, `text`, and `radius` tokens are px numbers, so RN consumes them
// directly.
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.neutral[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.space[8],
    gap: tokens.space[3],
  },
  brand: {
    fontSize: tokens.text['2xl'],
    fontWeight: '700',
    color: tokens.primary[700],
  },
  meta: {
    fontSize: tokens.text.xs,
    color: tokens.neutral[500],
  },
  row: {
    fontSize: tokens.text.sm,
    color: tokens.neutral[800],
  },
  error: {
    color: tokens.accent.coral,
    textAlign: 'center',
    paddingHorizontal: tokens.space[4],
  },
});
