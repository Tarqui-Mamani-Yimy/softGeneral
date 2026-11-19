# Database

PostgreSQL 17 in a local Docker container. The schema is defined only by the
plain SQL files in `init/`; the backend never creates tables.

## Configuration

Create a `.env` file in the repository root (it is ignored by Git):

```dotenv
POSTGRES_DB=softgeneral
POSTGRES_USER=softgeneral
POSTGRES_PASSWORD=change-me
POSTGRES_PORT=5432
DATABASE_URL=postgresql+psycopg://softgeneral:change-me@localhost:5432/softgeneral
```

The port is bound to `127.0.0.1`, so the database is reachable only from this machine.

## Usage

```bash
docker compose up -d db          # start (first start runs init/*.sql)
docker compose ps                # STATUS should say "healthy"
docker compose exec db psql -U softgeneral -d softgeneral   # interactive shell
docker compose stop db           # stop, data is kept
```

## Schema files

| File | Contents |
|---|---|
| `001_extensions_and_types.sql` | `pgcrypto`, `citext`, enum types |
| `002_access_control.sql` | `roles`, `permissions`, `role_permissions`, `users`, `user_permissions` view |
| `003_monitoring.sql` | `cameras`, `zones`, `video_jobs`, `alerts` |
| `004_audit_and_sharing.sql` | `audit_log` (append-only), `share_links` |
| `005_seed_roles_permissions.sql` | Roles `admin` and `guard` with their permissions |

### Roles and permissions

| Permission | admin | guard |
|---|:-:|:-:|
| `alerts.read`, `alerts.review` | ✓ | ✓ |
| `cameras.read` | ✓ | ✓ |
| `videos.upload`, `videos.read` | ✓ | ✓ |
| `cameras.manage`, `zones.manage` | ✓ | |
| `share_links.manage` | ✓ | |
| `users.manage`, `audit.read` | ✓ | |

The API must check **permissions**, not role names. A new role is just new
rows in `roles` and `role_permissions`.

No users are seeded: the first admin is created through the backend, so no
password hash is stored in the repository.

## Changing the schema

Scripts in `init/` run **only on the first start of an empty volume**.

- While there is no data worth keeping: edit the files and recreate the database:
  ```bash
  docker compose down -v && docker compose up -d db
  ```
  `-v` **deletes all local data**.
- Once there is data to keep: add a new numbered file (`006_*.sql`) and apply it
  by hand:
  ```bash
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U softgeneral -d softgeneral < database/init/006_example.sql
  ```

## Schema test

```bash
docker compose exec -T db psql -v ON_ERROR_STOP=1 -U softgeneral -d softgeneral < database/tests/verify_schema.sql
```

It runs inside a transaction that is rolled back and prints
`schema checks passed`; any failed check aborts with an error.
