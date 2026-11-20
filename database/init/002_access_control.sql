-- 002: users, roles and permissions (RBAC).
-- A user has exactly one role; a role grants many permissions.
-- The API checks permissions (e.g. 'alerts.review'), never role names,
-- so new roles can be added with SQL only.

CREATE TABLE roles (
    id          SMALLSERIAL PRIMARY KEY,
    code        TEXT        NOT NULL UNIQUE CHECK (code ~ '^[a-z][a-z_]*$'),
    name        TEXT        NOT NULL,
    description TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
    id          SMALLSERIAL PRIMARY KEY,
    code        TEXT        NOT NULL UNIQUE CHECK (code ~ '^[a-z_]+\.[a-z_]+$'),
    description TEXT        NOT NULL DEFAULT ''
);

CREATE TABLE role_permissions (
    role_id       SMALLINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id SMALLINT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    username      CITEXT      NOT NULL UNIQUE,
    email         CITEXT      NOT NULL UNIQUE,
    full_name     TEXT        NOT NULL,
    password_hash TEXT        NOT NULL,  -- bcrypt/argon2 hash produced by the API, never plain text
    role_id       SMALLINT    NOT NULL REFERENCES roles (id),
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_role_id ON users (role_id);

-- Keeps updated_at current on every UPDATE (reused by other tables).
CREATE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Convenience view: effective permissions per user (used by the API at login).
CREATE VIEW user_permissions AS
SELECT u.id AS user_id, r.code AS role_code, p.code AS permission_code
FROM users u
JOIN roles r             ON r.id = u.role_id
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p       ON p.id = rp.permission_id
WHERE u.is_active;
