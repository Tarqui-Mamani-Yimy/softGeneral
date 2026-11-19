const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

/**
 * Lightweight fetch wrapper for interacting with the softGeneral backend API.
 */
export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_URL}${normalizedEndpoint}`;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  const response = await fetch(url, {
    ...options,
    headers: {
      ...defaultHeaders,
      ...options.headers,
    },
  });

  if (!response.ok) {
    throw new Error(`API request failed [${response.status}]: ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

/**
 * Checks backend health status.
 */
export async function getHealth(): Promise<HealthResponse> {
  return apiClient<HealthResponse>('/health');
}
