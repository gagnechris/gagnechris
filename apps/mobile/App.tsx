import { HealthResponseSchema } from '@gagnechris/shared';
import { tokens } from '@gagnechris/tokens';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { createAuthedClient, createPublicClient } from './src/api';
import { apiBaseUrl } from './src/config';

type SpikeStatus = {
  health: string;
  home: string;
};

const space = {
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
} as const;

export default function App() {
  const [status, setStatus] = useState<SpikeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const runSpike = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const publicClient = createPublicClient();
      const healthResult = await publicClient.GET('/api/health');
      if (healthResult.error || !healthResult.data) {
        throw new Error(`Health failed (${healthResult.response.status})`);
      }
      const health = HealthResponseSchema.parse(healthResult.data);

      const authed = createAuthedClient();
      const homeResult = await authed.GET('/api/admin/home');
      const homeLabel =
        homeResult.error || !homeResult.data
          ? `home error (${homeResult.response.status})`
          : `home ok v${homeResult.data.version} (${homeResult.data.status})`;

      setStatus({
        health: `${health.status} / ${health.service}`,
        home: homeLabel,
      });
    } catch (err) {
      setStatus(null);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.brand}>gagnechris</Text>
      <Text style={styles.subtitle}>Mobile spike (CHR-142)</Text>
      <Text style={styles.meta}>API: {apiBaseUrl}</Text>

      {loading ? (
        <ActivityIndicator color={tokens.primary[500]} size="large" />
      ) : null}

      {status ? (
        <View style={styles.card}>
          <Text style={styles.row}>Health: {status.health}</Text>
          <Text style={styles.row}>Admin: {status.home}</Text>
        </View>
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        accessibilityRole="button"
        onPress={() => void runSpike()}
        style={({ pressed }) => [
          styles.button,
          pressed ? styles.buttonPressed : null,
        ]}
      >
        <Text style={styles.buttonLabel}>
          {status || error ? 'Retry' : 'Run spike'}
        </Text>
      </Pressable>

      <StatusBar style="dark" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: tokens.neutral[50],
    alignItems: 'center',
    justifyContent: 'center',
    padding: space[8],
    gap: space[3],
  },
  brand: {
    fontSize: 28,
    fontWeight: '700',
    color: tokens.primary[700],
  },
  subtitle: {
    fontSize: 16,
    color: tokens.neutral[600],
  },
  meta: {
    fontSize: 12,
    color: tokens.neutral[500],
    marginBottom: space[4],
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: space[4],
    gap: space[2],
    borderLeftWidth: 4,
    borderLeftColor: tokens.primary[400],
  },
  row: {
    fontSize: 15,
    color: tokens.neutral[800],
  },
  error: {
    color: tokens.accent.coral,
    textAlign: 'center',
    paddingHorizontal: space[4],
  },
  button: {
    marginTop: space[4],
    backgroundColor: tokens.primary[500],
    paddingVertical: space[3],
    paddingHorizontal: space[6],
    borderRadius: 8,
  },
  buttonPressed: {
    backgroundColor: tokens.primary[600],
  },
  buttonLabel: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 16,
  },
});
