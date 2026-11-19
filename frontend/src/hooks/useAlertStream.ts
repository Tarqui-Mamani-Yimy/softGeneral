import { useEffect, useRef, useState, useCallback } from 'react';
import { useAuth } from './useAuth';
import { getAuthToken } from '../services/apiClient';
import type { Alert } from '../types/alert';

export type AlertStreamStatus = 'connected' | 'reconnecting' | 'disconnected';

interface UseAlertStreamOptions {
  onAlert?: (alert: Alert) => void;
  enabled?: boolean;
}

interface UseAlertStreamResult {
  status: AlertStreamStatus;
  isConnected: boolean;
  latestAlert: Alert | null;
}

export function getAlertsWsUrl(): string {
  const apiUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
  const base = apiUrl.replace(/\/+$/, '');
  const wsProtocol = base.startsWith('https://') ? 'wss://' : 'ws://';
  const cleanUrl = base.replace(/^https?:\/\//, '');
  return `${wsProtocol}${cleanUrl}/alerts/ws`;
}

export function useAlertStream(options: UseAlertStreamOptions = {}): UseAlertStreamResult {
  const { onAlert, enabled = true } = options;
  const { token } = useAuth();

  const [status, setStatus] = useState<AlertStreamStatus>('disconnected');
  const [latestAlert, setLatestAlert] = useState<Alert | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const retryCountRef = useRef<number>(0);
  const isUnmountedRef = useRef<boolean>(false);
  const onAlertRef = useRef(onAlert);

  useEffect(() => {
    onAlertRef.current = onAlert;
  }, [onAlert]);

  const clearTimers = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const closeWebSocket = useCallback(() => {
    clearTimers();
    if (wsRef.current) {
      try {
        wsRef.current.close(1000);
      } catch {
        // ignore close error
      }
      wsRef.current = null;
    }
  }, [clearTimers]);

  const connect = useCallback(() => {
    if (isUnmountedRef.current || !enabled) return;

    const currentToken = token || getAuthToken();
    if (!currentToken) {
      setStatus('disconnected');
      return;
    }

    clearTimers();
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch {
        // ignore
      }
      wsRef.current = null;
    }

    const wsUrl = getAlertsWsUrl();
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (isUnmountedRef.current) return;
      // Send auth frame immediately upon opening
      try {
        ws.send(JSON.stringify({ type: 'auth', token: currentToken }));
      } catch {
        // failed to send
      }
    };

    ws.onmessage = (event) => {
      if (isUnmountedRef.current) return;
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'ready') {
          retryCountRef.current = 0;
          setStatus('connected');

          // Keep alive ping every 30s
          if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = setInterval(() => {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'ping' }));
            }
          }, 30000);
        } else if (data.type === 'alert' && data.alert) {
          const alert = data.alert as Alert;
          setLatestAlert(alert);
          if (onAlertRef.current) {
            onAlertRef.current(alert);
          }
        }
      } catch {
        // ignore malformed message
      }
    };

    ws.onerror = () => {
      // ws.onclose handles state and reconnection
    };

    ws.onclose = (event) => {
      if (isUnmountedRef.current) return;
      clearTimers();
      wsRef.current = null;

      // Do not reconnect if unauthorized or deliberately closed
      if (event.code === 1008 || event.code === 1000) {
        setStatus('disconnected');
        return;
      }

      // Reconnect with exponential backoff (max 30 s)
      setStatus('reconnecting');
      const count = retryCountRef.current;
      const delay = Math.min(1000 * Math.pow(1.5, count), 30000);
      retryCountRef.current = count + 1;

      reconnectTimerRef.current = setTimeout(() => {
        if (!isUnmountedRef.current) {
          connect();
        }
      }, delay);
    };
  }, [enabled, token, clearTimers]);

  useEffect(() => {
    isUnmountedRef.current = false;

    if (!enabled || !token) {
      closeWebSocket();
      setStatus('disconnected');
      return;
    }

    connect();

    return () => {
      isUnmountedRef.current = true;
      closeWebSocket();
    };
  }, [enabled, token, connect, closeWebSocket]);

  return {
    status,
    isConnected: status === 'connected',
    latestAlert,
  };
}
