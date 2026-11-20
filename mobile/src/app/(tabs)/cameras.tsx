import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { ApiError } from '../../api/client';
import type { Camera } from '../../api/types';
import { useSession } from '../../session/SessionProvider';
import { colors } from '../../theme';

export default function CamerasScreen() {
  const { api } = useSession();
  const router = useRouter();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCameras(await api.request<Camera[]>('/cameras'));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudieron cargar las cámaras.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={styles.container}>
      {error && <Text style={styles.error}>{error}</Text>}
      <FlatList
        data={cameras}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.primary} />
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            disabled={!item.is_active}
            onPress={() =>
              router.push({
                pathname: '/camera/[id]',
                params: { id: item.id, name: item.name, livePath: item.live_path },
              })
            }
          >
            <View style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <View
                style={[styles.dot, { backgroundColor: item.is_active ? colors.success : colors.textMuted }]}
              />
            </View>
            <Text style={styles.meta}>
              {item.location || 'Sin ubicación'} · {item.code}
            </Text>
            <Text style={styles.meta}>{item.is_active ? 'Toca para ver en vivo' : 'Desactivada'}</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !loading ? <Text style={styles.empty}>No hay cámaras registradas.</Text> : undefined
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  list: { padding: 16, gap: 10 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  name: { color: colors.text, fontSize: 16, fontWeight: '700' },
  dot: { width: 10, height: 10, borderRadius: 5 },
  meta: { color: colors.textMuted, fontSize: 13 },
  error: { color: colors.danger, padding: 16 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 40 },
});
