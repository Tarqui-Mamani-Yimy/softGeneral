import Constants from 'expo-constants';

import { createApiClient } from '../api/client';
import { defaultsFromDevHost, normalizeBaseUrl, type ServerUrls } from '../config/urls';

/**
 * Current credentials and server, kept outside React so the API client can read
 * them at request time. SessionProvider is the only writer and mirrors them in state.
 */
const current: { token: string | null; server: ServerUrls; onUnauthorized: () => void } = {
  token: null,
  server: initialServerUrls(),
  onUnauthorized: () => {},
};

export function initialServerUrls(): ServerUrls {
  const fromDev = defaultsFromDevHost(Constants.expoConfig?.hostUri);
  return {
    apiUrl: normalizeBaseUrl(process.env.EXPO_PUBLIC_API_URL ?? fromDev?.apiUrl ?? ''),
    mediamtxUrl: normalizeBaseUrl(
      process.env.EXPO_PUBLIC_MEDIAMTX_WEBRTC_URL ?? fromDev?.mediamtxUrl ?? '',
    ),
  };
}

export const sessionStore = {
  setToken(token: string | null) {
    current.token = token;
  },
  setServer(server: ServerUrls) {
    current.server = server;
  },
  setUnauthorizedHandler(handler: () => void) {
    current.onUnauthorized = handler;
  },
};

export const api = createApiClient({
  getBaseUrl: () => current.server.apiUrl,
  getToken: () => current.token,
  onUnauthorized: () => current.onUnauthorized(),
});
