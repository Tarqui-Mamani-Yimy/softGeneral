import os
import shutil
import subprocess

import cv2
import numpy as np
import pytest

from vision.annotation.writer import VideoWriter
from vision.media.transcode import transcode_to_h264


def make_video(path):
    with VideoWriter(path, 5, (20, 20)) as writer:
        for value in range(3):
            writer.write(np.full((20, 20, 3), value * 40, dtype=np.uint8))


@pytest.mark.skipif(shutil.which("ffmpeg") is None or shutil.which("ffprobe") is None, reason="ffmpeg and ffprobe are required")
def test_video_writer_outputs_h264_readable_by_opencv(tmp_path, monkeypatch):
    monkeypatch.setenv("VIDEO_TRANSCODE_H264", "true")
    path = tmp_path / "output.mp4"

    make_video(path)
    codec = subprocess.check_output(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path)], text=True).strip()
    capture = cv2.VideoCapture(str(path))
    count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    capture.release()

    assert codec == "h264"
    assert count == 3


def test_missing_ffmpeg_keeps_file_and_removes_temp(tmp_path, monkeypatch, caplog):
    monkeypatch.setenv("FFMPEG_BINARY", str(tmp_path / "missing-ffmpeg"))
    monkeypatch.setenv("VIDEO_TRANSCODE_H264", "true")
    path = tmp_path / "fallback.mp4"

    make_video(path)

    assert path.is_file()
    assert any("H.264" in record.message for record in caplog.records)
    assert not list(tmp_path.glob("*.tmp.mp4"))


def test_nonzero_ffmpeg_keeps_file_and_disabled_skips_call(tmp_path, monkeypatch, caplog):
    fake = tmp_path / "ffmpeg-fails"
    fake.write_text("#!/bin/sh\nexit 1\n")
    fake.chmod(0o755)
    path = tmp_path / "nonzero.mp4"
    monkeypatch.setenv("FFMPEG_BINARY", str(fake))
    monkeypatch.setenv("VIDEO_TRANSCODE_H264", "true")

    make_video(path)
    assert path.is_file()
    assert any("H.264" in record.message for record in caplog.records)
    assert not list(tmp_path.glob("*.tmp.mp4"))

    monkeypatch.setenv("VIDEO_TRANSCODE_H264", "false")
    caplog.clear()
    assert transcode_to_h264(path) is False
    assert not caplog.records
