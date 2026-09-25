"""Standard-library tests, including the vector verified by native Rust."""
import base64
import hashlib
import hmac
import json
from pathlib import Path
import unittest

from remote_control_ipc import HostIpc, IpcError, MAX_BODY_BYTES, MAX_LINE_BYTES

FIXTURE = json.loads((Path(__file__).resolve().parents[1] / "fixtures/remote-control-ipc-v1.json").read_text())


def pair():
    bootstrap = FIXTURE["bootstrap"]
    parent = HostIpc(bootstrap["sessionId"], bootstrap["launchId"], bytes([5]) * 32, "supervisor")
    child = HostIpc.accept_bootstrap(json.dumps(bootstrap).encode() + b"\n")
    return parent, child


def forged(body):
    encoded = base64.urlsafe_b64encode(body.encode()).decode().rstrip("=")
    signature = hmac.new(bytes([5]) * 32, ("todesk-host-ipc/v1\nsupervisor-to-engine\n" + encoded).encode(), hashlib.sha256).digest()
    return json.dumps({"format":"rc-ipc-v1", "payload":encoded, "mac":base64.urlsafe_b64encode(signature).decode().rstrip("=")}).encode() + b"\n"


class IpcTests(unittest.TestCase):
    def test_cross_language_vector(self):
        parent, child = pair()
        self.assertEqual(parent.encode("heartbeat", {"sample":1}).decode(), FIXTURE["supervisorLine"])
        self.assertEqual(child.encode("ready", {"protocolVersion":1}).decode(), FIXTURE["engineLine"])
        self.assertEqual(child.decode(FIXTURE["supervisorLine"].encode()), {"kind":"heartbeat", "payload":{"sample":1}})
        self.assertEqual(parent.decode(FIXTURE["engineLine"].encode())["kind"], "ready")

    def test_replay_and_failure_are_terminal(self):
        parent, child = pair()
        frame = parent.encode("heartbeat", {})
        child.decode(frame)
        with self.assertRaises(IpcError): child.decode(frame)
        with self.assertRaises(IpcError): child.decode(parent.encode("stop", {}))
        with self.assertRaises(IpcError): child.encode("stopped", {})

    def test_reflection_and_gaps(self):
        parent, child = pair()
        first = parent.encode("heartbeat", {})
        with self.assertRaises(IpcError): parent.decode(first)
        parent, child = pair()
        parent.encode("heartbeat", {})
        with self.assertRaises(IpcError): child.decode(parent.encode("stop", {}))

    def test_tampered_mac(self):
        parent, child = pair()
        frame = json.loads(parent.encode("heartbeat", {}))
        frame["mac"] = "A" * 43
        with self.assertRaises(IpcError): child.decode(json.dumps(frame).encode() + b"\n")

    def test_truncated_and_overlong_frames(self):
        for bad in (b"", b"{}", b"{}\n{}\n", b"x" * MAX_LINE_BYTES + b"\n"):
            with self.subTest(bad_length=len(bad)):
                _, child = pair()
                with self.assertRaises(IpcError): child.decode(bad)
        parent, _ = pair()
        with self.assertRaises(IpcError): parent.encode("offer", {"sdp":"x" * MAX_BODY_BYTES})
        with self.assertRaises(IpcError): parent.encode("stop", {})

    def test_authenticated_invalid_body(self):
        bootstrap = FIXTURE["bootstrap"]
        body = {"sessionId":bootstrap["sessionId"], "launchId":bootstrap["launchId"], "seq":1, "kind":"offer", "payload":{}}
        cases = []
        for key, value in (("seq",True),("seq",0),("seq",9007199254740992),("payload",[]),("kind","bad\nkind"),("sessionId","other"),("launchId","other")):
            cases.append(json.dumps({**body,key:value}))
        cases += [json.dumps(body)[:-1] + ',"seq":1}', json.dumps({**body,"unexpected":True})]
        cases.append(json.dumps(body).replace('"payload": {}', '"payload": {"number":1e999}'))
        cases.append(json.dumps(body).replace('"payload": {}', '"payload": {"nested":[{"x":1,"x":2}]}'))
        for raw in cases:
            _, child = pair()
            with self.subTest(raw=raw):
                with self.assertRaises(IpcError): child.decode(forged(raw))

    def test_bootstrap_is_strict(self):
        original=FIXTURE["bootstrap"]
        for field,value in (("protocolVersion",True),("key","AA"),("launchId","AA"),("sessionId","bad")):
            with self.subTest(field=field):
                with self.assertRaises(IpcError): HostIpc.accept_bootstrap(json.dumps({**original,field:value}).encode()+b"\n")
        with self.assertRaises(IpcError): HostIpc.accept_bootstrap(b"x"*2049+b"\n")


if __name__ == "__main__":
    unittest.main()
