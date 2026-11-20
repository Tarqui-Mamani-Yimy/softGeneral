import * as Notifications from 'expo-notifications';

import type { Alert } from './api/types';
import { alertTypeLabel, formatConfidence } from './alerts/format';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function ensureNotificationPermission(): Promise<boolean> {
  try {
    const current = await Notifications.getPermissionsAsync();
    if (current.granted) return true;
    const requested = await Notifications.requestPermissionsAsync();
    return requested.granted;
  } catch {
    return false;
  }
}

/** Local notification for an alert received over the WebSocket while the app is running. */
export async function notifyAlert(alert: Alert): Promise<void> {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `⚠ ${alertTypeLabel(alert.alert_type)}`,
        body: `Confianza ${formatConfidence(alert.confidence)} — toca para revisar`,
        data: { alertId: alert.id },
      },
      trigger: null,
    });
  } catch {
    // notifications unavailable (e.g. permission denied): the feed still shows the alert
  }
}
