from app.modules.videos.repository import VideoRepository


def get_video_repository() -> VideoRepository:
    return VideoRepository()
