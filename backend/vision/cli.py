from __future__ import annotations

import argparse
from pathlib import Path
from time import perf_counter

import cv2
import numpy as np

from vision.annotation.writer import VideoWriter
from vision.detection.registry import ModelRegistry
from vision.pipeline import process_video
from vision.sources.file import FileSource


def test_model(name: str, image_path: str | None) -> None:
    analyzer = ModelRegistry().load(name)
    frame = cv2.imread(image_path) if image_path else np.zeros((224, 224, 3), dtype=np.uint8)
    if frame is None:
        raise SystemExit(f"Unable to read image: {image_path}")
    timings = []
    for _ in range(3):
        started = perf_counter()
        analyzer.predict(frame)
        timings.append((perf_counter() - started) * 1000)
    names = analyzer.names.values() if isinstance(analyzer.names, dict) else analyzer.names
    print(f"{name}: classes={list(names)} mean_cpu_ms={sum(timings) / len(timings):.2f}")


def process_video_command(input_path: str, output_path: str, models: str, stride: int) -> None:
    registry = ModelRegistry()
    with FileSource(input_path) as source, VideoWriter(output_path, source.fps, source.frame_size) as writer:
        summary = process_video(source, writer, [registry.load(name) for name in models.split(",") if name], stride=stride, on_progress=lambda value: print(f"progress={value}%"))
    print(summary)


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the softGeneral vision pipeline")
    subparsers = parser.add_subparsers(dest="command", required=True)
    test_parser = subparsers.add_parser("test-model")
    test_parser.add_argument("name")
    test_parser.add_argument("--image")
    process_parser = subparsers.add_parser("process-video")
    process_parser.add_argument("input")
    process_parser.add_argument("output")
    process_parser.add_argument("--models", default="futbol,armas,fuegoHumo,peleas")
    process_parser.add_argument("--stride", type=int, default=2)
    args = parser.parse_args()
    if args.command == "test-model":
        test_model(args.name, args.image)
    else:
        process_video_command(args.input, args.output, args.models, args.stride)


if __name__ == "__main__":
    main()
