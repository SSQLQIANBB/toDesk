"""M0 native WebRTC sender: explicit synthetic or screen source, never OS input.

Signaling travels over inherited stdin/stdout. No listening ports or control API.
Run through remote-control-webrtc-probe.mjs using the pinned temporary SDK.
"""
import json
import ctypes
import argparse
import os
from pathlib import Path
import sys
import sysconfig
import tempfile
import threading
import subprocess
import struct
import time
import signal
import re

import gi

gi.require_version("Gst", "1.0")
gi.require_version("GstSdp", "1.0")
gi.require_version("GstWebRTC", "1.0")
from gi.repository import GLib, Gst, GstSdp, GstWebRTC

parser = argparse.ArgumentParser()
parser.add_argument("--source", choices=["synthetic", "screen"], default="synthetic")
parser.add_argument("--screen-source")
args = parser.parse_args()
if args.source == "screen" and not args.screen_source:
    parser.error("screen source requires the locally compiled --screen-source executable")

# Load only the tested plugins. Scanning the entire optional SDK is both slow
# and unnecessary (it also includes GPL/restricted/AI/device plugins).
temporary = tempfile.TemporaryDirectory(prefix="todesk-gst-probe-")
os.environ.update({"GST_PLUGIN_SYSTEM_PATH_1_0": "", "GST_PLUGIN_PATH_1_0": "",
                   "GST_REGISTRY_1_0": str(Path(temporary.name) / "registry.bin"),
                   "GST_REGISTRY_FORK": "no"})
Gst.init(None)
sdk = Path(sysconfig.get_paths()["purelib"])
for package, names in [
    ("gstreamer_libs", ["coreelements", "app", "videotestsrc", "videoconvertscale"]),
    ("gstreamer_plugins", ["vpx", "videoparsersbad", "rtp", "rtpmanager", "nice", "dtls", "srtp", "sctp", "webrtc"]),
]:
    for name in names:
        Gst.Plugin.load_file(str(sdk / package / "lib/gstreamer-1.0" / f"libgst{name}.dylib"))
loop = GLib.MainLoop()
media = (
    "videotestsrc is-live=true pattern=ball ! "
    "video/x-raw,width=320,height=180,framerate=15/1 ! "
    "videoconvert ! vp8enc deadline=1 keyframe-max-dist=15 ! "
    "rtpvp8pay pt=96 ! queue ! "
    "application/x-rtp,media=video,encoding-name=VP8,payload=96,clock-rate=90000 ! peer."
)
if args.source == "screen":
    media = (
        "appsrc name=screen is-live=true format=time block=false max-bytes=4194304 "
        "caps=video/x-h264,stream-format=byte-stream,alignment=au,width=1280,height=720,framerate=15/1 ! "
        "h264parse ! rtph264pay name=screenpay pt=96 config-interval=-1 aggregate-mode=none ! "
        "queue max-size-buffers=5 max-size-bytes=0 max-size-time=0 ! "
        'capsfilter name=screenrtp caps="application/x-rtp,media=video,encoding-name=H264,payload=96,clock-rate=90000,'
        'packetization-mode=(string)1,profile-level-id=(string){42e01f,42c01f}" ! peer.'
    )
pipeline = Gst.parse_launch("webrtcbin name=peer bundle-policy=max-bundle " + media)
peer = pipeline.get_by_name("peer")
channels = []
screen_process = None
screen_stats = None
screen_pid = None
screen_frames = 0
screen_bytes = 0
screen_stopping = False
screen_started = threading.Event()
last_parent_heartbeat = time.monotonic()
output_lock = threading.Lock()

# Bind native ICE to localhost; signaling never opens a listening socket.
nice = ctypes.CDLL(str(sdk / "gstreamer_plugins_libs/lib/libnice.10.dylib"))
nice.nice_address_new.restype = ctypes.c_void_p
nice.nice_address_set_from_string.argtypes = [ctypes.c_void_p, ctypes.c_char_p]
nice.nice_address_set_from_string.restype = ctypes.c_int
nice.nice_agent_add_local_address.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
nice.nice_agent_add_local_address.restype = ctypes.c_int
nice.nice_address_free.argtypes = [ctypes.c_void_p]
capsule_pointer = ctypes.pythonapi.PyCapsule_GetPointer
capsule_pointer.argtypes = [ctypes.py_object, ctypes.c_char_p]
capsule_pointer.restype = ctypes.c_void_p
ice_agent = peer.get_property("ice-agent")
agent = ice_agent.get_property("agent")
address = nice.nice_address_new()
try:
    assert nice.nice_address_set_from_string(address, b"127.0.0.1")
    assert nice.nice_agent_add_local_address(capsule_pointer(agent.__gpointer__, None), address)
