import type { Alert } from '../api/types';

export type AlertStreamStatus = 'connected' | 'reconnecting' | 'disconnected';

export interface AlertStreamOptions {
  url: string;
  token: string;
  onStatus: (status: AlertStreamStatus) => void;
  onAlert: (alert: Alert) => void;
  createSocket?: (url: string) => WebSocket;
}

const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 30_000;
const CLOSE_NORMAL = 1000;
const CLOSE_POLICY_VIOLATION = 1008;

/**
 * Client for the backend alerts WebSocket (same protocol as the web frontend):
 * auth frame on open, `ready` acknowledgement, `alert` pushes, ping every 30 s,
 * exponential backoff reconnect, no reconnect on normal or policy-violation close.
 */
export class AlertStreamClient {
  private socket: WebSocket | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private stopped = false;

  constructor(private readonly options: AlertStreamOptions) {}

  start(): void {
    this.stopped = false;
    this.connect();
  }

  stop(): void {
    this.stopped = true;
    this.clearTimers();
    const socket = this.socket;
    this.socket = null;
    socket?.close(CLOSE_NORMAL);
    this.options.onStatus('disconnected');
  }

  private connect(): void {
    const create = this.options.createSocket ?? ((url: string) => new WebSocket(url));
    const socket = create(this.options.url);
    this.socket = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ type: 'auth', token: this.options.token }));
    };

    socket.onmessage = (event: { data: unknown }) => {
      let data: { type?: string; alert?: Alert };
      try {
        data = JSON.parse(String(event.data));
      } catch {
        return;
      }
      if (data.type === 'ready') {
        this.retries = 0;
        this.options.onStatus('connected');
        this.startPing(socket);
      } else if (data.type === 'alert' && data.alert) {
        this.options.onAlert(data.alert);
      }
    };

    socket.onclose = (event: { code: number }) => {
      if (this.socket !== socket) return;
      this.socket = null;
      this.clearTimers();
      if (this.stopped || event.code === CLOSE_NORMAL || event.code === CLOSE_POLICY_VIOLATION) {
        this.options.onStatus('disconnected');
        return;
      }
      this.options.onStatus('reconnecting');
      const delay = Math.min(1000 * 1.5 ** this.retries, MAX_BACKOFF_MS);
      this.retries += 1;
      this.reconnectTimer = setTimeout(() => {
        if (!this.stopped) this.connect();
      }, delay);
    };
  }

  private startPing(socket: WebSocket): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = setInterval(() => {
      if (socket.readyState === 1) socket.send(JSON.stringify({ type: 'ping' }));
    }, PING_INTERVAL_MS);
  }

  private clearTimers(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }
}
