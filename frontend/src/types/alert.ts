export type AlertStatus = 'pending' | 'confirmed' | 'false_alarm';

export type AlertType = 'intrusion' | 'weapon' | 'fire_smoke' | 'fight' | 'face_match';

export interface Alert {
  id: string;
  alert_type: AlertType | string;
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
