"""Benchmark identical decoder pixels; no labels, network or database access.

Use a fixed cgroup CPU quota on Linux for a resource-controlled comparison.
macOS runs are explicitly marked as exploratory, not quota-controlled.
"""

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import platform
import shutil
import subprocess
import time


def cpu_budget():
    try:
        quota, period = Path("/sys/fs/cgroup/cpu.max").read_text().split()
        if quota != "max":
            return int(quota) / int(period)
    except (OSError, ValueError):
        pass
    return None


def decode(video, threads, height):
    command = ["ffmpeg", "-nostdin", "-protocol_whitelist", "file,pipe",
               "-format_whitelist", "mov,matroska,webm", "-v", "error",
               "-threads", str(threads), "-filter_threads", "1", "-i", str(video),
               "-vf", f"fps=1,scale=1280:720,format=rgb24,crop=1280:{height}:0:0",
               "-frames:v", "600", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"]
    started = time.monotonic()
    digest = hashlib.sha256()
    size = 0
    # wait4 supplies usage for this child, rather than a cumulative process max.
    with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL) as child:
        assert child.stdout is not None
        for chunk in iter(lambda: child.stdout.read(1024 * 1024), b""):
            digest.update(chunk)
            size += len(chunk)
        _, status, usage = os.wait4(child.pid, 0)
        child.returncode = os.waitstatus_to_exitcode(status)
        if child.returncode:
            raise RuntimeError(f"Decoder failed with status {child.returncode}")
    frame_bytes = 1280 * height * 3
    if not size or size % frame_bytes:
        raise RuntimeError("Decoder produced incomplete or empty frame data")
    rss_bytes = usage.ru_maxrss * (1 if platform.system() == "Darwin" else 1024)
    return {"threads": threads, "wallSeconds": time.monotonic() - started,
            "decoderCpuSeconds": usage.ru_utime + usage.ru_stime,
            "decoderPeakRssBytes": rss_bytes, "frames": size // frame_bytes,
            "rgbSha256": digest.hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--cases", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--height", type=int, default=197)
    parser.add_argument("--rounds", type=int, default=2)
    parser.add_argument("--require-cpus", type=float)
    args = parser.parse_args()
    if not 1 <= args.height <= 720 or not 1 <= args.rounds <= 5:
        parser.error("Height must be 1..720 and rounds 1..5")
    quota = cpu_budget()
    if args.require_cpus is not None and (
        not math.isfinite(args.require_cpus) or args.require_cpus <= 0 or quota is None
        or abs(quota - args.require_cpus) > .001
    ):
        parser.error("Actual cgroup CPU quota does not match --require-cpus")
    cases = json.loads(args.cases.read_text())
    if not isinstance(cases, list) or not 1 <= len(cases) <= 100:
        parser.error("Expected 1..100 local benchmark cases")
    if len({case["matchKey"] for case in cases}) != len(cases):
        parser.error("Duplicate match")
    for case in cases:
        if not Path(case["video"]).is_file() or Path(case["video"]).stat().st_size > 96 * 1024 * 1024:
            parser.error("Missing or oversized local video")
    args.output.mkdir(mode=0o700, parents=True, exist_ok=False)
    rows = []
    hashes = {}
    for round_index in range(args.rounds):
        for case in cases if round_index % 2 == 0 else reversed(cases):
            video = Path(case["video"])
            media_hash = hashlib.sha256(video.read_bytes()).hexdigest()
            for threads in ([1, 2, 4] if round_index % 2 == 0 else [4, 2, 1]):
                row = {"matchKey": case["matchKey"], "round": round_index + 1,
                       "mediaSha256": media_hash, **decode(video, threads, args.height)}
                prior = hashes.setdefault(case["matchKey"], (media_hash, row["rgbSha256"], row["frames"]))
                if prior != (media_hash, row["rgbSha256"], row["frames"]):
                    raise RuntimeError("Decoder resource settings changed sampled pixels or frame count")
                rows.append(row)
                print(json.dumps(row), flush=True)
                path = args.output / "measurements.json"
                path.write_text(json.dumps(rows, indent=2) + "\n")
                path.chmod(0o600)
    ffmpeg = shutil.which("ffmpeg")
    assert ffmpeg
    metadata = {"system": platform.platform(), "logicalCpus": os.cpu_count(),
                "cgroupCpuQuota": quota, "quotaControlled": quota is not None,
                "decoderBandHeight": args.height, "rounds": args.rounds,
                "ffmpegVersion": subprocess.check_output([ffmpeg, "-version"], text=True).splitlines()[0],
                "note": "Decoder-only. Wall time includes pipe hashing; CPU/RSS cover the FFmpeg child, not the OCR service. No OCR accuracy claim."}
    path = args.output / "metadata.json"
    path.write_text(json.dumps(metadata, indent=2) + "\n")
    path.chmod(0o600)


if __name__ == "__main__":
    main()
