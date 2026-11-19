-- 004: audit trail (traceability) and public read-only share links.

-- Append-only: every guard/admin action that matters (alert review, user
-- changes, link creation). user_id is NULL for actions done by the system.
CREATE TABLE audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        REFERENCES users (id) ON DELETE SET NULL,
    action      TEXT        NOT NULL,  -- e.g. 'alert.confirmed', 'user.created'
    entity_type TEXT        NOT NULL,
    entity_id   TEXT,
    details     JSONB       NOT NULL DEFAULT '{}'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_entity ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_log_time   ON audit_log (created_at DESC);

CREATE FUNCTION prevent_audit_log_change() RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_log_append_only
    BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_change();

-- Public links expose sports results of a processed video only.
-- Only the SHA-256 hash of the token is stored; the raw token is shown once.
CREATE TABLE share_links (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    token_hash   TEXT        NOT NULL UNIQUE CHECK (length(token_hash) = 64),
    video_job_id UUID        NOT NULL REFERENCES video_jobs (id) ON DELETE CASCADE,
    created_by   UUID        NOT NULL REFERENCES users (id),
    expires_at   TIMESTAMPTZ NOT NULL,
    revoked_at   TIMESTAMPTZ,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (expires_at > created_at)
);
