-- 006: banned persons for facial recognition security alerts

CREATE TABLE IF NOT EXISTS banned_persons (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name     TEXT        NOT NULL,
    document_id   TEXT,
    reason        TEXT        NOT NULL,
    severity      TEXT        NOT NULL DEFAULT 'high',
    photo_path    TEXT        NOT NULL,
    face_encoding JSONB       NOT NULL,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    banned_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    notes         TEXT,
    created_by    UUID        REFERENCES users (id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TRIGGER trg_banned_persons_updated_at
    BEFORE UPDATE ON banned_persons
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE INDEX IF NOT EXISTS idx_banned_persons_active ON banned_persons (is_active);

-- Permissions
INSERT INTO permissions (code, description) VALUES
    ('banned_persons.read', 'Ver la lista de personas vetadas y sus perfiles'),
    ('banned_persons.manage', 'Registrar, editar y desvincular personas vetadas')
ON CONFLICT (code) DO NOTHING;

-- Grant to admin
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin' AND p.code IN ('banned_persons.read', 'banned_persons.manage')
ON CONFLICT DO NOTHING;

-- Grant read to guard
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'guard' AND p.code IN ('banned_persons.read')
ON CONFLICT DO NOTHING;

