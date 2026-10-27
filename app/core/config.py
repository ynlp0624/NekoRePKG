"""设置、最近记录与少量运行时状态（线程安全，落盘到 %APPDATA%\\NekoRePKG\\settings.json）。"""
from __future__ import annotations

import json
import os
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from . import paths

_DEFAULT_SETTINGS: dict[str, Any] = {
    "theme": "moe",
    "default_output": str(paths.default_output_dir()),
    "concurrency": 2,
    "repkg_path": None,
    "open_after_extract": False,
    "play_sound": False,
    "sound_after_extract": False,
    "workshop_dirs": [],
}

_VALIDATORS: dict[str, Any] = {
    "theme": lambda v: v if v in ("moe", "pro") else "moe",
    "default_output": lambda v: str(v) if isinstance(v, str) and v.strip() else str(paths.default_output_dir()),
    "concurrency": lambda v: min(4, max(1, int(v))) if str(v).isdigit() else 2,
    "repkg_path": lambda v: (str(v) if isinstance(v, str) and v.strip() else None),
    "open_after_extract": lambda v: bool(v),
    "play_sound": lambda v: bool(v),
    "sound_after_extract": lambda v: bool(v),
    "workshop_dirs": lambda v: [str(x) for x in v][:20] if isinstance(v, list) else [],
}


class Settings:
    def __init__(self, path: Path | None = None) -> None:
        self.path = path or paths.config_path()
        self._lock = threading.RLock()
        self._data: dict[str, Any] = json.loads(json.dumps(_DEFAULT_SETTINGS))
        self._recent: list[dict[str, Any]] = []
        self.load()

    # ------------------------------------------------------------------ io
    def load(self) -> None:
        with self._lock:
            try:
                raw = json.loads(self.path.read_text(encoding="utf-8"))
            except (OSError, ValueError):
                raw = {}
            if isinstance(raw, dict):
                for key, value in raw.get("settings", {}).items():
                    if key in _VALIDATORS:
                        try:
                            self._data[key] = _VALIDATORS[key](value)
                        except Exception:
                            pass
                recent = raw.get("recent")
                if isinstance(recent, list):
                    self._recent = [x for x in recent if isinstance(x, dict) and x.get("path")][:20]

    def save(self) -> None:
        with self._lock:
            payload = {"settings": self._data, "recent": self._recent}
            try:
                self.path.parent.mkdir(parents=True, exist_ok=True)
                tmp = self.path.with_suffix(".tmp")
                tmp.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
                os.replace(tmp, self.path)
            except OSError:
                pass

    # -------------------------------------------------------------- accessors
    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            return json.loads(json.dumps(self._data))

    def get(self, key: str, default: Any = None) -> Any:
        with self._lock:
            return self._data.get(key, default)

    def update(self, partial: dict[str, Any]) -> dict[str, Any]:
        changed: list[str] = []
        with self._lock:
            for key, value in (partial or {}).items():
                if key not in _VALIDATORS:
                    continue
                try:
                    new_value = _VALIDATORS[key](value)
                except Exception:
                    continue
                if self._data.get(key) != new_value:
                    self._data[key] = new_value
                    changed.append(key)
            self.save()
        return {"settings": self.snapshot(), "changed": changed}

    # ----------------------------------------------------------------- recent
    def recent(self) -> list[dict[str, Any]]:
        with self._lock:
            return json.loads(json.dumps(self._recent))

    def add_recent(self, path: str, kind: str, size: int = 0) -> None:
        name = Path(path).name or path
        item = {
            "path": path,
            "kind": kind,
            "name": name,
            "size": int(size or 0),
            "when": datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds"),
        }
        with self._lock:
            self._recent = [r for r in self._recent if r.get("path") != path]
            self._recent.insert(0, item)
            del self._recent[20:]
            self.save()

    def clear_recent(self) -> None:
        with self._lock:
            self._recent = []
            self.save()
