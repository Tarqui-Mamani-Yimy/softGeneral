Objective: bootstrap the softGeneral project (local DB container with SQL files + RBAC, backend and frontend skeletons).
Branch: feat/project-bootstrap · Delivery: ask-on-risk · Test runner: pytest (backend), npm build/lint (frontend), psql checks (database).

## Specs

- S1. Database defined in plain SQL files: "la base de datos, quiero que se haga con archivos .sql".
- S2. Local database container: "create un contenedor para la base de datos, que de momento solo sera para uso Local". Bound to 127.0.0.1 only; credentials via a gitignored `.env`.
- S3. Roles and permissions: "tiene que haber roles y permisos o algo asi". RBAC tables (roles, permissions, role_permissions, users) seeded with the roles already in planning.md: admin and guard (planning.md "JWT con roles `guardia` y `admin`").
- S4. Schema covers the MVP entities from planning.md: cameras, zones, video jobs, alerts (confirm / false alarm), audit log (traceability), public share links (token with expiry).
- S5. Work with helpers: "como ayudantes tienes a opencode y agy, via HerdrCLI en donde quiero que trabajes con ellos". Assumption: architecture is the recommended modular monolith + separate worker (user did not object).
- S6. Backend skeleton (FastAPI, modular by business module, health endpoint with DB check, worker placeholder). No ORM-created schema: the SQL files own the schema.
- S7. Frontend skeleton (React + Vite + TypeScript + Tailwind, private/public page split).

## Tasks

| ID | Specs | Route | Status | Evidence |
|---|---|---|---|---|
| T1 | S1-S4 | inline (Claude) | pending | |
| T2 | S5-S6 | delegated: opencode via Herdr (parallel unit, disjoint surface `backend/`) | pending | |
| T3 | S5, S7 | delegated: agy via Herdr (parallel unit, disjoint surface `frontend/`) | pending | |
| T4 | all | inline: seam check (compose up, backend health against DB, frontend build) | pending | |

## Log

- L1 (2026-11-18, user, verbatim): "armemos el proyecto, quiero que sepas que como ayudantes tienes a opencode y agy, via HerdrCLI en donde quiero que trabajes con ellos, para esto como crees que deberiamos de empezzar a armar el proyecto, tiene que haber roles y permisos o algo asi (la base de datos, quiero que se haga con archivos .sql) y create un contenedor para la base de datos, que de momento solo sera para uso Local"
- L2: Writer trigger (a) parallelism: backend and frontend skeletons are independent units with disjoint surfaces, launched together. Parent owns git, root files (`docker-compose.yml`, `.env.example`, `.gitignore`) and `database/`.
