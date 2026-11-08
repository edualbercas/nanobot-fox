#!/usr/bin/env python3
import json
import os
import queue
import secrets
import struct
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

HOST = "127.0.0.1"
PORT = 8766
TOKEN_FILE = Path.home() / ".nanobot" / "browser-token"
pending = {}
pending_lock = threading.Lock()
write_lock = threading.Lock()
commands = queue.Queue()
connected = threading.Event()


def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) != 4:
        return None
    length = struct.unpack("<I", raw)[0]
    if length > 1024 * 1024:
        return None
    data = sys.stdin.buffer.read(length)
    if len(data) != length:
        return None
    try:
        return json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return None


def write_message(message):
    data = json.dumps(message, ensure_ascii=False).encode("utf-8")
    with write_lock:
        sys.stdout.buffer.write(struct.pack("<I", len(data)))
        sys.stdout.buffer.write(data)
        sys.stdout.buffer.flush()


def create_token():
    TOKEN_FILE.parent.mkdir(parents=True, exist_ok=True)
    token = secrets.token_urlsafe(32)
    fd = os.open(TOKEN_FILE, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as handle:
        handle.write(token)
    return token


TOKEN = create_token()


class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return

    def send_json(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path != "/status":
            self.send_json(404, {"success": False, "error": "Not found"})
            return
        self.send_json(200, {"success": True, "firefox_connected": connected.is_set()})

    def do_POST(self):
        if self.path != "/command":
            self.send_json(404, {"success": False, "error": "Not found"})
            return
        if self.headers.get("Authorization") != f"Bearer {TOKEN}":
            self.send_json(403, {"success": False, "error": "Unauthorized"})
            return
        try:
            size = int(self.headers.get("Content-Length", "0"))
            if size < 2 or size > 1024 * 1024:
                raise ValueError("Invalid request size")
            request = json.loads(self.rfile.read(size).decode("utf-8"))
            action = request.get("action")
            if not isinstance(action, str) or not action:
                raise ValueError("action is required")
            params = request.get("params")
            if params is None:
                params = {key: value for key, value in request.items() if key not in ("action", "id")}
            if not isinstance(params, dict):
                raise ValueError("params must be an object")
        except (ValueError, UnicodeDecodeError, json.JSONDecodeError) as error:
            self.send_json(400, {"success": False, "error": str(error)})
            return
        if not connected.wait(5):
            self.send_json(503, {"success": False, "error": "Firefox extension is not connected"})
            return
        request_id = str(uuid.uuid4())
        event = threading.Event()
        response = {}
        with pending_lock:
            pending[request_id] = (event, response)
        commands.put({"id": request_id, "action": action, "params": params})
        if not event.wait(45):
            with pending_lock:
                pending.pop(request_id, None)
            self.send_json(504, {"success": False, "error": "Firefox command timed out"})
            return
        self.send_json(200, response)


def serve_http():
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    server.serve_forever()


threading.Thread(target=serve_http, daemon=True).start()


def write_commands():
    write_message({"type": "bridge_ready"})
    while True:
        write_message(commands.get())


threading.Thread(target=write_commands, daemon=True).start()

while True:
    message = read_message()
    if message is None:
        break
    if message.get("type") == "bridge_connected":
        connected.set()
        continue
    request_id = str(message.get("id", ""))
    with pending_lock:
        item = pending.pop(request_id, None)
    if item:
        event, response = item
        response.update(message)
        event.set()

connected.clear()
try:
    TOKEN_FILE.unlink(missing_ok=True)
except OSError:
    pass
