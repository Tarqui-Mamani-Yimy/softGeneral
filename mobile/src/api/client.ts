import { normalizeBaseUrl } from '../config/urls';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface ApiClientDeps {
  getBaseUrl: () => string;
  getToken: () => string | null;
  onUnauthorized: () => void;
}

export interface ApiClient {
  request<T>(endpoint: string, init?: RequestInit): Promise<T>;
  url(endpoint: string): string;
  authHeaders(): Record<string, string>;
}

const LOGIN_ENDPOINT = '/auth/login';

export function createApiClient(deps: ApiClientDeps): ApiClient {
  const url = (endpoint: string) => {
    const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${normalizeBaseUrl(deps.getBaseUrl())}${path}`;
  };

  const authHeaders = (): Record<string, string> => {
    const token = deps.getToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

  async function request<T>(endpoint: string, init: RequestInit = {}): Promise<T> {
    if (!normalizeBaseUrl(deps.getBaseUrl())) {
      throw new ApiError(0, 'Configura la dirección del servidor en el perfil.');
    }

    let response: Response;
    try {
      response = await fetch(url(endpoint), {
        ...init,
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch {
      throw new ApiError(0, 'No se pudo conectar con el servidor.');
    }

    if (!response.ok) {
      let detail = response.statusText;
      try {
        const body = (await response.json()) as { detail?: unknown };
        if (body && typeof body.detail === 'string') detail = body.detail;
      } catch {
        // body is not JSON
      }
      const isLogin = endpoint.replace(/^\/?/, '/') === LOGIN_ENDPOINT;
      if (response.status === 401 && !isLogin) deps.onUnauthorized();
      throw new ApiError(response.status, detail);
    }

    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  return { request, url, authHeaders };
}
