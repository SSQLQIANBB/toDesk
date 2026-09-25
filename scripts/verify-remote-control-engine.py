"""Verify and relocate a local engine candidate without capture or OS input."""
import argparse
import importlib.util
import json
import os
from pathlib import Path
import secrets
import select
import shutil
import stat
import subprocess
import tempfile
import time
import uuid

from remote_control_ipc import HostIpc, MAX_LINE_BYTES, _encode64

spec = importlib.util.spec_from_file_location("package_engine", Path(__file__).with_name("package-remote-control-engine.py"))
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)


def verify_tree(root):
    manifest = json.loads((root / "manifest.json").read_bytes())
    assert set(manifest) == {"format", "target", "entrypoint", "files"}
    assert manifest["format"] == "todesk-engine-bundle-v1"
    assert manifest["target"] == packaging.TARGET
    assert manifest["entrypoint"] == "bin/remote-control-engine"
    expected = {item["path"]: item for item in manifest["files"]}
    assert list(expected) == sorted(expected) and len(expected) == len(manifest["files"])
    assert len(expected) <= 50_000 and sum(item["size"] for item in expected.values()) <= 2 * 1024**3
    actual, native = set(), 0
    for path in [root, *root.rglob("*")]:
        info = path.lstat()
        assert not stat.S_ISLNK(info.st_mode) and not info.st_mode & 0o022
        relative = path.relative_to(root).as_posix()
        if path.is_dir():
            assert path == root or any(name.startswith(relative + "/") for name in expected)
            continue
        assert stat.S_ISREG(info.st_mode) and info.st_nlink == 1
        if relative == "manifest.json":
            assert not info.st_mode & 0o111
            continue
        actual.add(relative)
        record = expected[relative]
        assert set(record) == {"path", "size", "sha256", "executable"}
        assert info.st_size == record["size"] <= 256 * 1024**2
        assert packaging.digest(path) == record["sha256"]
        assert bool(info.st_mode & 0o111) is record["executable"]
        if packaging.macho(path):
            native += 1
            assert packaging.run("lipo", "-archs", path).strip() == "arm64"
            details = packaging.native_info(path)
            assert not details["rpaths"]
            for dependency in details["dependencies"]:
                if packaging.system_path(dependency):
                    continue
                assert dependency.startswith("@loader_path/")
                resolved = (path.parent / dependency.removeprefix("@loader_path/")).resolve()
                assert resolved.is_relative_to(root) and resolved.is_file()
            packaging.run("codesign", "--verify", "--strict", path)
    assert actual == set(expected)
    return {"files": len(expected), "nativeFiles": native,
            "bytes": sum(item["size"] for item in expected.values()),
            "manifestSha256": packaging.digest(root / "manifest.json")}


