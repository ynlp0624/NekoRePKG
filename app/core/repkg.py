"""RePKG.exe 调用封装：发现、校验、参数拼装、流式执行与取消。"""
from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable

from . import paths

CREATE_NO_WINDOW = 0x08000000
_VERSION_RE = re.compile(r"RePKG\s+([0-9][0-9A-Za-z.+\-]*)")

_ERROR_HINTS = (
    "failed to",
    "unhandled exception",
    "exception",
    "input file not found",
    "unrecognized file extension",
    "doesn't exist",
    "cannot be negative",
    "size cannot be negative",
)
_WARN_HINTS = ("skipping", "already exists")


@dataclass
class RunResult:
    exit_code: int | None
    killed: bool
    lines: list[str] = field(default_factory=list)


def line_level(text: str) -> str:
    low = text.lower()
    if any(h in low for h in _ERROR_HINTS):
        return "error"
    if any(h in low for h in _WARN_HINTS):
        return "warn"
    if text.startswith("### "):
        return "phase"
    if text.strip().lower() == "done":
        return "ok"
    return "info"


def _probe_version(exe: Path) -> tuple[str | None, str | None]:
    """运行 exe --version 拿版本号；返回 (version, error)。"""
    try:
        proc = subprocess.run(
            [str(exe), "--version"],
            capture_output=True,
            timeout=12,
            creationflags=CREATE_NO_WINDOW,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        return None, f"无法启动 RePKG.exe：{exc}"
    raw = (proc.stdout or b"") + (proc.stderr or b"")
    text = raw.decode("utf-8", "replace")
    match = _VERSION_RE.search(text)
    if not match:
        return None, "RePKG.exe 没有返回版本信息（可能不是有效的 RePKG）"
    return match.group(1), None


def info_for(exe: str | os.PathLike | None) -> dict:
    """校验一个 exe 路径并返回 UI 需要的 repkg 信息对象。"""
    if not exe:
        return {"path": None, "version": None, "version_full": None, "ok": False,
                "source": "none", "error": "未指定 RePKG.exe"}
    path = Path(str(exe)).expanduser()
    if not path.exists():
        return {"path": str(path), "version": None, "version_full": None, "ok": False,
                "source": "manual", "error": "文件不存在"}
    if path.suffix.lower() != ".exe":
        return {"path": str(path), "version": None, "version_full": None, "ok": False,
                "source": "manual", "error": "不是 .exe 文件"}
    version, error = _probe_version(path)
    display = version.split("+")[0] if version else None
    source = "bundled"
    bundled = paths.bundled_repkg()
    if bundled is not None:
        try:
            if path.resolve() != bundled.resolve():
                source = "manual"
        except OSError:
            source = "manual"
    else:
        source = "manual"
    return {
        "path": str(path),
        "version": display,
        "version_full": version,
        "ok": version is not None,
        "source": source,
        "error": error,
    }


def candidate_paths(configured: str | None = None) -> list[tuple[str, Path]]:
    """按优先级列出候选：设置里的 → 内置 → PATH → 常见位置。"""
    seen: set[str] = set()
    result: list[tuple[str, Path]] = []

    def add(source: str, value: str | os.PathLike | None) -> None:
        if not value:
            return
        p = Path(str(value)).expanduser()
        try:
            key = str(p.resolve()).lower()
        except OSError:
            key = str(p).lower()
        if key in seen:
            return
        seen.add(key)
        result.append((source, p))

    add("manual", configured)
    bundled = paths.bundled_repkg()
    if bundled:
        add("bundled", bundled)
    add("path", shutil.which("RePKG.exe"))
    add("path", shutil.which("RePKG"))
    for base in (
        paths.exe_dir(),
        paths.exe_dir() / "resources",
        paths.exe_dir() / "bin",
        Path.cwd(),
    ):
        add("bundled", base / "RePKG.exe")
    return result


def detect(configured: str | None = None) -> dict:
    """自动检测可用的 RePKG.exe。"""
    last_error = "未找到 RePKG.exe"
    for source, candidate in candidate_paths(configured):
        if not candidate.exists():
            continue
        info = info_for(candidate)
        info["source"] = source if info["ok"] else "manual"
        if info["ok"]:
            return info
        last_error = info.get("error") or last_error
    return {
        "path": configured,
        "version": None,
        "version_full": None,
        "ok": False,
        "source": "none",
        "error": last_error,
    }


# --------------------------------------------------------------------------- args
def extract_args(exe: str, input_path: str, output_dir: str, options: dict) -> list[str]:
    args = [exe, "extract", str(input_path), "-o", str(output_dir)]
    only = (options.get("only_exts") or "").strip()
    ignore = (options.get("ignore_exts") or "").strip()
    if only:
        args += ["--onlyexts", only]
    if ignore:
        args += ["--ignoreexts", ignore]
    if options.get("single_dir"):
        args.append("--singledir")
    if options.get("recursive"):
        args.append("--recursive")
    if options.get("copy_project"):
        args.append("--copyproject")
    if options.get("use_name"):
        args.append("--usename")
    if options.get("no_tex_convert"):
        args.append("--no-tex-convert")
    if options.get("overwrite"):
        args.append("--overwrite")
    return args


def tex_args(exe: str, input_path: str, output_dir: str, recursive: bool = False,
             overwrite: bool = False) -> list[str]:
    args = [exe, "extract", str(input_path), "-o", str(output_dir), "-t"]
    if recursive:
        args.append("--recursive")
    if overwrite:
        args.append("--overwrite")
    return args


# -------------------------------------------------------------------------- run
class Runner:
    """执行 RePKG.exe，逐行回调；支持取消（杀进程树）。"""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._proc: subprocess.Popen | None = None

    def is_running(self) -> bool:
        with self._lock:
            return self._proc is not None and self._proc.poll() is None

    def kill(self) -> None:
        with self._lock:
            proc = self._proc
        if proc is None:
            return
        try:
            subprocess.run(
                ["taskkill", "/F", "/T", "/PID", str(proc.pid)],
                capture_output=True,
                timeout=10,
                creationflags=CREATE_NO_WINDOW,
            )
        except (OSError, subprocess.SubprocessError):
            pass
        try:
            proc.kill()
        except OSError:
            pass

    def run(
        self,
        args: Iterable[str],
        cwd: str | os.PathLike | None,
        on_line: Callable[[str], None],
        cancel: threading.Event | None = None,
    ) -> RunResult:
        argv = [str(a) for a in args]
        collected: list[str] = []
        killed = False
        try:
            proc = subprocess.Popen(
                argv,
                cwd=str(cwd) if cwd else None,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
                creationflags=CREATE_NO_WINDOW,
            )
        except OSError as exc:
            raise RuntimeError(f"无法启动 RePKG.exe：{exc}") from exc

        with self._lock:
            self._proc = proc
        try:
            assert proc.stdout is not None
            for raw in proc.stdout:
                line = raw.rstrip("\r\n")
                if not line.strip():
                    continue
                collected.append(line)
                try:
                    on_line(line)
                except Exception:
                    pass
                if cancel is not None and cancel.is_set():
                    killed = True
                    self.kill()
                    break
            exit_code = proc.wait()
        finally:
            with self._lock:
                self._proc = None
            try:
                if proc.stdout:
                    proc.stdout.close()
            except OSError:
                pass
        return RunResult(exit_code=exit_code, killed=killed, lines=collected)
