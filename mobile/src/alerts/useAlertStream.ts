import { useEffect, useRef, useState } from 'react';

import type { Alert } from '../api/types';
import { buildAlertsWsUrl } from '../config/urls';
import { useSession } from '../session/SessionProvider';
import { AlertStreamClient, type AlertStreamStatus } from './alertStream';

/** Keeps the alerts WebSocket open while the user is logged in. */
export function useAlertStream(onAlert: (alert: Alert) => void): AlertStreamStatus {
  const { token, server } = useSession();
  const [status, setStatus] = useState<AlertStreamStatus>('disconnected');
  const onAlertRef = useRef(onAlert);

  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  useEffect(() => {
    if (!token || !server.apiUrl) return;
    const client = new AlertStreamClient({
      url: buildAlertsWsUrl(server.apiUrl),
      token,
      onStatus: setStatus,
      onAlert: (alert) => onAlertRef.current(alert),
    });
    client.start();
    return () => client.stop();
  }, [token, server.apiUrl]);

  return status;
}
