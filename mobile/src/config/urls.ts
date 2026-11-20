/** Normalizes a user-typed server URL: trims, adds http:// when missing, drops trailing slashes. */
export function normalizeBaseUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  return withScheme.replace(/\/+$/, '');
}

/** WebSocket URL of the live alerts channel for a given API base URL. */
export function buildAlertsWsUrl(apiBaseUrl: string): string {
  const base = normalizeBaseUrl(apiBaseUrl);
  const wsBase = base.replace(/^http(s?):\/\//i, (_match, secure: string) => `ws${secure}://`);
  return `${wsBase}/alerts/ws`;
}

/** URL of the MediaMTX built-in WebRTC player for a camera live path. */
export function buildLivePlayerUrl(mediamtxBaseUrl: string, livePath: string): string {
  return `${normalizeBaseUrl(mediamtxBaseUrl)}/${livePath.replace(/^\/+/, '')}`;
}

export interface ServerUrls {
  apiUrl: string;
  mediamtxUrl: string;
}

/**
 * In Expo Go the dev server host (e.g. "192.168.1.20:8081") is the developer's PC,
 * which is also where the backend (8000) and MediaMTX (8889) run locally.
 */
export function defaultsFromDevHost(hostUri: string | undefined | null): ServerUrls | null {
  const host = hostUri?.split(':')[0]?.trim();
  if (!host) return null;
  return { apiUrl: `http://${host}:8000/api/v1`, mediamtxUrl: `http://${host}:8889` };
}
