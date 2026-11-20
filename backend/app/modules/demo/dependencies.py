from collections.abc import Callable

from fastapi import Request

from app.modules.demo.repository import DemoRepository
from app.modules.demo.stream import MediaMtxStreamProbe


def get_demo_repository() -> DemoRepository:
    return DemoRepository()


def get_stream_probe(request: Request) -> Callable[[str], bool]:
    return MediaMtxStreamProbe(request.app.state.settings.mediamtx_api_url)
