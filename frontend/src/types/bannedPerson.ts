export type SeverityLevel = 'high' | 'medium' | 'low';

export interface BannedPerson {
  id: string;
  full_name: string;
  document_id?: string | null;
  reason: string;
  severity: SeverityLevel;
  photo_url: string;
  is_active: boolean;
  banned_at: string;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

