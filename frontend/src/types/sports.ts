export type SportsEventType = 'ball_in_play' | 'match_formation' | 'referee_active';

export interface SportsEvent {
  id: string;
  event_type: SportsEventType;
  confidence: number;
  occurred_at: string;
  camera_id?: string | null;
  video_job_id?: string | null;
  details: {
    ball_box?: [number, number, number, number];
    active_players?: number;
    players_count?: number;
    referees?: number;
    referee_box?: [number, number, number, number];
    formation_spread?: string;
    [key: string]: unknown;
  };
  has_snapshot: boolean;
  created_at: string;
}

export interface SportsSummary {
  total_events: number;
  total_ball_events: number;
  total_formation_events: number;
  total_referee_events: number;
  events: SportsEvent[];
}
