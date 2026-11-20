import type { Alert, AlertReviewPayload } from '../types/alert';
import type { LoginCredentials, LoginResponse, User } from '../types/auth';
import type { Camera, CameraCreatePayload, CameraUpdatePayload } from '../types/camera';
import type { DemoSession } from '../types/demo';
import type { VideoJob } from '../types/video';

export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000/api/v1';
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

export async function listAlerts(params: {
  status?: string;
  alert_type?: string;
  video_job_id?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<Alert[]> {
  const query = new URLSearchParams();
  if (params.status) query.set('status', params.status);
  if (params.alert_type) query.set('alert_type', params.alert_type);
  if (params.video_job_id) query.set('video_job_id', params.video_job_id);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));

  const qs = query.toString();
  return apiClient<Alert[]>(`/alerts${qs ? `?${qs}` : ''}`);
}

export async function getAlert(id: string): Promise<Alert> {
  return apiClient<Alert>(`/alerts/${id}`);
}

export async function fetchAlertSnapshotBlob(id: string): Promise<Blob> {
  const url = `${API_URL}/alerts/${id}/snapshot`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401 && onUnauthorizedCallback) {
      setAuthToken(null);
      onUnauthorizedCallback();
    }
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}

export async function fetchAlertClipBlob(id: string): Promise<Blob> {
  const url = `${API_URL}/alerts/${id}/clip`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401 && onUnauthorizedCallback) {
      setAuthToken(null);
      onUnauthorizedCallback();
    }
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}

export async function reviewAlert(id: string, payload: AlertReviewPayload): Promise<Alert> {
  return apiClient<Alert>(`/alerts/${id}/review`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listCameras(): Promise<Camera[]> {
  return apiClient<Camera[]>('/cameras');
}

export async function getCamera(id: string): Promise<Camera> {
  return apiClient<Camera>(`/cameras/${id}`);
}

export async function createCamera(payload: CameraCreatePayload): Promise<Camera> {
  return apiClient<Camera>('/cameras', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateCamera(id: string, payload: CameraUpdatePayload): Promise<Camera> {
  return apiClient<Camera>(`/cameras/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function disableCamera(id: string): Promise<Camera> {
  return apiClient<Camera>(`/cameras/${id}/disable`, {
    method: 'POST',
  });
}

export async function getHealth(): Promise<HealthResponse> {
  return apiClient<HealthResponse>('/health');
}

export async function createDemoSession(): Promise<DemoSession> {
  return apiClient<DemoSession>('/demo/sessions', {
    method: 'POST',
  });
}

export async function getCurrentDemoSession(): Promise<DemoSession | null> {
  try {
    return await apiClient<DemoSession>('/demo/sessions/current');
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      return null;
    }
    throw err;
  }
}

/**
 * Asks the backend whether the annotated stream of a demo session is live.
 * (MediaMTX player pages answer 404 to HEAD even when a stream exists, so the
 * browser cannot probe them directly.)
 */
export async function getDemoStreamStatus(id: string): Promise<{ annotated_ready: boolean }> {
  return apiClient<{ annotated_ready: boolean }>(`/demo/sessions/${id}/stream`);
}

export async function deleteDemoSession(id: string): Promise<void> {
  const normalizedEndpoint = `/demo/sessions/${id}`;
  const url = `${API_URL}${normalizedEndpoint}`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'DELETE',
    headers,
  });

  if (!response.ok && response.status !== 404 && response.status !== 204) {
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
}

export async function listBannedPersons(includeInactive = false): Promise<import('../types/bannedPerson').BannedPerson[]> {
  const query = includeInactive ? '?include_inactive=true' : '';
  return apiClient<import('../types/bannedPerson').BannedPerson[]>(`/banned-persons${query}`);
}

export async function createBannedPerson(formData: FormData): Promise<import('../types/bannedPerson').BannedPerson> {
  const url = `${API_URL}/banned-persons`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 401 && onUnauthorizedCallback) {
      setAuthToken(null);
      onUnauthorizedCallback();
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

  return response.json();
}

export async function updateBannedPerson(id: string, payload: Partial<import('../types/bannedPerson').BannedPerson>): Promise<import('../types/bannedPerson').BannedPerson> {
  return apiClient<import('../types/bannedPerson').BannedPerson>(`/banned-persons/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteBannedPerson(id: string): Promise<void> {
  return apiClient<void>(`/banned-persons/${id}`, {
    method: 'DELETE',
  });
}

export async function fetchBannedPersonPhotoBlob(id: string): Promise<Blob> {
  const url = `${API_URL}/banned-persons/${id}/photo`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401 && onUnauthorizedCallback) {
      setAuthToken(null);
      onUnauthorizedCallback();
    }
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}

export async function fetchSportsEvents(params?: {
  video_job_id?: string;
  camera_id?: string;
  event_type?: string;
  limit?: number;
}): Promise<import('../types/sports').SportsEvent[]> {
  const searchParams = new URLSearchParams();
  if (params?.video_job_id) searchParams.set('video_job_id', params.video_job_id);
  if (params?.camera_id) searchParams.set('camera_id', params.camera_id);
  if (params?.event_type) searchParams.set('event_type', params.event_type);
  if (params?.limit) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  return apiClient<import('../types/sports').SportsEvent[]>(`/sports/events${qs ? `?${qs}` : ''}`);
}

export async function fetchSportsSummary(video_job_id?: string): Promise<import('../types/sports').SportsSummary> {
  const qs = video_job_id ? `?video_job_id=${encodeURIComponent(video_job_id)}` : '';
  return apiClient<import('../types/sports').SportsSummary>(`/sports/summary${qs}`);
}

export async function fetchSportsSnapshotBlob(id: string): Promise<Blob> {
  const url = `${API_URL}/sports/events/${id}/snapshot`;
  const token = getAuthToken();
  const headers: Record<string, string> = {};
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    if (response.status === 401 && onUnauthorizedCallback) {
      setAuthToken(null);
      onUnauthorizedCallback();
    }
    throw new ApiError(response.status, response.statusText);
  }
  return response.blob();
}



