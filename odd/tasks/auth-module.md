Objective: authentication and permission checks for the API (JWT login, current user, permission guard, first-admin command).
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend). Risk: item 2 (security: auth, credentials, guards).

## Specs

- S1. Login: `POST /api/v1/auth/login` with username or email + password returns a signed JWT access token plus the user (id, username, full_name, role) and its permission codes. Unknown user, wrong password and inactive user all return the same 401 "Invalid credentials". Successful login updates `users.last_login_at` and appends `user.login` to `audit_log`.
- S2. `GET /api/v1/auth/me` returns the current user and permissions; missing, malformed, tampered or expired token returns 401.
- S3. Permission guard `require_permission("<code>")` reads permissions from the `user_permissions` view on every request (deactivation or role change takes effect immediately); missing permission returns 403. The API checks permissions, never role names (database/README.md).
- S4. Passwords hashed with Argon2; JWT secret comes only from env (`JWT_SECRET`, no default); token lifetime configurable (`JWT_EXPIRE_MINUTES`, default 60).
- S5. First admin is created by a command, never by SQL seed: password read interactively (or from an env var for automation), never from argv.
- S6. Schema stays owned by database/init/*.sql; no tables created from Python.
- User request (verbatim): "tiene que haber roles y permisos o algo asi" and, for this task, "ok" in reply to "¿Le asigno el módulo de autenticación?".

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S6 | delegated: opencode via Herdr (user asked to work with helpers) | done | unit 9 passed / 1 skipped; integration 1 passed (rerun by parent); DB left with 0 users, 0 audit rows |
| T2 | S1-S6 | independent verifier: agy via Herdr (Risk item 2) | done | PASS on every S#, no blockers; live probes (alg none, bad signature, expired, non-UUID sub, unknown user) all 401 |

## Log

- L1 (2026-11-18, user, verbatim): "ok" — accepting "¿Le asigno el módulo de autenticación?" with the scope "login con JWT, permisos leídos de la vista `user_permissions` y un comando para crear el primer admin".
- L2: Verifier non-blocking follow-ups (not applied): (1) missing JWT_SECRET makes login return 500 instead of failing at startup (`backend/app/modules/auth/router.py:36`); (2) `jwt.decode` could also pass `options={"require": ["exp", "sub"]}` (`backend/app/modules/auth/dependencies.py:42`); (3) no automated test for `create_admin`.