def smoke(root, cwd, env, stop):
    key, launch, session = secrets.token_bytes(32), _encode64(secrets.token_bytes(32)), str(uuid.uuid4())
    codec = HostIpc(session, launch, key, "supervisor")
    process = subprocess.Popen([str(root / "bin/remote-control-engine")], cwd=cwd, env=env,
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    raw = json.dumps({"protocolVersion": 1, "sessionId": session, "launchId": launch, "key": _encode64(key)}).encode() + b"\n"
    process.stdin.write(raw)
    process.stdin.flush()
    pending, errors, events = bytearray(), bytearray(), []
    started = time.monotonic()
    ready_ms = None
    deadline = started + 45
    streams = [process.stdout, process.stderr]
    try:
        while time.monotonic() < deadline and streams:
            for stream in select.select(streams, [], [], min(0.1, max(0, deadline - time.monotonic())))[0]:
                chunk = os.read(stream.fileno(), MAX_LINE_BYTES)
                if not chunk:
                    streams.remove(stream)
                    continue
                if stream is process.stderr:
                    errors.extend(chunk)
                    assert len(errors) < 65_536, "excessive diagnostic output"
                    continue
                pending.extend(chunk)
                while b"\n" in pending:
                    length = pending.index(b"\n") + 1
                    event = codec.decode(bytes(pending[:length]))
                    del pending[:length]
                    events.append(event)
                    assert event["kind"] in {"ready", "media-progress", "stopped"}, event["kind"]
                    if event["kind"] == "ready":
                        ready_ms = round((time.monotonic() - started) * 1000)
                        assert event["payload"]["pid"] == process.pid
                        assert event["payload"]["mediaStarted"] is False and event["payload"]["loopbackOnly"] is True
                        if stop:
                            process.stdin.write(codec.encode("stop", {}))
                            process.stdin.flush()
                        else:
                            process.stdin.close()
                    if event["kind"] == "media-progress":
                        assert all(value in (0, "0") for value in event["payload"].values())
                assert len(pending) <= MAX_LINE_BYTES
        assert not pending and process.wait(timeout=2) == 0, "candidate did not stop cleanly"
        assert sum(event["kind"] == "ready" for event in events) == 1
        stopped = [event["payload"] for event in events if event["kind"] == "stopped"]
        assert len(stopped) == 1
        assert stopped[0]["reason"] == ("SUPERVISOR_STOP" if stop else "SUPERVISOR_EOF")
        assert stopped[0]["frames"] == stopped[0]["bytes"] == 0
        assert stopped[0]["screenPid"] is None and stopped[0]["captureStopped"] and stopped[0]["childExited"]
        return {"ready": True, "readyMs": ready_ms, "stopReason": stopped[0]["reason"], "frames": 0}
    except BaseException:
        # Only fixed enum/status diagnostics; never print the inherited bootstrap.
        if errors:
            print(errors.decode("utf-8", errors="replace"))
        raise
    finally:
        if process.poll() is None:
            process.kill()
        process.wait(timeout=3)
        for stream in (process.stdin, process.stdout, process.stderr):
            stream.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("bundle", type=Path)
    parser.add_argument("--static-only", action="store_true", help="check resources without starting the engine")
    args = parser.parse_args()
    root = args.bundle.resolve()
    summary = verify_tree(root)
    if args.static_only:
        print(json.dumps({**summary, "staticOnly": True}))
        return
    original = [smoke(root, root.parent, {}, True), smoke(root, root.parent, {}, True)]
    # Copy all resources, never hardlink; use spaces in the moved location to
    # detect accidental command parsing and absolute developer paths.
    with tempfile.TemporaryDirectory(prefix=".engine-verify-", dir=root.parent) as temporary:
        work = Path(temporary)
        moved = work / "moved engine resources"
        shutil.copytree(root, moved)
        assert verify_tree(moved) == summary
        marker = work / "injected"
        (work / "sitecustomize.py").write_text(f"open({str(marker)!r}, 'w').write('unexpected')\n")
        results = [smoke(moved, work, {}, True), smoke(moved, work, {
            "PYTHONPATH": str(work), "PYTHONHOME": "/does-not-exist",
            "GST_PLUGIN_PATH_1_0": str(work), "GI_TYPELIB_PATH": str(work)}, False)]
        assert not marker.exists()
        for executable, arguments in [("remote-control-engine", ["--test-source-faults"]),
                                      ("remote-control-engine", ["-c", "print('unexpected')"]),
                                      ("remote-control-engine", ["--screen-source", "/bin/true"]),
                                      ("remote-control-screen-source", ["--test-letterbox"])]:
            rejected = subprocess.run([str(moved / "bin" / executable), *arguments], cwd=work, env={},
                                      input=b"", capture_output=True, timeout=5)
            assert rejected.returncode != 0, "candidate accepted a development argument"
        assert verify_tree(moved) == summary, "runtime wrote inside immutable resources"
    print(json.dumps({**summary, "relocation": True, "originalStartup": original,
                      "relocatedStartup": results, "rejectedArgumentCases": 4}))


if __name__ == "__main__":
    main()
