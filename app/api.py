"""REST 端点实现：状态、选择对话框、包解析、任务、画廊、工坊、设置。"""
from __future__ import annotations

import hashlib
import json
import mimetypes
import os
import re
import shutil
import subprocess
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone
from email.parser import BytesParser
from email.policy import default as email_policy
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, quote

from app.core import dialogs, paths, pkgfmt, scanner
from app.core import repkg as repkg_mod
from app.core.config import Settings
from app.core.jobs import JobError, JobManager

JSON = "application/json; charset=utf-8"
IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}
CREATE_NO_WINDOW = 0x08000000

_MIME = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".woff2": "font/woff2",
    ".txt": "text/plain; charset=utf-8",
}


class HttpError(Exception):
    def __init__(self, status: int, message: str) -> None:
        self.status = status
        self.message = message
        super().__init__(message)


def _iso(ts: float) -> str:
    return datetime.fromtimestamp(ts).astimezone().isoformat(timespec="seconds")


def _thumb_url(path: str, width: int = 360) -> str:
    return f"/api/thumb?path={quote(str(path), safe='')}&w={width}"


def _image_url(path: str) -> str:
    return f"/api/image?path={quote(str(path), safe='')}"


class Api:
    def __init__(self, settings: Settings, jobs: JobManager, state: dict, hub) -> None:
        self.settings = settings
        self.jobs = jobs
        self.state = state          # 共享可变状态：{"repkg": {...}} 等
        self.hub = hub
        self._workshop_lock = threading.Lock()
        self._workshop_scanning = False
        self._workshop: dict[str, Any] = {
            "ok": True,
            "scanning": False,
            "steam_root": None,
            "dirs": [],
            "items": [],
            "updated_at": None,
            "error": None,
        }
        self._inspect_cache: dict[str, tuple[float, dict]] = {}

    # ------------------------------------------------------------------ state
    def public_state(self) -> dict:
        recent = self.settings.recent()
        return {
            "ok": True,
            "app": {
                "name": "NekoRePKG",
                "version": paths.APP_VERSION,
                "title": paths.APP_TITLE,
                "platform": "windows",
                "log_dir": str(paths.logs_dir()),
                "config_path": str(paths.config_path()),
                "frozen": paths.is_frozen(),
                "cache_bytes": self.thumbs_size(),
            },
            "repkg": self.state.get("repkg") or {},
            "settings": self.settings.snapshot(),
            "recent": recent,
            "jobs": self.jobs.counts(),
            "workshop": {
                "scanning": self._workshop_scanning,
                "dirs": self._workshop.get("dirs") or [],
                "count": len(self._workshop.get("items") or []),
            },
        }

    def broadcast_state(self) -> None:
        try:
            self.hub.publish({"type": "state", "state": self.public_state()})
        except Exception:
            pass

    # ----------------------------------------------------------------- request
    def handle_get(self, path: str, query: dict[str, list[str]]):
        try:
            if path == "/api/state":
                return 200, JSON, self.public_state()
            if path == "/api/jobs":
                return 200, JSON, {"ok": True, "jobs": self.jobs.list_jobs()}
            if path == "/api/jobs/log":
                job_id = self._q(query, "id")
                after = int(self._q(query, "after") or 0)
                return 200, JSON, {"ok": True, **self.jobs.logs(job_id, after)}
            if path == "/api/gallery":
                return self.gallery(query)
            if path == "/api/workshop":
                return 200, JSON, self.workshop_snapshot()
            if path == "/api/thumb":
                return self.thumb(query)
            if path == "/api/image":
                return self.image(query)
            raise HttpError(404, "未知接口")
        except HttpError:
            raise
        except JobError as exc:
            raise HttpError(400, str(exc))
        except Exception as exc:  # noqa: BLE001
            raise HttpError(500, self._err_text(exc))

    def handle_post(self, path: str, query: dict[str, list[str]], body: bytes, content_type: str):
        try:
            if path == "/api/upload":
                return self.upload(body, content_type)
            data = self._json_body(body)
            if path == "/api/pick":
                return self.pick(data)
            if path == "/api/reveal":
                return self.reveal(data)
            if path == "/api/open":
                return self.open_path(data)
            if path == "/api/settings":
                return self.save_settings(data)
            if path == "/api/repkg":
                return self.set_repkg(data)
            if path == "/api/repkg/autodetect":
                return self.autodetect()
            if path == "/api/inspect":
                return self.inspect(data)
            if path == "/api/jobs/extract":
                return self.extract(data)
            if path == "/api/jobs/tex":
                return self.tex(data)
            if path == "/api/jobs/pack":
                return self.pack(data)
            if path == "/api/jobs/cancel":
                self.jobs.cancel(self._d(data, "id"))
                return 200, JSON, {"ok": True}
            if path == "/api/jobs/remove":
                self.jobs.remove(self._d(data, "id"))
                return 200, JSON, {"ok": True}
            if path == "/api/jobs/clear":
                self.jobs.clear(data.get("ids"))
                return 200, JSON, {"ok": True}
            if path == "/api/jobs/open_output":
                job = self.jobs.get(self._d(data, "id"))
                if job is None:
                    raise HttpError(400, "任务不存在")
                target = (job.result or {}).get("output_dir") or job.output_dir
                self._open_path(target)
                return 200, JSON, {"ok": True}
            if path == "/api/workshop/refresh":
                self.start_workshop_scan(force=True)
                return 200, JSON, {"ok": True, "scanning": True}
            if path == "/api/workshop/add_dir":
                return self.add_workshop_dir(data)
            if path == "/api/data/clear":
                return self.clear_data(data)
            raise HttpError(404, "未知接口")
        except HttpError:
            raise
        except JobError as exc:
            raise HttpError(400, str(exc))
        except pkgfmt.PkgError as exc:
            raise HttpError(400, str(exc))
        except Exception as exc:  # noqa: BLE001
            raise HttpError(500, self._err_text(exc))

    # ----------------------------------------------------------------- helpers
    @staticmethod
    def _err_text(exc: Exception) -> str:
        text = f"{type(exc).__name__}: {exc}"
        return text if len(text) < 400 else text[:400] + "…"

    @staticmethod
    def _json_body(body: bytes) -> dict:
        if not body:
            return {}
        try:
            data = json.loads(body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            raise HttpError(400, "请求体不是合法 JSON")
        return data if isinstance(data, dict) else {}

    @staticmethod
    def _q(query: dict[str, list[str]], key: str) -> str:
        values = query.get(key) or []
        return values[0] if values else ""

    @staticmethod
    def _d(data: dict, key: str) -> str:
        value = data.get(key)
        if not isinstance(value, str) or not value.strip():
            raise HttpError(400, f"缺少参数 {key}")
        return value.strip()

    @staticmethod
    def _open_path(target: str) -> None:
        if not target:
            raise HttpError(400, "路径为空")
        candidates = [
            Path(target),
            paths.resources_dir() / target,
            paths.web_dir() / target,
            paths.exe_dir() / target,
        ]
        path = next((c for c in candidates if c.exists()), None)
        if path is None:
            raise HttpError(400, f"路径不存在：{target}")
        os.startfile(str(path))  # type: ignore[attr-defined]

    # ---------------------------------------------------------------- dialogs
    def pick(self, data: dict):
        kind = (data.get("kind") or "pkg").lower()
        title = data.get("title") or "选择"
        initial = data.get("default_dir") or ""
        default_name = data.get("default_name") or ""
        if kind == "folder":
            path = dialogs.pick_folder(initial_dir=initial, title=title)
            return 200, JSON, {"ok": True, "path": path}
        if kind == "save":
            ext = data.get("default_ext") or "*"
            pattern = f"*{ext}" if ext.startswith(".") else "*.*"
            filters = data.get("filters") or [("文件", pattern), ("所有文件", "*.*")]
            path = dialogs.pick_save(initial_dir=initial, title=title, default_name=default_name,
                                     filters=[tuple(x) for x in filters],
                                     default_ext=ext.lstrip("."))
            return 200, JSON, {"ok": True, "path": path}
        filters = data.get("filters")
        if not filters:
            if "repkg" in title.lower() or "exe" in title.lower():
                filters = [("RePKG 程序", "*.exe"), ("所有文件", "*.*")]
            else:
                filters = [("RePKG 包", "*.pkg"), ("贴图", "*.tex"), ("可执行文件", "*.exe"),
                           ("所有文件", "*.*")]
        files = dialogs.pick_files(initial_dir=initial, title=title,
                                   filters=[tuple(x) for x in filters], multi=True)
        return 200, JSON, {"ok": True, "path": (files or [None])[0] if files is not None else None,
                           "paths": files or []}

    def reveal(self, data: dict):
        target = self._d(data, "path")
        if not Path(target).exists():
            raise HttpError(400, "路径不存在")
        if Path(target).is_dir():
            os.startfile(target)  # type: ignore[attr-defined]
        else:
            subprocess.run(["explorer", "/select,", str(Path(target))], creationflags=CREATE_NO_WINDOW)
        return 200, JSON, {"ok": True}

    def open_path(self, data: dict):
        self._open_path(self._d(data, "path"))
        return 200, JSON, {"ok": True}

    # --------------------------------------------------------------- settings
    def save_settings(self, data: dict):
        partial = data.get("settings") if isinstance(data.get("settings"), dict) else data
        result = self.settings.update(partial or {})
        if "repkg_path" in (result.get("changed") or []):
            self.refresh_repkg()
        self.broadcast_state()
        return 200, JSON, {"ok": True, "settings": result["settings"]}

    def set_repkg(self, data: dict):
        path = self._d(data, "path")
        info = repkg_mod.info_for(path)
        if not info.get("ok"):
            return 200, JSON, {"ok": False, "error": info.get("error") or "无法使用该 RePKG.exe",
                               "repkg": info}
        self.settings.update({"repkg_path": path})
        self.state["repkg"] = info
        self.broadcast_state()
        return 200, JSON, {"ok": True, "repkg": info}

    def autodetect(self):
        configured = self.settings.get("repkg_path")
        info = repkg_mod.detect(configured)
        self.state["repkg"] = info
        self.broadcast_state()
        return 200, JSON, {"ok": True, "repkg": info}

    def refresh_repkg(self) -> dict:
        configured = self.settings.get("repkg_path")
        info = repkg_mod.detect(configured)
        self.state["repkg"] = info
        return info

    # ---------------------------------------------------------------- inspect
    def inspect(self, data: dict):
        raw_path = self._d(data, "path")
        pkg_path = Path(raw_path)
        if not pkg_path.exists() or not pkg_path.is_file():
            raise HttpError(400, "文件不存在")
        try:
            stat = pkg_path.stat()
            cache_key = str(pkg_path.resolve())
            cached = self._inspect_cache.get(cache_key)
            if cached and cached[0] == stat.st_mtime and stat.st_size < 8 * 1024 * 1024:
                payload = json.loads(json.dumps(cached[1]))
            else:
                payload = self._inspect_file(pkg_path)
                if stat.st_size < 8 * 1024 * 1024:
                    self._inspect_cache[cache_key] = (stat.st_mtime, payload)
                    if len(self._inspect_cache) > 20:
                        self._inspect_cache.pop(next(iter(self._inspect_cache)))
        except pkgfmt.PkgError as exc:
            raise HttpError(400, str(exc))
        payload["size"] = stat.st_size
        payload["mtime"] = _iso(stat.st_mtime)
        payload["path"] = str(pkg_path)
        payload["name"] = pkg_path.name
        return 200, JSON, payload

    def _inspect_file(self, pkg_path: Path) -> dict:
        info = pkgfmt.inspect_file(str(pkg_path))
        entries = info.get("entries") or []
        warnings = list(info.get("warnings") or [])
        if len(entries) > 20000:
            entries = entries[:20000]
            warnings.append("条目超过 20000 个，仅显示前 20000 条")
        project = None
        project_path = pkg_path.parent / "project.json"
        if project_path.exists():
            try:
                raw = json.loads(project_path.read_text(encoding="utf-8-sig"))
                if isinstance(raw, dict):
                    project = {
                        "title": raw.get("title"),
                        "type": raw.get("type"),
                        "file": raw.get("file"),
                        "preview": raw.get("preview"),
                        "tags": raw.get("tags") or [],
                        "workshopid": raw.get("workshopid"),
                        "description": raw.get("description"),
                        "raw": raw,
                    }
            except (OSError, ValueError) as exc:
                warnings.append(f"project.json 解析失败：{exc}")
        preview_path = None
        if project and project.get("preview"):
            candidate = pkg_path.parent / str(project["preview"])
            if candidate.exists():
                preview_path = candidate
        if preview_path is None:
            for name in ("preview.jpg", "preview.png", "preview.gif", "preview.webp"):
                candidate = pkg_path.parent / name
                if candidate.exists():
                    preview_path = candidate
                    break
        return {
            "ok": True,
            "magic": info.get("magic"),
            "entry_count": info.get("entry_count", len(entries)),
            "data_size": info.get("data_size"),
            "entries": entries,
            "by_ext": info.get("by_ext") or [],
            "project": project,
            "preview_path": str(preview_path) if preview_path else None,
            "preview_url": _image_url(str(preview_path)) if preview_path else None,
            "warnings": warnings,
        }

    # ------------------------------------------------------------------- jobs
    def extract(self, data: dict):
        inputs = data.get("inputs")
        if not isinstance(inputs, list) or not inputs:
            raise HttpError(400, "没有输入文件")
        output_dir = data.get("output_dir") or self.settings.get("default_output") or str(paths.default_output_dir())
        options = data.get("options") if isinstance(data.get("options"), dict) else {}
        for key in ("only_exts", "ignore_exts"):
            value = options.get(key)
            if value is not None and not isinstance(value, str):
                raise HttpError(400, f"{key} 必须是字符串")
        ids, rejected = self.jobs.create_extract_jobs([str(x) for x in inputs], str(output_dir), options)
        if not ids and rejected:
            raise HttpError(400, rejected[0]["reason"])
        return 200, JSON, {"ok": True, "job_ids": ids, "rejected": rejected}

    def tex(self, data: dict):
        inputs = data.get("inputs")
        if not isinstance(inputs, list) or not inputs:
            raise HttpError(400, "没有输入文件")
        output_dir = data.get("output_dir") or self.settings.get("default_output") or str(paths.default_output_dir())
        ids, rejected = self.jobs.create_tex_jobs(
            [str(x) for x in inputs], str(output_dir),
            bool(data.get("recursive")), bool(data.get("overwrite")),
        )
        if not ids and rejected:
            raise HttpError(400, rejected[0]["reason"])
        return 200, JSON, {"ok": True, "job_ids": ids, "rejected": rejected}

    def pack(self, data: dict):
        source_dir = self._d(data, "source_dir")
        output_pkg = self._d(data, "output_pkg")
        options = data.get("options") if isinstance(data.get("options"), dict) else {}
        job_id = self.jobs.create_pack_job(source_dir, output_pkg, options)
        return 200, JSON, {"ok": True, "job_id": job_id}

    # ----------------------------------------------------------------- gallery
    def gallery(self, query: dict[str, list[str]]):
        raw_dir = self._q(query, "dir")
        if not raw_dir:
            raise HttpError(400, "缺少目录参数")
        base = Path(raw_dir)
        if not base.exists() or not base.is_dir():
            raise HttpError(400, "目录不存在")
        sort = self._q(query, "sort") or "name"
        keyword = (self._q(query, "q") or "").lower()
        offset = max(0, int(self._q(query, "offset") or 0))
        limit = min(2000, max(1, int(self._q(query, "limit") or 500)))
        images: list[dict] = []
        try:
            for dirpath, dirnames, filenames in os.walk(base):
                dirnames.sort()
                for name in filenames:
                    ext = Path(name).suffix.lower()
                    if ext not in IMAGE_EXTS:
                        continue
                    if keyword and keyword not in name.lower():
                        continue
                    full = Path(dirpath) / name
                    try:
                        stat = full.stat()
                    except OSError:
                        continue
                    images.append({
                        "path": str(full),
                        "name": name,
                        "rel": str(full.relative_to(base)).replace("\\", "/"),
                        "ext": ext,
                        "size": stat.st_size,
                        "mtime": _iso(stat.st_mtime),
                        "thumb": _thumb_url(str(full), 360),
                    })
                    if len(images) > 60000:
                        break
        except OSError as exc:
            raise HttpError(400, f"读取目录失败：{exc}")
        if sort == "mtime":
            images.sort(key=lambda x: x["mtime"], reverse=True)
        elif sort == "size":
            images.sort(key=lambda x: x["size"], reverse=True)
        else:
            images.sort(key=lambda x: x["rel"].lower())
        total = len(images)
        page = images[offset: offset + limit]
        return 200, JSON, {"ok": True, "dir": str(base), "total": total, "images": page,
                           "offset": offset, "limit": limit}

    def thumb(self, query: dict[str, list[str]]):
        raw = self._q(query, "path")
        if not raw:
            raise HttpError(400, "缺少 path")
        path = Path(raw)
        if not path.exists() or not path.is_file():
            raise HttpError(404, "图片不存在")
        width = min(1024, max(32, int(self._q(query, "w") or 360)))
        try:
            stat = path.stat()
        except OSError as exc:
            raise HttpError(404, f"读取失败：{exc}")
        key = hashlib.sha1(f"{path.resolve()}|{stat.st_mtime_ns}|{stat.st_size}|{width}".encode("utf-8")).hexdigest()
        cache_file = paths.thumbs_dir() / f"{key}.jpg"
        if cache_file.exists():
            try:
                return 200, "image/jpeg", cache_file.read_bytes()
            except OSError:
                pass
        try:
            from PIL import Image, ImageOps

            with Image.open(path) as img:
                img = ImageOps.exif_transpose(img)
                if img.mode not in ("RGB", "L"):
                    background = Image.new("RGB", img.size, (255, 255, 255))
                    if img.mode in ("RGBA", "LA", "P"):
                        rgba = img.convert("RGBA")
                        background.paste(rgba, mask=rgba.split()[-1])
                    else:
                        background = img.convert("RGB")
                    img = background
                if img.width > width:
                    height = max(1, round(img.height * width / img.width))
                    img = img.resize((width, height), Image.LANCZOS)
                import io as _io

                buffer = _io.BytesIO()
                img.save(buffer, format="JPEG", quality=82, optimize=True)
                data = buffer.getvalue()
        except Exception as exc:  # noqa: BLE001
            raise HttpError(404, f"无法生成缩略图：{exc}")
        try:
            paths.thumbs_dir().mkdir(parents=True, exist_ok=True)
            cache_file.write_bytes(data)
        except OSError:
            pass
        return 200, "image/jpeg", data

    def image(self, query: dict[str, list[str]]):
        raw = self._q(query, "path")
        if not raw:
            raise HttpError(400, "缺少 path")
        path = Path(raw)
        if not path.exists() or not path.is_file():
            raise HttpError(404, "文件不存在")
        ext = path.suffix.lower()
        ctype = _MIME.get(ext) or mimetypes.guess_type(str(path))[0] or "application/octet-stream"
        try:
            data = path.read_bytes()
        except OSError as exc:
            raise HttpError(404, f"读取失败：{exc}")
        headers = {"Content-Type": ctype}
        if self._q(query, "download") in ("1", "true"):
            headers["Content-Disposition"] = f"attachment; filename*=UTF-8''{quote(path.name)}"
        return 200, headers, data

    # --------------------------------------------------------------- workshop
    def workshop_snapshot(self) -> dict:
        with self._workshop_lock:
            data = json.loads(json.dumps(self._workshop))
        data["scanning"] = self._workshop_scanning
        return {"ok": True, **data}

    def start_workshop_scan(self, force: bool = False) -> None:
        with self._workshop_lock:
            if self._workshop_scanning:
                return
            self._workshop_scanning = True

        def worker() -> None:
            try:
                extra = [d for d in (self.settings.get("workshop_dirs") or []) if d]
                steam_root = scanner.find_steam_root()
                dirs = scanner.find_workshop_dirs(extra_dirs=extra)
                items = scanner.scan_items(dirs) if dirs else []
                for item in items:
                    preview = item.get("preview")
                    item["preview_url"] = _thumb_url(preview, 480) if preview else None
                payload = {
                    "ok": True,
                    "scanning": False,
                    "steam_root": steam_root,
                    "dirs": dirs,
                    "items": items,
                    "updated_at": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
                    "error": None,
                }
            except Exception as exc:  # noqa: BLE001
                payload = {
                    "ok": False,
                    "scanning": False,
                    "steam_root": None,
                    "dirs": [],
                    "items": [],
                    "updated_at": None,
                    "error": self._err_text(exc),
                }
            with self._workshop_lock:
                self._workshop = payload
                self._workshop_scanning = False
            try:
                self.hub.publish({"type": "workshop", "data": payload})
            except Exception:
                pass

        threading.Thread(target=worker, name="workshop-scan", daemon=True).start()
        try:
            self.hub.publish({"type": "toast", "level": "info", "text": "正在扫描创意工坊…"})
        except Exception:
            pass

    def add_workshop_dir(self, data: dict):
        directory = self._d(data, "dir")
        if not Path(directory).is_dir():
            raise HttpError(400, "目录不存在")
        dirs = list(self.settings.get("workshop_dirs") or [])
        if directory not in dirs:
            dirs.append(directory)
        self.settings.update({"workshop_dirs": dirs})
        self.start_workshop_scan(force=True)
        self.broadcast_state()
        return 200, JSON, {"ok": True}

    # ------------------------------------------------------------------ upload
    def upload(self, body: bytes, content_type: str):
        if not body:
            raise HttpError(400, "没有文件内容")
        filename = f"upload_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
        payload: bytes | None = None
        if "multipart/form-data" in (content_type or "").lower():
            message = BytesParser(policy=email_policy).parsebytes(
                f"Content-Type: {content_type}\r\nMIME-Version: 1.0\r\n\r\n".encode("utf-8") + body
            )
            if message.is_multipart():
                for part in message.iter_parts():
                    disposition = (part.get("Content-Disposition") or "")
                    if "filename" in disposition:
                        payload = part.get_payload(decode=True) or b""
                        match = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', disposition)
                        if match:
                            filename = os.path.basename(match.group(1).strip())
                        break
        if payload is None:
            payload = body
        if not payload:
            raise HttpError(400, "上传内容为空")
        safe = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", filename).strip() or "upload.bin"
        inbox = paths.inbox_dir()
        inbox.mkdir(parents=True, exist_ok=True)
        target = inbox / f"{uuid.uuid4().hex[:8]}_{safe}"
        try:
            target.write_bytes(payload)
        except OSError as exc:
            raise HttpError(500, f"保存上传文件失败：{exc}")
        return 200, JSON, {"ok": True, "path": str(target), "name": safe, "size": len(payload)}

    # ------------------------------------------------------------------- misc
    def clear_data(self, data: dict):
        what = (data.get("what") or "").lower()
        if what == "recent":
            self.settings.clear_recent()
            self.broadcast_state()
            return 200, JSON, {"ok": True}
        if what == "thumbs":
            try:
                shutil.rmtree(paths.thumbs_dir(), ignore_errors=True)
                paths.thumbs_dir().mkdir(parents=True, exist_ok=True)
            except OSError as exc:
                raise HttpError(500, f"清理缓存失败：{exc}")
            return 200, JSON, {"ok": True}
        raise HttpError(400, "未知的清理目标")

    def thumbs_size(self) -> int:
        total = 0
        try:
            for file in paths.thumbs_dir().glob("*"):
                try:
                    total += file.stat().st_size
                except OSError:
                    continue
        except OSError:
            pass
        return total
