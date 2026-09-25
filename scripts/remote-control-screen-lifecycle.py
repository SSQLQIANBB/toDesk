"""Real SCK/H264 source stop checks. Frames are discarded from inherited pipes.

No network and no OS input. Requires already granted screen permission.
"""
import json
import os
from pathlib import Path
import select
import signal
import struct
import subprocess
import sys
import tempfile
import threading
import time


class Source:
    def __init__(self, executable, inherited_diagnostics=False):
        self.process = subprocess.Popen([executable], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                                        stderr=sys.stdout if inherited_diagnostics else subprocess.PIPE,
                                        bufsize=0)
        self.heartbeat_stopped = threading.Event()
        self.frames = 0
        self.stats = None
        self.errors = []
        self.output_closed = False
        self.heartbeat_thread = threading.Thread(target=self.heartbeat, daemon=True)
        self.heartbeat_thread.start()
        self.reader = threading.Thread(target=self.drain, daemon=True)
        self.reader.start()
        self.diagnostics = None
        if not inherited_diagnostics:
            self.diagnostics = threading.Thread(target=self.read_diagnostics, daemon=True)
            self.diagnostics.start()

    def heartbeat(self):
        while not self.heartbeat_stopped.is_set() and self.process.poll() is None:
            try:
                self.process.stdin.write(b"heartbeat\n")
                self.process.stdin.flush()
            except (BrokenPipeError, OSError, ValueError):
                return
            self.heartbeat_stopped.wait(0.3)

    def drain(self):
        def exact(size):
            result = bytearray()
            while len(result) < size:
                try:
                    chunk = os.read(self.process.stdout.fileno(), size - len(result))
                except (OSError, ValueError):
                    return None
                if not chunk:
                    return None
                result.extend(chunk)
            return result
        while not self.output_closed:
            header = exact(12)
            if header is None:
                return
            size, _pts = struct.unpack(">IQ", header)
            if not 0 < size <= 4 * 1024 * 1024:
                self.errors.append("invalid frame size")
                return
            if exact(size) is None:
                return
            self.frames += 1

    def read_diagnostics(self):
        for line in self.process.stderr:
            message = json.loads(line)
            if message.get("type") == "screen-source-stopped":
                self.stats = message
            elif message.get("type") == "error":
                self.errors.append(message)

    def wait_for_frames(self):
        deadline = time.monotonic() + 10
        while self.frames < 8 and self.process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.02)
        if self.frames < 8:
            self.close()
            raise AssertionError(f"Real capture did not start: {self.stats}, {self.errors}")

    def stop_heartbeats(self):
        self.heartbeat_stopped.set()
        self.heartbeat_thread.join(timeout=1)

    def close(self):
        self.stop_heartbeats()
        if self.process.poll() is None:
            try:
                self.process.stdin.close()
            except OSError:
                pass
            try:
                self.process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.process.kill()
                self.process.wait(timeout=3)


def check_stop(executable, mode, expected):
    source = Source(executable)
    try:
        source.wait_for_frames()
        started = time.monotonic()
        source.stop_heartbeats()
        if mode == "stop":
            source.process.stdin.write(b"stop\n")
        elif mode == "stdin-close":
            source.process.stdin.close()
        elif mode == "stdout-close":
            source.output_closed = True
            source.process.stdout.close()
        elif mode == "sigterm":
            source.process.terminate()
        # timeout deliberately keeps both pipes open but sends no heartbeat.
        source.process.wait(timeout=5)
        elapsed = round((time.monotonic() - started) * 1000)
        source.diagnostics.join(timeout=1)
        assert source.process.returncode == 0, (mode, source.errors, source.stats)
        assert source.stats and source.stats.get("captureStopped"), (mode, source.stats)
        assert source.stats["reason"] in expected, (mode, source.stats)
        assert elapsed < (4000 if mode == "timeout" else 1500), (mode, elapsed)
        return {"mode": mode, "stopMs": elapsed, "exitCode": source.process.returncode,
                "framesBeforeStop": source.frames, "reason": source.stats["reason"],
                "captureStopped": True, "encodedFrames": source.stats["encodedFrames"]}
    finally:
        source.close()


def check_parent_kill(executable):
    supervisor = subprocess.Popen([sys.executable, __file__, "--supervisor", executable],
                                  stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
    child_pid = None
    child_exited = False
    try:
        deadline = time.monotonic() + 12
        while time.monotonic() < deadline:
            ready, _, _ = select.select([supervisor.stdout], [], [], 0.1)
            if not ready:
                continue
            line = supervisor.stdout.readline()
            if not line:
                break
            message = json.loads(line)
            if message.get("type") == "supervisor-ready":
                child_pid = message["childPid"]
                break
        assert child_pid, "Supervisor did not receive actual encoded screen frames"
        started = time.monotonic()
        supervisor.kill()
        output, errors = supervisor.communicate(timeout=5)
        elapsed = round((time.monotonic() - started) * 1000)
        messages = [json.loads(line) for line in output.splitlines()]
        stats = next((message for message in messages if message.get("type") == "screen-source-stopped"), None)
        assert stats and stats.get("captureStopped"), (messages, errors)
        assert stats["reason"] in ["SUPERVISOR_PIPE_CLOSED", "OUTPUT_PIPE_CLOSED"], stats
        assert elapsed < 1500, elapsed
        # waitpid belongs to the killed supervisor; detect the orphan's actual
        # disappearance (a brief launchd reaping delay is allowed).
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            try:
                os.kill(child_pid, 0)
            except ProcessLookupError:
                child_exited = True
                break
            time.sleep(0.05)
        else:
            raise AssertionError(f"Screen source remains after supervisor death: {child_pid}")
        return {"mode": "parent-sigkill", "stopMs": elapsed, "parentExitCode": supervisor.returncode,
                "reason": stats["reason"], "captureStopped": True, "childExited": True,
                "encodedFrames": stats["encodedFrames"]}
    finally:
        if supervisor.poll() is None:
            supervisor.kill()
            supervisor.wait(timeout=2)
        if child_pid and not child_exited:
            try:
                os.kill(child_pid, signal.SIGTERM)
            except ProcessLookupError:
                pass


def main():
    if len(sys.argv) == 3 and sys.argv[1] == "--supervisor":
        source = Source(sys.argv[2], inherited_diagnostics=True)
        source.wait_for_frames()
        print(json.dumps({"type": "supervisor-ready", "childPid": source.process.pid}), flush=True)
        source.process.wait(timeout=45)
        return
    with tempfile.TemporaryDirectory(prefix="todesk-screen-lifecycle-") as directory:
        executable = str(Path(directory) / "screen-source")
        subprocess.run(["xcrun", "swiftc", "-parse-as-library", str(Path(__file__).with_name("remote-control-screen-source.swift")), "-o", executable], check=True, timeout=60)
        cases = [("stop", ["LOCAL_STOP"]), ("stdin-close", ["SUPERVISOR_PIPE_CLOSED"]),
                 ("stdout-close", ["OUTPUT_PIPE_CLOSED"]), ("timeout", ["SUPERVISOR_TIMEOUT"]),
                 ("sigterm", ["TERMINATED"])]
        results = [check_stop(executable, mode, expected) for mode, expected in cases]
        results.append(check_parent_kill(executable))
        print(json.dumps({"status": "passed", "source": "screen", "framesStored": 0, "cases": results}))


if __name__ == "__main__":
    main()
