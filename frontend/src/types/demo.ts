export interface DemoSession {
  id: string;
  camera_code: string;
  publish_path: string;
  whip_url: string;
  live_path: string;
  expires_at?: string;
}

export type DemoStatus =
  | 'idle'
  | 'requesting_camera'
  | 'publishing'
  | 'waiting_for_analysis'
  | 'live'
  | 'error';
