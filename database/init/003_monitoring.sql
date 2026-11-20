-- 003: cameras, zones, uploaded video jobs and alerts.

CREATE TABLE cameras (
    id          UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
    code        TEXT               NOT NULL UNIQUE,  -- short id used in config, e.g. 'cam_north_01'
    name        TEXT               NOT NULL,
    location    TEXT               NOT NULL DEFAULT '',
    source_type camera_source_type NOT NULL,
    source_url  TEXT               NOT NULL,         -- RTSP URL, device index or file path
    is_active   BOOLEAN            NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ        NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ        NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_cameras_updated_at
    BEFORE UPDATE ON cameras
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Polygon in normalized image coordinates: [[x, y], ...] with 0 <= x, y <= 1.
CREATE TABLE zones (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    camera_id  UUID        NOT NULL REFERENCES cameras (id) ON DELETE CASCADE,
    name       TEXT        NOT NULL,
    zone_type  zone_type   NOT NULL,
    polygon    JSONB       NOT NULL CHECK (jsonb_typeof(polygon) = 'array' AND jsonb_array_length(polygon) >= 3),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (camera_id, name)
);

CREATE TABLE video_jobs (
    id                UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
    uploaded_by       UUID             NOT NULL REFERENCES users (id),
    original_filename TEXT             NOT NULL,
    input_path        TEXT             NOT NULL,
    output_path       TEXT,
    status            video_job_status NOT NULL DEFAULT 'queued',
    progress          NUMERIC(5, 2)    NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    error_message     TEXT,
    created_at        TIMESTAMPTZ      NOT NULL DEFAULT now(),
    started_at        TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ
);

CREATE INDEX idx_video_jobs_status ON video_jobs (status, created_at);

-- An alert comes either from a live camera or from an uploaded video job.
CREATE TABLE alerts (
    id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_type   alert_type   NOT NULL,
    camera_id    UUID         REFERENCES cameras (id) ON DELETE SET NULL,
    video_job_id UUID         REFERENCES video_jobs (id) ON DELETE CASCADE,
    occurred_at  TIMESTAMPTZ  NOT NULL,
    confidence   NUMERIC(4, 3) NOT NULL CHECK (confidence BETWEEN 0 AND 1),
    track_id     INTEGER,
    snapshot_path TEXT,
    clip_path    TEXT,
    details      JSONB        NOT NULL DEFAULT '{}'::jsonb,  -- boxes, zone, model version, ...
    status       alert_status NOT NULL DEFAULT 'pending',
    reviewed_by  UUID         REFERENCES users (id),
    reviewed_at  TIMESTAMPTZ,
    review_notes TEXT,
    created_at   TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT alerts_source_check
        CHECK (num_nonnulls(camera_id, video_job_id) >= 1),
    CONSTRAINT alerts_review_check
        CHECK ((status = 'pending') = (reviewed_by IS NULL AND reviewed_at IS NULL))
);

CREATE INDEX idx_alerts_status_time ON alerts (status, occurred_at DESC);
CREATE INDEX idx_alerts_camera_time ON alerts (camera_id, occurred_at DESC);
CREATE INDEX idx_alerts_video_job   ON alerts (video_job_id);
