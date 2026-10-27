"""本地 HTTP 服务：静态前端、REST API、SSE 事件流。"""
from __future__ import annotations

import json
import logging
import queue
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, unquote, urlparse

from .api import Api, HttpError
from .core import paths

logger = logging.getLogger("nekorepkg.http")

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".ico": "image/x-icon",
    ".gif": "image/gif",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
    ".map": "application/json; charset=utf-8",
}


class Hub:
    """SSE 客户端管理：publish 把事件推给所有连接。"""

    def __init__(self) -> None:
        self._clients: set[queue.Queue] = set()
        self._lock = threading.Lock()

    def add(self) -> queue.Queue:
        client: queue.Queue = queue.Queue(maxsize=2000)
        with self._lock:
            self._clients.add(client)
        return client

    def remove(self, client: queue.Queue) -> None:
        with self._lock:
            self._clients.discard(client)

    def publish(self, event: dict) -> None:
        with self._lock:
            clients = list(self._clients)
        for client in clients:
            try:
                client.put_nowait(event)
            except queue.Full:
                pass

    def count(self) -> int:
        with self._lock:
            return len(self._clients)


def _safe_static(web_root: Path, url_path: str) -> Path | None:
    relative = unquote(url_path).lstrip("/")
    if not relative or relative.endswith("/"):
        relative += "index.html"
    try:
        candidate = (web_root / relative).resolve()
        candidate.relative_to(web_root.resolve())
    except (ValueError, OSError):
        return None
    return candidate if candidate.is_file() else None


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "NekoRePKG/1.0"
    api: Api
    hub: Hub
    web_root: Path

    def log_message(self, fmt: str, *args: Any) -> None:  # noqa: A003
        logger.debug("%s - %s", self.address_string(), fmt % args)

    def _json(self, status: int, payload: Any) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self._send_bytes(status, "application/json; charset=utf-8", body)

    def _send_bytes(self, status: int, content_type: str, data: bytes,
                    headers: dict | None = None) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for key, value in (headers or {}).items():
            self.send_header(key, value)
        self.end_headers()
        try:
            if self.command != "HEAD":
                self.wfile.write(data)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def _error(self, exc: HttpError) -> None:
        self._json(exc.status, {"ok": False, "error": exc.message})

    # -------------------------------------------------------------------- GET
    def do_GET(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            if path == "/events":
                self._sse()
                return
            if path.startswith("/api/"):
                status, content_type, payload = self.api.handle_get(path, query)
                if isinstance(payload, bytes):
                    self._send_bytes(status, str(content_type), payload)
                else:
                    self._json(status, payload)
                return
            self._static(path)
        except HttpError as exc:
            self._error(exc)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # noqa: BLE001
            logger.exception("GET %s 失败", path)
            self._json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})

    def do_HEAD(self) -> None:  # noqa: N802
        self.do_GET()

    # ------------------------------------------------------------------- POST
    def do_POST(self) -> None:  # noqa: N802
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query)
        try:
            length = int(self.headers.get("Content-Length") or 0)
            if length > 2 * 1024 * 1024 * 1024:
                raise HttpError(413, "请求体过大")
            body = self.rfile.read(length) if length else b""
            status, content_type, payload = self.api.handle_post(
                path, query, body, self.headers.get("Content-Type", "")
            )
            if isinstance(payload, bytes):
                self._send_bytes(status, str(content_type), payload)
            else:
                self._json(status, payload)
        except HttpError as exc:
            self._error(exc)
        except (BrokenPipeError, ConnectionResetError):
            pass
        except Exception as exc:  # noqa: BLE001
            logger.exception("POST %s 失败", path)
            self._json(500, {"ok": False, "error": f"{type(exc).__name__}: {exc}"})

    # ----------------------------------------------------------------- static
    def _static(self, path: str) -> None:
        if path in ("", "/"):
            path = "/index.html"
        target = _safe_static(self.web_root, path)
        if target is None:
            self._json(404, {"ok": False, "error": "资源不存在"})
            return
        content_type = _MIME.get(target.suffix.lower(), "application/octet-stream")
        try:
            data = target.read_bytes()
        except OSError:
            self._json(500, {"ok": False, "error": "读取资源失败"})
            return
        self._send_bytes(200, content_type, data)

    # -------------------------------------------------------------------- SSE
    def _sse(self) -> None:
        client = self.hub.add()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream; charset=utf-8")
        self.send_header("Cache-Control", "no-cache, no-transform")
        self.send_header("Connection", "keep-alive")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()
        self.close_connection = False

        def write_chunk(payload: bytes) -> None:
            self.wfile.write(f"{len(payload):X}\r\n".encode("ascii") + payload + b"\r\n")
            self.wfile.flush()

        try:
            write_chunk(b": hello\n\n")
            self.hub.publish({"type": "hello", "clients": self.hub.count()})
            while True:
                try:
                    event = client.get(timeout=15)
                except queue.Empty:
                    write_chunk(b": ping\n\n")
                    continue
                data = json.dumps(event, ensure_ascii=False)
                write_chunk(f"data: {data}\n\n".encode("utf-8"))
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass
        finally:
            self.hub.remove(client)

    def do_OPTIONS(self) -> None:  # noqa: N802
        self.send_response(204)
        self.send_header("Content-Length", "0")
        self.end_headers()


class ApiServer:
    def __init__(self, api: Api, hub: Hub, web_root: Path) -> None:
        self.hub = hub
        handler = type("BoundHandler", (Handler,), {"api": api, "hub": hub, "web_root": web_root})
        self.httpd = ThreadingHTTPServer(("127.0.0.1", 0), handler)
        self.httpd.daemon_threads = True
        self.port = self.httpd.server_address[1]
        self.thread = threading.Thread(target=self.httpd.serve_forever, name="http-server", daemon=True)

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/"

    def start(self) -> None:
        self.thread.start()

    def stop(self) -> None:
        try:
            self.httpd.shutdown()
        except Exception:
            pass
        try:
            self.httpd.server_close()
        except Exception:
            pass
