-- 007: sports events and match telemetry (RF8)
CREATE TABLE IF NOT EXISTS sports_events (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type    TEXT         NOT NULL,  -- e.g. 'ball_in_play', 'match_formation', 'referee_active'
    camera_id     UUID         REFERENCES cameras (id) ON DELETE SET NULL,
    video_job_id  UUID         REFERENCES video_jobs (id) ON DELETE CASCADE,
    occurred_at   TIMESTAMPTZ  NOT NULL,
    confidence    NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    details       JSONB        NOT NULL DEFAULT '{}'::jsonb,
    snapshot_path TEXT,
    clip_path     TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sports_events_video_job ON sports_events (video_job_id, occurred_at);
CREATE INDEX IF NOT EXISTS idx_sports_events_camera ON sports_events (camera_id, occurred_at);