finally:
    nice.nice_address_free(address)


def send(message):
    with output_lock:
        try:
            print(json.dumps(message), flush=True)
        except BrokenPipeError:
            GLib.idle_add(loop.quit)


def screen_diagnostics():
    global screen_stats, screen_pid
    for line in screen_process.stderr:
        try:
            message = json.loads(line)
        except json.JSONDecodeError:
            continue
        if message.get("type") == "screen-source-started":
            screen_pid = message["pid"]
            screen_started.set()
        elif message.get("type") == "screen-source-stopped":
            screen_stats = message
        elif message.get("type") == "error":
            send({"type": "error", "message": "Screen source failed", "debug": message.get("reason")})
            GLib.idle_add(loop.quit)


def screen_reader():
    global screen_frames, screen_bytes
    appsrc = pipeline.get_by_name("screen")

    def read_exact(length):
        chunks = bytearray()
        while len(chunks) < length:
            chunk = screen_process.stdout.read(length - len(chunks))
            if not chunk:
                return None
            chunks.extend(chunk)
        return bytes(chunks)

    while not screen_stopping:
        header = read_exact(12)
        if header is None:
            break
        length, pts = struct.unpack(">IQ", header)
        if not 0 < length <= 4 * 1024 * 1024:
            send({"type": "error", "message": "Invalid native video frame size"})
            break
        frame = read_exact(length)
        if frame is None:
            break
        if appsrc.get_property("current-level-bytes") > 4 * 1024 * 1024:
            send({"type": "error", "message": "Native video queue exceeded limit"})
            break
        buffer = Gst.Buffer.new_wrapped(frame)
        buffer.pts = pts
        buffer.dts = pts
        buffer.duration = Gst.SECOND // 15
        if appsrc.emit("push-buffer", buffer) != Gst.FlowReturn.OK:
            break
        screen_frames += 1
        screen_bytes += length
    if not screen_stopping:
        send({"type": "error", "message": "Native screen source pipe closed"})
        GLib.idle_add(loop.quit)


def supervisor_tick():
    if time.monotonic() - last_parent_heartbeat >= 3:
        loop.quit()
        return False
    if screen_process is not None and screen_process.poll() is None:
        try:
            screen_process.stdin.write(b"heartbeat\n")
            screen_process.stdin.flush()
        except BrokenPipeError:
            loop.quit()
            return False
    return True


def answer_created(promise, *_):
    print("native: answer created", file=sys.stderr, flush=True)
    reply = promise.get_reply()
    answer = reply.get_value("answer")
    print("native video negotiation: " + repr([line for line in answer.sdp.as_text().splitlines()
          if line.startswith(("m=video", "a=rtpmap:", "a=fmtp:"))]), file=sys.stderr, flush=True)
    peer.emit("set-local-description", answer, Gst.Promise.new())
    send({"type": "answer", "sdp": answer.sdp.as_text()})


def remote_set(promise, *_):
    print("native: remote description set", file=sys.stderr, flush=True)
    peer.emit("create-answer", None, Gst.Promise.new_with_change_func(answer_created, None))


