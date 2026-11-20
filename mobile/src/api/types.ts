// Mirrors the backend schemas used by the web frontend (frontend/src/types).

export type AlertStatus = 'pending' | 'confirmed' | 'false_alarm';

export interface Alert {
  id: string;
  alert_type: string;
  status: AlertStatus | string;
  confidence: number;
  occurred_at: string;
  camera_id: string | null;
  video_job_id: string | null;
  track_id: number | null;
  details: Record<string, unknown>;
  has_snapshot: boolean;
  has_clip: boolean;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

export interface AlertReviewPayload {
  status: 'confirmed' | 'false_alarm';
  notes?: string;
}

export interface User {
  id: string;
  username: string;
  email?: string;
  full_name: string;
  role: string;
  permissions: string[];
}

export interface LoginResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Camera {
  id: string;
  code: string;
  name: string;
  location: string;
  source_type: 'rtsp' | 'webcam' | 'file';
  live_path: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}
