import asyncio
import json
import logging
import math
from typing import Any, Callable
from uuid import UUID

from starlette.websockets import WebSocket, WebSocketDisconnect

from app.modules.alerts.repository import AlertRecord
from app.modules.alerts.schemas import AlertResponse
from app.modules.auth.repository import UserRepository

logger = logging.getLogger(__name__)


def record_to_public_dict(record: AlertRecord) -> dict[str, Any]:
    response = AlertResponse(
        id=record.id,
        alert_type=record.alert_type,
        status=record.status,
        confidence=record.confidence,
        occurred_at=record.occurred_at,
        camera_id=record.camera_id,
        video_job_id=record.video_job_id,
        track_id=record.track_id,
        details=record.details,
        has_snapshot=record.has_snapshot,
        has_clip=record.has_clip,
        reviewed_by=record.reviewed_by,
        reviewed_at=record.reviewed_at,
        review_notes=record.review_notes,
        created_at=record.created_at or record.occurred_at,
    )
    return response.model_dump(mode="json")


CAMERA_METRICS_PERMISSION = "cameras.read"
_NUMBER_FIELDS = ("analysis_fps", "published_fps", "dropped_frames", "people_tracked")


def _is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_camera_metrics(raw: str | bytes | dict) -> dict[str, Any] | None:
    """Validate a camera_metrics payload; return the WebSocket message or None when malformed.

    Only whitelisted fields are copied, so nothing else a publisher sends (paths, URLs)
    can reach a browser.
    """
    try:
        payload = json.loads(raw) if not isinstance(raw, dict) else raw
        if not isinstance(payload, dict):
            return None
        camera_id = str(UUID(str(payload["camera_id"])))
        metrics: dict[str, Any] = {}
        for field in _NUMBER_FIELDS:
            if not _is_number(payload[field]):
                return None
            metrics[field] = payload[field]
        latency = payload["frame_to_alert_ms"]
        if latency is not None and not _is_number(latency):
            return None
        metrics["frame_to_alert_ms"] = latency
        detections = payload["detections"]
        if not isinstance(detections, dict) or not all(isinstance(k, str) and _is_number(v) for k, v in detections.items()):
            return None
        metrics["detections"] = detections
        if not isinstance(payload["updated_at"], str):
            return None
        metrics["updated_at"] = payload["updated_at"]
    except Exception:
        return None
    return {"type": "camera_metrics", "camera_id": camera_id, "metrics": metrics}


class BroadcasterClient:
    def __init__(self, websocket: Any, user_id: UUID, queue_size: int = 50, permissions: Any = ()):
        self.websocket = websocket
        self.user_id = user_id
        self.permissions = frozenset(permissions)
        self.queue: asyncio.Queue[dict | None] = asyncio.Queue(maxsize=queue_size)
        self.dropped = False
        self._closed = False
        self.close_code = 1000
        try:
            self.loop = asyncio.get_running_loop()
        except RuntimeError:
            self.loop = None

    def enqueue(self, message: dict | None) -> bool:
        if self._closed or (self.dropped and message is not None):
            return False
        if message is None:
            self.dropped = True

        try:
            current_loop = asyncio.get_running_loop()
        except RuntimeError:
            current_loop = None

        if current_loop is self.loop or self.loop is None:
            try:
                self.queue.put_nowait(message)
                return True
            except asyncio.QueueFull:
                self.dropped = True
                logger.warning("Dropping slow WebSocket client for user %s (queue full)", self.user_id)
                return False
        else:
            try:
                if self.queue.full() and message is not None:
                    self.dropped = True
                    return False
                self.loop.call_soon_threadsafe(self.queue.put_nowait, message)
                return True
            except Exception:
                self.dropped = True
                return False

    async def close(self, code: int = 1000) -> None:
        if self._closed:
            return
        self._closed = True
        self.close_code = code
        try:
            await self.websocket.close(code=code)
        except Exception:
            pass

    async def run_sender(self) -> None:
        try:
            while True:
                msg = await self.queue.get()
                if msg is None or self._closed:
                    break
                await self.websocket.send_json(msg)
        except (WebSocketDisconnect, asyncio.CancelledError, Exception):
            pass
        finally:
            self._closed = True
            try:
                await self.websocket.close(code=self.close_code)
            except Exception:
                pass


class AlertBroadcaster:
    def __init__(
        self,
        session_factory: Callable | None = None,
        user_repository_factory: Callable | None = None,
    ):
        self.session_factory = session_factory
        self.user_repository_factory = user_repository_factory or UserRepository
        self.clients: set[BroadcasterClient] = set()
        self._lock = asyncio.Lock()

    def add_client(self, client: BroadcasterClient) -> None:
        self.clients.add(client)

    def remove_client(self, client: BroadcasterClient) -> None:
        self.clients.discard(client)

    def connect(self, websocket: WebSocket, user_id: UUID, queue_size: int = 50, permissions: Any = ()) -> BroadcasterClient:
        client = BroadcasterClient(websocket, user_id, queue_size=queue_size, permissions=permissions)
        self.add_client(client)
        return client

    def disconnect(self, client: BroadcasterClient) -> None:
        self.remove_client(client)

    def _find_inactive_user_ids(self, user_ids: set[UUID]) -> set[UUID]:
        """Blocking DB lookup; call it through asyncio.to_thread from async code."""
        user_repo = self.user_repository_factory()
        inactive_ids: set[UUID] = set()
        with self.session_factory() as session:
            for uid in user_ids:
                user = user_repo.get_by_id(session, uid)
                if user is None or not user.is_active:
                    inactive_ids.add(uid)
        return inactive_ids

    async def check_active_users(self) -> None:
        if not self.session_factory or not self.clients:
            return

        user_ids = {c.user_id for c in self.clients}
        try:
            # Run the database query off the event loop so a slow query never
            # freezes the API; client bookkeeping stays on the loop thread.
            inactive_ids = await asyncio.to_thread(self._find_inactive_user_ids, user_ids)
        except Exception as exc:
            logger.debug("Failed to verify active users in broadcaster: %s", exc)
            return

        for client in list(self.clients):
            if client.user_id in inactive_ids:
                self.drop_client(client, code=1008)

    def drop_client(self, client: BroadcasterClient, code: int = 1008) -> None:
        self.remove_client(client)
        client.dropped = True
        client.close_code = code
        client.enqueue(None)

    async def broadcast(self, payload: dict, permission: str | None = None) -> None:
        await self.check_active_users()

        for client in list(self.clients):
            if permission is not None and permission not in client.permissions:
                continue
            ok = client.enqueue(payload)
            if not ok:
                self.drop_client(client, code=1008)

    async def broadcast_alert_record(self, record: AlertRecord) -> None:
        public_dict = record_to_public_dict(record)
        await self.broadcast({"type": "alert", "alert": public_dict})

    async def broadcast_camera_metrics(self, raw: str | bytes | dict) -> bool:
        message = parse_camera_metrics(raw)
        if message is None:
            return False
        await self.broadcast(message, permission=CAMERA_METRICS_PERMISSION)
        return True
