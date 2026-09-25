"""Authenticated inherited-pipe protocol for the development host engine.

The bootstrap is written by the native parent to an inherited pipe, never to
argv, an environment variable, a socket, or a log. This module deliberately
does no I/O: the engine must bound reads/writes and service its watchdog.
"""

import base64
import hashlib
import hmac
import json
import math
import re

MAX_LINE_BYTES = 131072
MAX_BODY_BYTES = 98000
MAX_BOOTSTRAP_BYTES = 2048
MAX_SEQUENCE = 9007199254740991
DOMAIN = b"todesk-host-ipc/v1\n"
_UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\Z")
_KIND = re.compile(r"[a-z][a-z0-9-]{0,63}\Z")


class IpcError(ValueError):
    """Fatal framing/authentication error; no subsequent message is accepted."""


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise IpcError("duplicate JSON field")
        result[key] = value
    return result


def _finite_float(value):
    result = float(value)
    if not math.isfinite(result):
        raise IpcError("invalid number")
    return result


def _json(raw):
    return json.loads(raw.decode("utf-8"), object_pairs_hook=_pairs,
                      parse_float=_finite_float,
                      parse_constant=lambda _: (_ for _ in ()).throw(IpcError("invalid number")))


def _encode64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _decode64(value, size=None):
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]*", value):
        raise IpcError("invalid base64url")
    raw = base64.b64decode(value + "=" * (-len(value) % 4), altchars=b"-_", validate=True)
    if _encode64(raw) != value or (size is not None and len(raw) != size):
        raise IpcError("noncanonical base64url")
    return raw


def _line(raw, limit):
    if not isinstance(raw, bytes) or len(raw) > limit or not raw.endswith(b"\n") or b"\n" in raw[:-1]:
        raise IpcError("invalid IPC line")
    return raw[:-1]


def _object(value, keys):
    if not isinstance(value, dict) or set(value) != set(keys):
        raise IpcError("invalid IPC fields")


class HostIpc:
    def __init__(self, session_id, launch_id, key, role):
        if role not in ("engine", "supervisor"):
            raise IpcError("invalid role")
        if not isinstance(session_id, str) or not _UUID.fullmatch(session_id):
            raise IpcError("invalid session")
        _decode64(launch_id, 32)
        if len(key) != 32:
            raise IpcError("invalid key")
        self._session_id, self._launch_id = session_id, launch_id
        self._key = bytearray(key)
        self._send_direction = b"engine-to-supervisor" if role == "engine" else b"supervisor-to-engine"
        self._recv_direction = b"supervisor-to-engine" if role == "engine" else b"engine-to-supervisor"
        self._send_seq = self._recv_seq = 0
        self._failed = False

    @classmethod
    def accept_bootstrap(cls, rawline):
        try:
            obj = _json(_line(rawline, MAX_BOOTSTRAP_BYTES))
            _object(obj, ("protocolVersion", "sessionId", "launchId", "key"))
            if type(obj["protocolVersion"]) is not int or obj["protocolVersion"] != 1:
                raise IpcError("invalid IPC version")
            return cls(obj["sessionId"], obj["launchId"], _decode64(obj["key"], 32), "engine")
        except (ValueError, TypeError, KeyError, RecursionError) as error:
            raise IpcError("invalid IPC bootstrap") from error

    def _fail(self):
        self._failed = True
        self._key[:] = bytes(32)

    def encode(self, kind, payload):
        try:
            if self._failed or self._send_seq >= MAX_SEQUENCE:
                raise IpcError("IPC closed")
            if not isinstance(kind, str) or not _KIND.fullmatch(kind) or not isinstance(payload, dict):
                raise IpcError("invalid IPC message")
            body = json.dumps({"sessionId": self._session_id, "launchId": self._launch_id,
                               "seq": self._send_seq + 1, "kind": kind, "payload": payload},
                              separators=(",", ":"), ensure_ascii=False, allow_nan=False).encode("utf-8")
            if len(body) > MAX_BODY_BYTES:
                raise IpcError("IPC body too large")
            encoded = _encode64(body)
            mac = hmac.new(self._key, DOMAIN + self._send_direction + b"\n" + encoded.encode("ascii"), hashlib.sha256).digest()
            result = json.dumps({"format": "rc-ipc-v1", "payload": encoded, "mac": _encode64(mac)}, separators=(",", ":")).encode("ascii") + b"\n"
            if len(result) > MAX_LINE_BYTES:
                raise IpcError("IPC line too large")
            self._send_seq += 1
            return result
        except (ValueError, TypeError, OverflowError, RecursionError) as error:
            self._fail()
            raise IpcError("IPC encode failed") from error

    def decode(self, rawline):
        try:
            if self._failed or self._recv_seq >= MAX_SEQUENCE:
                raise IpcError("IPC closed")
            obj = _json(_line(rawline, MAX_LINE_BYTES))
            _object(obj, ("format", "payload", "mac"))
            if obj["format"] != "rc-ipc-v1":
                raise IpcError("invalid IPC format")
            raw = _decode64(obj["payload"])
            if len(raw) > MAX_BODY_BYTES:
                raise IpcError("IPC body too large")
            mac = _decode64(obj["mac"], 32)
            expected = hmac.new(self._key, DOMAIN + self._recv_direction + b"\n" + obj["payload"].encode("ascii"), hashlib.sha256).digest()
            if not hmac.compare_digest(mac, expected):
                raise IpcError("invalid IPC authentication")
            msg = _json(raw)
            _object(msg, ("sessionId", "launchId", "seq", "kind", "payload"))
            if msg["sessionId"] != self._session_id or msg["launchId"] != self._launch_id:
                raise IpcError("IPC launch mismatch")
            if type(msg["seq"]) is not int or msg["seq"] != self._recv_seq + 1 or msg["seq"] > MAX_SEQUENCE:
                raise IpcError("IPC sequence mismatch")
            if not isinstance(msg["kind"], str) or not _KIND.fullmatch(msg["kind"]) or not isinstance(msg["payload"], dict):
                raise IpcError("invalid IPC message")
            self._recv_seq += 1
            return {"kind": msg["kind"], "payload": msg["payload"]}
        except (ValueError, TypeError, KeyError, OverflowError, RecursionError) as error:
            self._fail()
            raise IpcError("IPC decode failed") from error
