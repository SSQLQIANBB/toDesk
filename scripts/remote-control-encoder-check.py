"""Exercise the exact production H.264 setup with synthetic buffers on macOS.

Does not capture a display, post OS input, request permissions, or save frames.
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
    marker = "#if REMOTE_CONTROL_TEST_FAULTS\nprivate struct SourceTestOptions"
    if source.count(marker) != 1:
        raise SystemExit("Source helper boundary changed; update the encoder regression boundary.")
    with tempfile.TemporaryDirectory(prefix="todesk-encoder-check-") as directory:
        combined = Path(directory) / "encoder-tests.swift"
        executable = Path(directory) / "encoder-tests"
        combined.write_text(source.partition(marker)[0] + "\n" + (scripts / "remote-control-encoder-tests.swift").read_text())
        subprocess.run(["xcrun", "swiftc", "-parse-as-library", str(combined), "-o", str(executable)],
                       check=True, timeout=60)
        subprocess.run([str(executable)], check=True, timeout=30)


if __name__ == "__main__":
    main()
