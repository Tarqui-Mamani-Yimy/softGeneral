from app.modules.cameras.repository import CameraRepository


def get_camera_repository() -> CameraRepository:
    return CameraRepository()
