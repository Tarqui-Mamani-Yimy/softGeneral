from app.modules.banned_persons.repository import BannedPersonRepository

_repository = BannedPersonRepository()


def get_banned_person_repository() -> BannedPersonRepository:
    return _repository

