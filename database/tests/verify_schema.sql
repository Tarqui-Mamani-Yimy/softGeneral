-- Schema smoke test. Runs inside a transaction that is rolled back, so it
-- leaves no data behind. Any failed check raises an exception (exit code 3
-- with psql -v ON_ERROR_STOP=1).
--   docker compose exec -T db psql -v ON_ERROR_STOP=1 -U softgeneral -d softgeneral < database/tests/verify_schema.sql

BEGIN;

DO $$
DECLARE
    v_admin_perms INT;
    v_guard_perms INT;
    v_user UUID;
    v_cam UUID;
    v_alert UUID;
BEGIN
    -- RBAC seed
    SELECT count(*) INTO v_admin_perms FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code = 'admin';
    SELECT count(*) INTO v_guard_perms FROM role_permissions rp JOIN roles r ON r.id = rp.role_id WHERE r.code = 'guard';
    IF v_admin_perms <> (SELECT count(*) FROM permissions) THEN
        RAISE EXCEPTION 'admin must have every permission, has %', v_admin_perms;
    END IF;
    IF v_guard_perms <> 5 THEN
        RAISE EXCEPTION 'guard must have 5 permissions, has %', v_guard_perms;
    END IF;
    IF EXISTS (SELECT 1 FROM role_permissions rp JOIN roles r ON r.id = rp.role_id
               JOIN permissions p ON p.id = rp.permission_id
               WHERE r.code = 'guard' AND p.code IN ('users.manage', 'audit.read')) THEN
        RAISE EXCEPTION 'guard must not manage users or read the audit log';
    END IF;

    -- user + effective permissions view; emails are case-insensitive
    INSERT INTO users (username, email, full_name, password_hash, role_id)
    VALUES ('test_guard', 'Guard@Example.com', 'Test Guard', 'x', (SELECT id FROM roles WHERE code = 'guard'))
    RETURNING id INTO v_user;
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = 'guard@example.com') THEN
        RAISE EXCEPTION 'email lookup must be case-insensitive';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM user_permissions WHERE user_id = v_user AND permission_code = 'alerts.review') THEN
        RAISE EXCEPTION 'user_permissions view must expose alerts.review for a guard';
    END IF;

    -- alert lifecycle
    INSERT INTO cameras (code, name, source_type, source_url)
    VALUES ('cam_test', 'Test camera', 'rtsp', 'rtsp://localhost:8554/test') RETURNING id INTO v_cam;
    INSERT INTO alerts (alert_type, camera_id, occurred_at, confidence)
    VALUES ('intrusion', v_cam, now(), 0.91) RETURNING id INTO v_alert;
    UPDATE alerts SET status = 'confirmed', reviewed_by = v_user, reviewed_at = now() WHERE id = v_alert;

    -- an alert without a source must be rejected
    BEGIN
        INSERT INTO alerts (alert_type, occurred_at, confidence) VALUES ('weapon', now(), 0.5);
        RAISE EXCEPTION 'alert without camera or video job was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- a reviewed alert must record who reviewed it
    BEGIN
        INSERT INTO alerts (alert_type, camera_id, occurred_at, confidence, status)
        VALUES ('weapon', v_cam, now(), 0.5, 'false_alarm');
        RAISE EXCEPTION 'reviewed alert without reviewer was accepted';
    EXCEPTION WHEN check_violation THEN NULL;
    END;

    -- audit log is append-only
    INSERT INTO audit_log (user_id, action, entity_type, entity_id)
    VALUES (v_user, 'alert.confirmed', 'alert', v_alert::text);
    BEGIN
        DELETE FROM audit_log;
        RAISE EXCEPTION 'audit_log delete was allowed';
    EXCEPTION WHEN raise_exception THEN
        IF SQLERRM <> 'audit_log is append-only' THEN RAISE; END IF;
    END;

    RAISE NOTICE 'schema checks passed';
END;
$$;

ROLLBACK;
