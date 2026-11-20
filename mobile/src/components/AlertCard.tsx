import { Pressable, StyleSheet, Text, View } from 'react-native';

import { alertStatusLabel, alertTypeLabel, formatConfidence, formatDateTime } from '../alerts/format';
import type { Alert } from '../api/types';
import { alertTypeColors, colors, statusColors } from '../theme';

export function AlertCard({ alert, onPress }: { alert: Alert; onPress: () => void }) {
  const typeColor = alertTypeColors[alert.alert_type] ?? colors.primary;
  const statusColor = statusColors[alert.status] ?? colors.textMuted;

  return (
    <Pressable style={[styles.card, { borderLeftColor: typeColor }]} onPress={onPress}>
      <View style={styles.row}>
        <Text style={[styles.type, { color: typeColor }]}>{alertTypeLabel(alert.alert_type)}</Text>
        <Text style={[styles.badge, { color: statusColor, borderColor: statusColor }]}>
          {alertStatusLabel(alert.status)}
        </Text>
      </View>
      <Text style={styles.meta}>
        {formatDateTime(alert.occurred_at)} · Confianza {formatConfidence(alert.confidence)}
      </Text>
      <Text style={styles.meta}>{alert.camera_id ? 'Cámara en vivo' : 'Video analizado'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 12,
    padding: 14,
    gap: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  type: { fontSize: 16, fontWeight: '700' },
  badge: {
    fontSize: 12,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  meta: { color: colors.textMuted, fontSize: 13 },
});
