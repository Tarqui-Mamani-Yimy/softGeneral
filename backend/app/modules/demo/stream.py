"""Ask the MediaMTX control API whether a stream path is publishing.

The browser cannot check this itself: MediaMTX answers 404 to HEAD requests on
its player pages even when the stream exists, so readiness is checked
server-side through `GET /v3/paths/get/<name>` (`"ready": true`).
"""

import json
import logging
import urllib.error
import urllib.parse
import urllib.request

logger = logging.getLogger(__name__)


class MediaMtxStreamProbe:
    def __init__(self, api_url: str, timeout_seconds: float = 2.0):
        self.api_url = api_url.rstrip("/")
        self.timeout_seconds = timeout_seconds

    def __call__(self, path: str) -> bool:
        url = f"{self.api_url}/v3/paths/get/{urllib.parse.quote(path, safe='')}"
        try:
            with urllib.request.urlopen(url, timeout=self.timeout_seconds) as response:
                return bool(json.loads(response.read()).get("ready"))
        except urllib.error.HTTPError as error:
            if error.code != 404:  # 404 = the path has no publisher yet
                logger.warning("MediaMTX API returned %s for path %s", error.code, path)
            return False
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            logger.warning("MediaMTX API unreachable at %s: %s", self.api_url, error)
            return False
