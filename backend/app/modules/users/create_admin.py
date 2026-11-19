import argparse
import getpass

from pwdlib import PasswordHash
from sqlalchemy import text

from app.core.config import Settings
from app.core.database import build_engine, build_session_factory


def main() -> None:
    parser = argparse.ArgumentParser(description="Create the first softGeneral admin user")
    parser.add_argument("--username", required=True)
    parser.add_argument("--email", required=True)
    parser.add_argument("--full-name", required=True)
    args = parser.parse_args()
    password = __import__("os").environ.get("ADMIN_PASSWORD")
    if password is None:
        password = getpass.getpass("Admin password: ")
        if password != getpass.getpass("Confirm admin password: "):
            raise SystemExit("Passwords do not match")
    settings = Settings()
    factory = build_session_factory(build_engine(settings.database_url))
    with factory() as session, session.begin():
        exists = session.execute(text("SELECT 1 FROM users WHERE username = :username OR email = :email"), vars(args)).first()
        if exists:
            raise SystemExit("A user with that username or email already exists")
        role_id = session.execute(text("SELECT id FROM roles WHERE code = 'admin'")).scalar_one()
        session.execute(
            text("""INSERT INTO users (username, email, full_name, password_hash, role_id)
                   VALUES (:username, :email, :full_name, :password_hash, :role_id)"""),
            {**vars(args), "password_hash": PasswordHash.recommended().hash(password), "role_id": role_id},
        )
    print(f"Created admin user {args.username}")


if __name__ == "__main__":
    main()
