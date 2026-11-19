-- 005: base roles and permissions (reference data, safe for every environment).
-- No users are seeded here: the first admin is created by the backend so the
-- password hash never lives in the repository.

INSERT INTO roles (code, name, description) VALUES
    ('admin', 'Administrator', 'Manages users, cameras, zones and configuration; sees everything'),
    ('guard', 'Security guard', 'Watches live alerts and confirms or dismisses them');

INSERT INTO permissions (code, description) VALUES
    ('alerts.read',        'View alerts and their snapshots and clips'),
    ('alerts.review',      'Confirm an alert or mark it as a false alarm'),
    ('cameras.read',       'View cameras and live streams'),
    ('cameras.manage',     'Create, edit and disable cameras'),
    ('zones.manage',       'Draw and edit zones per camera'),
    ('videos.upload',      'Upload videos for processing'),
    ('videos.read',        'View processing jobs and annotated videos'),
    ('share_links.manage', 'Create and revoke public share links'),
    ('users.manage',       'Create, edit and deactivate users and assign roles'),
    ('audit.read',         'View the audit log');

-- admin: every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p
WHERE r.code = 'admin';

-- guard: operational permissions only.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r JOIN permissions p ON p.code IN (
    'alerts.read', 'alerts.review', 'cameras.read', 'videos.upload', 'videos.read'
)
WHERE r.code = 'guard';
