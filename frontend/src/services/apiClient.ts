import type { LoginCredentials, LoginResponse, User } from '../types/auth';
import type { VideoJob } from '../types/video';

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
const TOKEN_KEY = 'softgeneral_auth_token';

export class ApiError extends Error {
  status: number;
  detail: string;
  data?: unknown;

  constructor(status: number, detail: string, data?: unknown) {
    super(detail);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
    this.data = data;
  }
}

// Token held in memory and backed by sessionStorage (never localStorage)
let inMemoryToken: string | null =
  typeof window !== 'undefined' ? sessionStorage.getItem(TOKEN_KEY) : null;

let onUnauthorizedCallback: (() => void) | null = null;

export function getAuthToken(): string | null {
  if (inMemoryToken) return inMemoryToken;
  if (typeof window !== 'undefined') {
    const stored = sessionStorage.getItem(TOKEN_KEY);
    if (stored) {
      inMemoryToken = stored;
      return stored;
    }
  }
  return null;
}

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
  if (typeof window !== 'undefined') {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }
}

export function setUnauthorizedCallback(callback: (() => void) | null): void {
  onUnauthorizedCallback = callback;
}

export interface HealthResponse {
  status: string;
  [key: string]: unknown;
}

/**
 * Lightweight fetch wrapper for interacting with the softGeneral backend API.
 * Injects Authorization header automatically and triggers logout on 401.
 */
export async function apiClient<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const normalizedEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = `${API_URL}${normalizedEndpoint}`;

  const headers: Record<string, string> = {};

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...options.headers,
    },
  });

  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      if (normalizedEndpoint !== '/auth/login' && onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }

    let detail = response.statusText;
    let data: unknown;
    try {
      data = await response.json();
      if (data && typeof data === 'object' && 'detail' in data) {
        detail = String((data as { detail: unknown }).detail);
      }
    } catch {
      // response body is not JSON
    }

    throw new ApiError(response.status, detail, data);
  }

  return response.json() as Promise<T>;
}

export async function loginUser(credentials: LoginCredentials): Promise<LoginResponse> {
  return apiClient<LoginResponse>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(credentials),
  });
}

export async function getMe(): Promise<User> {
  return apiClient<User>('/auth/me');
}

export async function listVideos(limit = 50, offset = 0): Promise<VideoJob[]> {
  return apiClient<VideoJob[]>(`/videos?limit=${limit}&offset=${offset}`);
}

export async function getVideo(id: string): Promise<VideoJob> {
  return apiClient<VideoJob>(`/videos/${id}`);
}

/**
 * Uploads a video file with XMLHttpRequest to support real upload progress.
 */
export function uploadVideo(
  file: File,
  onProgress?: (percent: number) => void
): Promise<VideoJob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const url = `${API_URL}/videos`;

    xhr.open('POST', url);

    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    }

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percent = Math.round((event.loaded / event.total) * 100);
          onProgress(percent);
        }
      };
    }

    xhr.onload = () => {
      let responseBody: unknown;
      try {
        responseBody = JSON.parse(xhr.responseText);
      } catch {
        responseBody = xhr.responseText;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(responseBody as VideoJob);
      } else {
        if (xhr.status === 401) {
          setAuthToken(null);
          if (onUnauthorizedCallback) {
            onUnauthorizedCallback();
          }
        }
        const detail =
          typeof responseBody === 'object' && responseBody && 'detail' in responseBody
            ? String((responseBody as { detail: unknown }).detail)
            : xhr.statusText || 'Upload failed';
        reject(new ApiError(xhr.status, detail, responseBody));
      }
    };

    xhr.onerror = () => {
      reject(new ApiError(0, 'Network error during upload'));
    };

    const formData = new FormData();
    formData.append('file', file);
    xhr.send(formData);
  });
}

/**
 * Downloads annotated video output using fetch + blob to send Authorization header.
 */
export async function downloadVideoOutput(jobId: string, filename: string): Promise<void> {
  const url = `${API_URL}/videos/${jobId}/output`;
  const token = getAuthToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401) {
      setAuthToken(null);
      if (onUnauthorizedCallback) {
        onUnauthorizedCallback();
      }
    }
    let detail = response.statusText;
    try {
      const data = await response.json();
      if (data && typeof data === 'object' && 'detail' in data) {
        detail = String((data as { detail: unknown }).detail);
      }
    } catch {
      // response body not JSON
    }
    throw new ApiError(response.status, detail);
  }

  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = blobUrl;
  const baseName = filename.replace(/\.[^/.]+$/, '') || 'video';
  link.download = `${baseName}_annotated.mp4`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}

export async function getHealth(): Promise<HealthResponse> {
  return apiClient<HealthResponse>('/health');
}