def handle(message):
    global last_parent_heartbeat
    if message["type"] == "offer":
        print("native: offer received", file=sys.stderr, flush=True)
        encoded = message["sdp"].encode()
        if len(encoded) > 65536:
            raise ValueError("SDP exceeds probe limit")
        if args.source == "screen":
            # Chromium's dynamic payload id for H264 is typically 103, not 96.
            # RTP must use the offered id; matching only codec names creates an
            # established DTLS/DataChannel session with zero decodable video.
            fmtp = {int(value): dict(part.strip().split("=", 1) for part in parameters.split(";") if "=" in part)
                    for value, parameters in re.findall(r"a=fmtp:(\d+) ([^\r\n]+)", message["sdp"])}
            payload = next((int(value) for value in re.findall(r"a=rtpmap:(\d+) H264/90000", message["sdp"], re.IGNORECASE)
                            if fmtp.get(int(value), {}).get("packetization-mode") == "1"
                            and fmtp.get(int(value), {}).get("profile-level-id", "").lower() == "42e01f"), None)
            if payload is None:
                send({"type": "error", "message": "Browser does not offer H264 baseline 3.1 / packetization-mode=1"})
                loop.quit()
                return False
            pipeline.get_by_name("screenpay").set_property("pt", payload)
            pipeline.get_by_name("screenrtp").set_property("caps", Gst.Caps.from_string(
                f"application/x-rtp,media=video,encoding-name=H264,payload={payload},clock-rate=90000,"
                "packetization-mode=(string)1,profile-level-id=(string){42e01f,42c01f}"))
        _, sdp = GstSdp.SDPMessage.new()
        if GstSdp.sdp_message_parse_buffer(encoded, sdp) != GstSdp.SDPResult.OK:
            raise ValueError("Invalid SDP")
        description = GstWebRTC.WebRTCSessionDescription.new(GstWebRTC.WebRTCSDPType.OFFER, sdp)
        peer.emit("set-remote-description", description, Gst.Promise.new_with_change_func(remote_set, None))
    elif message["type"] == "ice":
        candidate = message["candidate"]
        if len(candidate.encode()) <= 4096:
            peer.emit("add-ice-candidate", message["sdpMLineIndex"], candidate)
    elif message["type"] == "stop":
        loop.quit()
    elif message["type"] == "heartbeat":
        last_parent_heartbeat = time.monotonic()
    return False


def stdin_reader():
    try:
        for line in sys.stdin:
            if len(line) > 131072:
                raise ValueError("Signaling line exceeds probe limit")
            GLib.idle_add(handle, json.loads(line))
    finally:
        GLib.idle_add(loop.quit)


def on_channel(_peer, channel):
    channels.append(channel)

    def on_string(channel, message):
        if message == "native-probe-v1":
            channel.emit("send-string", "native-probe-ack-v1")

    channel.connect("on-message-string", on_string)


def on_bus(_bus, message):
    if message.type == Gst.MessageType.ERROR:
        error, debug = message.parse_error()
        send({"type": "error", "message": str(error), "debug": debug})
        loop.quit()


peer.connect("on-data-channel", on_channel)
peer.connect("on-ice-candidate", lambda _peer, index, candidate: send({
    "type": "ice", "sdpMLineIndex": index, "candidate": candidate
}))
bus = pipeline.get_bus()
bus.add_signal_watch()
bus.connect("message", on_bus)


def timeout():
    send({"type": "error", "message": "Native media probe timed out"})
    loop.quit()
    return False


GLib.timeout_add_seconds(45, timeout)
GLib.timeout_add(500, supervisor_tick)
signal.signal(signal.SIGTERM, lambda *_: GLib.idle_add(loop.quit))
threading.Thread(target=stdin_reader, daemon=True).start()
pipeline.set_state(Gst.State.PLAYING)
if args.source == "screen":
    screen_process = subprocess.Popen([args.screen_source], stdin=subprocess.PIPE,
                                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
    diagnostics_thread = threading.Thread(target=screen_diagnostics, daemon=True)
    diagnostics_thread.start()
    threading.Thread(target=screen_reader, daemon=True).start()
send({"type": "ready", "version": Gst.version_string(), "source": args.source})
try:
    loop.run()
finally:
    screen_stopping = True
    stop_started = time.monotonic()
    if screen_process is not None:
        try:
            screen_process.stdin.write(b"stop\n")
            screen_process.stdin.flush()
            screen_process.stdin.close()
        except (BrokenPipeError, OSError):
            pass
        try:
            screen_process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            screen_process.terminate()
            try:
                screen_process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                screen_process.kill()
                screen_process.wait(timeout=2)
        diagnostics_thread.join(timeout=1)
    pipeline.set_state(Gst.State.NULL)
    send({"type": "stopped", "source": args.source, "screenPid": screen_pid,
          "screenFrames": screen_frames, "screenBytes": screen_bytes, "screenStats": screen_stats,
          "screenExitCode": screen_process.returncode if screen_process else None,
          "stopMs": round((time.monotonic() - stop_started) * 1000)})
    temporary.cleanup()
