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
