import threading
import time

import numpy as np

from vision.sources.rtsp import RTSPSource


class FakeCapture:
    def __init__(self, frames):
        self.frames = iter(frames)
        self.opened = True

    def isOpened(self): return self.opened
    def read(self):
        try: return True, next(self.frames)
        except StopIteration: return False, None
    def release(self): self.opened = False
    def get(self, prop): return {5: 10.0, 3: 4, 4: 4, 7: 0}.get(prop, 0)


class MetadataCapture(FakeCapture):
    def get(self, prop): return {5: 30.0, 3: 0, 4: 0, 7: 0}.get(prop, 0)


def test_rtsp_source_keeps_latest_and_counts_drops():
    captures = [FakeCapture([np.full((4, 4, 3), value, dtype=np.uint8) for value in range(5)])]
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: captures.pop(0), reconnect_initial=0.001)
    source.start()
    time.sleep(0.03)
    frame = source.read(timeout=0.2)
    source.close()

    assert frame is not None
    assert int(frame[0, 0, 0]) == 4
    assert source.dropped_frames >= 1


def test_rtsp_source_reconnects_after_failure_and_closes():
    captures = [FakeCapture([]), FakeCapture([np.ones((4, 4, 3), dtype=np.uint8) * 9])]
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: captures.pop(0), reconnect_initial=0.001)
    source.start()
    deadline = time.time() + 1
    frame = None
    while time.time() < deadline and frame is None:
        frame = source.read(timeout=0.05)
    source.close()

    assert frame is not None
    assert int(frame[0, 0, 0]) == 9
    assert not source.is_running


def test_rtsp_source_derives_dimensions_from_first_frame():
    captures = [MetadataCapture([np.ones((6, 8, 3), dtype=np.uint8)])]
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: captures.pop(0), reconnect_initial=0.001)
    source.start()
    assert source.frame_size == (8, 6)
    source.close()


class SlowStartCapture:
    """Real RTSP behaviour seen in the seam test: metadata says 0x0 at 30 fps,
    the first frame arrives late and then frames come at 10 fps."""

    def __init__(self, first_delay=0.3, interval=0.1, count=40, shape=(6, 8, 3)):
        self.first_delay, self.interval, self.left, self.shape = first_delay, interval, count, shape
        self.opened, self.started = True, False
        self.released_by = None

    def isOpened(self): return self.opened
    def get(self, prop): return {5: 30.0, 3: 0, 4: 0, 7: 0}.get(prop, 0)

    def read(self):
        time.sleep(self.interval if self.started else self.first_delay)
        self.started = True
        if self.left <= 0 or not self.opened:
            return False, None
        self.left -= 1
        return True, np.ones(self.shape, dtype=np.uint8)

    def release(self):
        self.released_by = threading.current_thread().name
        self.opened = False


def test_start_waits_for_the_first_frame_before_reporting_its_size():
    capture = SlowStartCapture(first_delay=0.3)
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: capture, reconnect_initial=0.001)
    source.start()
    try:
        assert source.frame_size == (8, 6)
    finally:
        source.close()


def test_fps_is_measured_when_the_stream_reports_a_wrong_rate():
    capture = SlowStartCapture(first_delay=0.05, interval=0.1)
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: capture, reconnect_initial=0.001)
    source.start()
    try:
        assert 8.0 <= source.fps <= 12.5
    finally:
        source.close()


def test_plausible_reported_fps_is_kept():
    captures = [FakeCapture([np.ones((4, 4, 3), dtype=np.uint8)] * 5)]
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: captures.pop(0), reconnect_initial=0.001)
    source.start()
    try:
        assert source.fps == 10.0
    finally:
        source.close()


def test_close_releases_the_capture_on_the_reader_thread_only():
    capture = SlowStartCapture(first_delay=0.01, interval=0.05, count=1000)
    source = RTSPSource("rtsp://camera", capture_factory=lambda *_: capture, reconnect_initial=0.001)
    source.start()
    source.close()

    assert not source.is_running
    assert capture.released_by == "rtsp-reader"
