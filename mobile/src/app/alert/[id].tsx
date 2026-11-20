import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { alertStatusLabel, alertTypeLabel, formatConfidence, formatDateTime } from '../../alerts/format';
import { ApiError } from '../../api/client';
import type { Alert, AlertReviewPayload, Camera } from '../../api/types';
import { useSession } from '../../session/SessionProvider';
import { alertTypeColors, colors, statusColors } from '../../theme';

export default function AlertDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, can } = useSession();
  const router = useRouter();
  const [alert, setAlert] = useState<Alert | null>(null);
  const [cameraName, setCameraName] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await api.request<Alert>(`/alerts/${id}`);
        setAlert(loaded);
        if (loaded.camera_id && can('cameras.read')) {
          const camera = await api.request<Camera>(`/cameras/${loaded.camera_id}`).catch(() => null);
          setCameraName(camera?.name ?? null);
        }
      } catch (err) {
        setError(err instanceof ApiError ? err.message : 'No se pudo cargar la alerta.');
      }
    })();
  }, [api, can, id]);

  async function review(status: AlertReviewPayload['status']) {
    setSubmitting(true);
    setError(null);
    try {
      const payload: AlertReviewPayload = { status, ...(notes.trim() ? { notes: notes.trim() } : {}) };
      const updated = await api.request<Alert>(`/alerts/${id}/review`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setAlert(updated);
      router.back();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar la revisión.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!alert) {
    return (
      <View style={styles.center}>
        {error ? <Text style={styles.error}>{error}</Text> : <ActivityIndicator color={colors.primary} />}
      </View>
    );
  }

  const typeColor = alertTypeColors[alert.alert_type] ?? colors.primary;
  const canReview = alert.status === 'pending' && can('alerts.review');
  const person = typeof alert.details?.person_name === 'string' ? alert.details.person_name : null;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.container}>
      {alert.has_snapshot ? (
        <Image
          source={{ uri: api.url(`/alerts/${alert.id}/snapshot`), headers: api.authHeaders() }}
          style={styles.snapshot}
          contentFit="contain"
          transition={200}
        />
      ) : (
        <View style={[styles.snapshot, styles.center]}>
          <Text style={styles.muted}>Sin captura</Text>
        </View>
      )}

      <Text style={[styles.title, { color: typeColor }]}>{alertTypeLabel(alert.alert_type)}</Text>
      {person && <Text style={styles.person}>Persona: {person}</Text>}

      <View style={styles.card}>
        <Row label="Estado" value={alertStatusLabel(alert.status)} color={statusColors[alert.status]} />
        <Row label="Confianza" value={formatConfidence(alert.confidence)} />
        <Row label="Fecha" value={formatDateTime(alert.occurred_at)} />
        <Row label="Origen" value={cameraName ?? (alert.camera_id ? 'Cámara en vivo' : 'Video analizado')} />
        {alert.review_notes ? <Row label="Notas" value={alert.review_notes} /> : null}
      </View>

      {error && <Text style={styles.error}>{error}</Text>}

      {canReview && (
        <View style={styles.card}>
          <TextInput
            style={styles.input}
            placeholder="Notas de la revisión (opcional)"
            placeholderTextColor={colors.textMuted}
            value={notes}
            onChangeText={setNotes}
            multiline
          />
          <View style={styles.actions}>
            <Pressable
              style={[styles.action, { backgroundColor: colors.danger }]}
              onPress={() => review('confirmed')}
              disabled={submitting}
            >
              <Text style={styles.actionText}>Confirmar</Text>
            </Pressable>
            <Pressable
              style={[styles.action, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => review('false_alarm')}
              disabled={submitting}
            >
              <Text style={styles.actionText}>Falsa alarma</Text>
            </Pressable>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.muted}>{label}</Text>
      <Text style={[styles.value, color ? { color } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  container: { padding: 16, gap: 14 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  snapshot: { width: '100%', aspectRatio: 16 / 9, borderRadius: 12, backgroundColor: colors.surface },
  title: { fontSize: 24, fontWeight: '800' },
  person: { color: colors.text, fontSize: 16 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 14,
    gap: 10,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  muted: { color: colors.textMuted },
  value: { color: colors.text, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  error: { color: colors.danger },
  input: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 10,
    color: colors.text,
    padding: 12,
    minHeight: 70,
    textAlignVertical: 'top',
  },
  actions: { flexDirection: 'row', gap: 10 },
  action: { flex: 1, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  actionText: { color: '#fff', fontWeight: '700' },
});
