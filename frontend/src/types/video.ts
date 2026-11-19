export type VideoJobStatus = 'queued' | 'processing' | 'completed' | 'failed';

export interface VideoJob {
  id: string;
  original_filename: string;
  status: VideoJobStatus;
  progress: number;
  created_at: string;
}
