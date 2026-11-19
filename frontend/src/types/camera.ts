export type CameraSourceType = 'rtsp' | 'webcam' | 'file';

export interface Camera {
  id: string;
  code: string;
  name: string;
  location: string;
  source_type: CameraSourceType;
  source_url?: string | null;
  live_path: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface CameraCreatePayload {
  code: string;
  name: string;
  location?: string;
  source_type: CameraSourceType;
  source_url: string;
}

export interface CameraUpdatePayload {
  name?: string;
  location?: string;
  source_type?: CameraSourceType;
  source_url?: string;
  is_active?: boolean;
}

export interface CameraMetrics {
  analysis_fps: number;
  published_fps: number;
  dropped_frames: number;
  frame_to_alert_ms: number | null;
  people_tracked: number;
  detections: Record<string, number>;
  updated_at: string;
}

export interface CameraMetricsMessage {
  type: 'camera_metrics';
  camera_id: string;
  metrics: CameraMetrics;
}
