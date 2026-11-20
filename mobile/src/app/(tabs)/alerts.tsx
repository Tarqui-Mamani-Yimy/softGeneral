import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { useAlertStream } from '../../alerts/useAlertStream';
import { ApiError } from '../../api/client';
import type { Alert } from '../../api/types';
import { AlertCard } from '../../components/AlertCard';
import { notifyAlert } from '../../notifications';
import { useSession } from '../../session/SessionProvider';
import { colors } from '../../theme';

type Filter = 'pending' | 'confirmed' | 'false_alarm' | 'all';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'pending', label: 'Pendientes' },
  { value: 'confirmed', label: 'Confirmadas' },
  { value: 'false_alarm', label: 'Falsas' },
  { value: 'all', label: 'Todas' },
];

const STREAM_LABELS = {
  connected: { text: 'En vivo', color: colors.success },
  reconnecting: { text: 'Reconectando…', color: colors.warning },
  disconnected: { text: 'Sin conexión en vivo', color: colors.textMuted },
};

export default function AlertsScreen() {
  const { api } = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<Filter>('pending');
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const query = filter === 'all' ? '' : `&status=${filter}`;
      setAlerts(await api.request<Alert[]>(`/alerts?limit=50${query}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las alertas.');
    } finally {
      setLoading(false);
    }
  }, [api, filter]);

  // Reload when the tab regains focus (e.g. after reviewing an alert).
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const streamStatus = useAlertStream((alert) => {
    void notifyAlert(alert);
    if (filter === 'all' || filter === alert.status) {
      setAlerts((prev) => [alert, ...prev.filter((a) => a.id !== alert.id)]);
    }
  });
  const stream = STREAM_LABELS[streamStatus];

  return (
    <View style={styles.container}>
      <View style={styles.streamRow}>
        <View style={[styles.dot, { backgroundColor: stream.color }]} />
        <Text style={[styles.streamText, { color: stream.color }]}>{stream.text}</Text>
      </View>

      <View style={styles.filters}>
        {FILTERS.map((f) => (
          <Pressable
            key={f.value}
            onPress={() => setFilter(f.value)}
            style={[styles.chip, filter === f.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f.value && styles.chipTextActive]}>
              {f.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      <FlatList
        data={alerts}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <AlertCard alert={item} onPress={() => router.push(`/alert/${item.id}`)} />
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No hay alertas para este filtro.</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  streamRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  streamText: { fontSize: 13, fontWeight: '600' },
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12, flexWrap: 'wrap' },
  chip: {
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { color: colors.textMuted },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: colors.danger, paddingHorizontal: 16 },
  list: { padding: 16, gap: 10 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
