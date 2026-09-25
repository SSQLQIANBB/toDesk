"""Compile real source geometry helpers with synthetic CVPixelBuffers on macOS.

No SCStream is created, no display is captured, and no OS input is posted.
Only Swift source and its test executable are written to a temporary directory.
Run: python3 scripts/remote-control-geometry-check.py
"""
from pathlib import Path
import subprocess
import sys
import tempfile


def main():
    if sys.platform != "darwin":
        raise SystemExit("This regression requires the macOS SDK and xcrun swiftc.")
    scripts = Path(__file__).resolve().parent
    source = (scripts / "remote-control-screen-source.swift").read_text()
    # Compile the exact production helpers, not a copied geometry implementation.
    # The source's capture runtime and both of its CLI modes are excluded.
    marker = "#if REMOTE_CONTROL_TEST_FAULTS\nprivate struct SourceTestOptions"
    if source.count(marker) != 1:
        raise SystemExit("Source helper boundary changed; update the geometry regression boundary.")
    helpers = source.partition(marker)[0]
    tests = (scripts / "remote-control-screen-geometry-tests.swift").read_text()
    with tempfile.TemporaryDirectory(prefix="todesk-geometry-check-") as directory:
        combined = Path(directory) / "geometry-tests.swift"
        executable = Path(directory) / "geometry-tests"
        combined.write_text(helpers + "\n" + tests)
        subprocess.run(["xcrun", "swiftc", "-parse-as-library", str(combined), "-o", str(executable)],
                       check=True, timeout=60)
        subprocess.run([str(executable)], check=True, timeout=10)


if __name__ == "__main__":
    main()
