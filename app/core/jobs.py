"""任务队列：解包 / 打包 / 贴图转换，含并发调度、进度、日志、取消、SSE 推送。"""
from __future__ import annotations

import fnmatch
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

from . import paths, pkgfmt, repkg
from .config import Settings

MAX_LOG_LINES = 5000
MAX_RESULT_ENTRIES = 50000


class Cancelled(Exception):
    """任务被用户取消。"""


class JobError(Exception):
    """任务失败，消息可直接展示给用户。"""


def _now_iso() -> str:
    return datetime.now(timezone.utc).astimezone().isoformat(timespec="seconds")


def _clock() -> str:
    return datetime.now().strftime("%H:%M:%S")


def _human_path(path: str, limit: int = 80) -> str:
    text = str(path)
    if len(text) <= limit:
        return text
    head = text[: max(12, limit // 3)]
    tail = text[-max(12, limit - len(head) - 3):]
    return f"{head}...{tail}"


@dataclass
class Job:
    id: str
    kind: str                      # extract | pack | tex
    title: str
    input: str
    output_dir: str
    status: str = "queued"         # queued | running | done | error | cancelled
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    ended_at: float | None = None
    error: str | None = None
    exit_code: int | None = None
    result: dict[str, Any] | None = None
    done: int = 0
    total: int = 0
    unit: str = "files"
    phase: str = "等待中"
    logs: list[dict[str, Any]] = field(default_factory=list)
    log_base: int = 0
    cancel: threading.Event = field(default_factory=threading.Event)
    runner: repkg.Runner = field(default_factory=repkg.Runner)
    extras: dict[str, Any] = field(default_factory=dict)
    last_emit: float = 0.0
    warnings: int = 0
    error_lines: list[str] = field(default_factory=list)

    # ------------------------------------------------------------------ helpers
    def elapsed(self) -> float:
        if self.started_at is None:
            return 0.0
        end = self.ended_at or time.time()
        return round(max(0.0, end - self.started_at), 1)

    def percent(self) -> float:
        if self.status == "done":
            return 100.0
        if self.total > 0:
            return round(min(100.0, 100.0 * self.done / self.total), 1)
        return 0.0

    def snapshot(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "kind": self.kind,
            "title": self.title,
            "input": self.input,
            "output_dir": self.output_dir,
            "status": self.status,
            "progress": {
                "done": self.done,
                "total": self.total,
                "phase": self.phase,
                "percent": self.percent(),
                "unit": self.unit,
            },
            "started_at": datetime.fromtimestamp(self.started_at).astimezone().isoformat(timespec="seconds") if self.started_at else None,
            "ended_at": datetime.fromtimestamp(self.ended_at).astimezone().isoformat(timespec="seconds") if self.ended_at else None,
            "elapsed": self.elapsed(),
            "error": self.error,
            "result": self.result,
            "exit_code": self.exit_code,
            "warnings": self.warnings,
            "log_count": self.log_base + len(self.logs),
        }


class JobManager:
    def __init__(self, settings: Settings, get_repkg: Callable[[], dict], emit: Callable[[dict], None]) -> None:
        self.settings = settings
        self._get_repkg = get_repkg
        self._emit_raw = emit
        self._lock = threading.RLock()
        self._cond = threading.Condition(self._lock)
        self._jobs: dict[str, Job] = {}
        self._order: list[str] = []
        self._pending: list[str] = []
        self._threads: dict[str, threading.Thread] = {}
        self._dirty: set[str] = set()
        self._dirty_logs: dict[str, list[dict[str, Any]]] = {}
        self._stop = threading.Event()
        self._flusher = threading.Thread(target=self._flush_loop, name="job-flusher", daemon=True)
        self._flusher.start()
        self._dispatcher = threading.Thread(target=self._dispatch_loop, name="job-dispatcher", daemon=True)
        self._dispatcher.start()

    # ------------------------------------------------------------------ emit
    def _emit(self, event: dict) -> None:
        try:
            self._emit_raw(event)
        except Exception:
            pass

    def _flush_loop(self) -> None:
        while not self._stop.is_set():
            time.sleep(0.1)
            with self._lock:
                snapshots = [self._jobs[j].snapshot() for j in self._dirty if j in self._jobs]
                self._dirty.clear()
                logs = self._dirty_logs
                self._dirty_logs = {}
            for snap in snapshots:
                self._emit({"type": "job", "job": snap})
            for job_id, lines in logs.items():
                if lines:
                    self._emit({"type": "log", "job_id": job_id, "lines": lines})

    def _mark(self, job: Job, progress: bool = False) -> None:
        now = time.time()
        if not progress or now - job.last_emit >= 0.12:
            job.last_emit = now
            with self._lock:
                self._dirty.add(job.id)

    # ------------------------------------------------------------------ log
    def _log(self, job: Job, text: str, level: str | None = None) -> None:
        level = level or repkg.line_level(text)
        if level == "error":
            job.warnings += 1
            if len(job.error_lines) < 20:
                job.error_lines.append(text.strip())
        elif level == "warn":
            job.warnings += 1
        with self._lock:
            entry = {"i": job.log_base + len(job.logs), "t": _clock(), "level": level, "text": text}
            job.logs.append(entry)
            if len(job.logs) > MAX_LOG_LINES:
                drop = len(job.logs) - MAX_LOG_LINES
                del job.logs[:drop]
                job.log_base += drop
            self._dirty_logs.setdefault(job.id, []).append(entry)

    # ------------------------------------------------------------- scheduling
    def _dispatch_loop(self) -> None:
        while not self._stop.is_set():
            with self._cond:
                while not self._stop.is_set():
                    limit = max(1, int(self.settings.get("concurrency", 2) or 1))
                    if self._pending and len(self._threads) < limit:
                        job_id = self._pending.pop(0)
                        break
                    self._cond.wait(timeout=0.5)
                else:
                    return
            job = self._jobs.get(job_id)
            if job is None or job.status != "queued":
                continue
            thread = threading.Thread(target=self._run_job, args=(job,), name=f"job-{job.id}", daemon=True)
            with self._cond:
                self._threads[job.id] = thread
            thread.start()

    def _finish(self, job: Job) -> None:
        with self._cond:
            self._threads.pop(job.id, None)
            self._cond.notify_all()
        self._mark(job)

    # ------------------------------------------------------------------- API
    def create_extract_jobs(self, inputs: list[str], output_dir: str, options: dict) -> tuple[list[str], list[dict]]:
        out_dir = str(Path(str(output_dir)).expanduser())
        ids: list[str] = []
        rejected: list[dict] = []
        for raw in inputs:
            path = Path(str(raw)).expanduser()
            if not path.exists():
                rejected.append({"input": str(path), "reason": "路径不存在"})
                continue
            if path.is_file() and path.suffix.lower() != ".pkg":
                rejected.append({"input": str(path), "reason": "只支持 .pkg 文件或文件夹"})
                continue
            job = self._new_job(
                kind="extract",
                title=path.name,
                input=str(path),
                output_dir=out_dir,
                extras={"options": dict(options or {}), "is_dir": path.is_dir()},
            )
            ids.append(job.id)
            self._log(job, f"已加入队列：{path}")
        return ids, rejected

    def create_tex_jobs(self, inputs: list[str], output_dir: str, recursive: bool, overwrite: bool) -> tuple[list[str], list[dict]]:
        out_dir = str(Path(str(output_dir)).expanduser())
        ids: list[str] = []
        rejected: list[dict] = []
        for raw in inputs:
            path = Path(str(raw)).expanduser()
            if not path.exists():
                rejected.append({"input": str(path), "reason": "路径不存在"})
                continue
            if path.is_file() and path.suffix.lower() != ".tex":
                rejected.append({"input": str(path), "reason": "只支持 .tex 文件或文件夹"})
                continue
            job = self._new_job(
                kind="tex",
                title=path.name,
                input=str(path),
                output_dir=out_dir,
                extras={"recursive": bool(recursive), "overwrite": bool(overwrite), "is_dir": path.is_dir()},
            )
            ids.append(job.id)
            self._log(job, f"已加入队列：{path}")
        return ids, rejected

    def create_pack_job(self, source_dir: str, output_pkg: str, options: dict) -> str:
        src = Path(str(source_dir)).expanduser()
        out = Path(str(output_pkg)).expanduser()
        if not src.exists() or not src.is_dir():
            raise JobError("源文件夹不存在")
        if not any(src.iterdir()):
            raise JobError("源文件夹是空的")
        if out.suffix.lower() != ".pkg":
            out = out.with_suffix(".pkg")
        job = self._new_job(
            kind="pack",
            title=out.name,
            input=str(src),
            output_dir=str(out.parent),
            extras={"output_pkg": str(out), "options": dict(options or {})},
        )
        self._log(job, f"已加入队列：{src} -> {out}")
        return job.id

    def _new_job(self, kind: str, title: str, input: str, output_dir: str, extras: dict) -> Job:
        job = Job(
            id="j_" + uuid.uuid4().hex[:8],
            kind=kind,
            title=title or "未命名任务",
            input=input,
            output_dir=output_dir,
            extras=extras,
        )
        with self._lock:
            self._jobs[job.id] = job
            self._order.insert(0, job.id)
            del self._order[100:]
            self._pending.append(job.id)
            self._dirty.add(job.id)
            self._cond.notify_all()
        return job

    def get(self, job_id: str) -> Job | None:
        with self._lock:
            return self._jobs.get(job_id)

    def list_jobs(self) -> list[dict]:
        with self._lock:
            return [self._jobs[j].snapshot() for j in self._order if j in self._jobs]

    def logs(self, job_id: str, after: int = 0) -> dict:
        job = self.get(job_id)
        if job is None:
            raise JobError("任务不存在")
        with self._lock:
            lines = [x for x in job.logs if x["i"] >= max(0, int(after or 0))]
            next_index = job.log_base + len(job.logs)
        return {"lines": lines, "next": next_index}

    def cancel(self, job_id: str) -> None:
        job = self.get(job_id)
        if job is None:
            raise JobError("任务不存在")
        if job.status in ("done", "error", "cancelled"):
            return
        job.cancel.set()
        job.phase = "正在取消…"
        self._mark(job)
        job.runner.kill()

    def remove(self, job_id: str) -> None:
        job = self.get(job_id)
        if job is None:
            return
        if job.status in ("queued", "running"):
            raise JobError("任务还在运行，请先取消")
        with self._lock:
            self._jobs.pop(job_id, None)
            if job_id in self._order:
                self._order.remove(job_id)
            self._dirty.discard(job_id)
            self._dirty_logs.pop(job_id, None)
        self._emit({"type": "job_removed", "job_id": job_id})

    def clear(self, ids: list[str] | None = None) -> None:
        targets = ids if ids else [j["id"] for j in self.list_jobs()]
        for job_id in list(targets):
            job = self.get(job_id)
            if job is None or job.status in ("queued", "running"):
                continue
            self.remove(job_id)

    def counts(self) -> dict:
        with self._lock:
            running = sum(1 for j in self._jobs.values() if j.status == "running")
            queued = sum(1 for j in self._jobs.values() if j.status == "queued")
        return {"running": running, "queued": queued}

    def shutdown(self) -> None:
        self._stop.set()
        with self._cond:
            self._cond.notify_all()
        for job in list(self._jobs.values()):
            if job.status in ("queued", "running"):
                job.cancel.set()
                try:
                    job.runner.kill()
                except Exception:
                    pass

    # -------------------------------------------------------------- execution
    def _run_job(self, job: Job) -> None:
        job.status = "running"
        job.started_at = time.time()
        self._mark(job)
        try:
            if job.kind == "extract":
                self._run_extract(job)
            elif job.kind == "tex":
                self._run_tex(job)
            elif job.kind == "pack":
                self._run_pack(job)
            else:
                raise JobError(f"未知任务类型：{job.kind}")
            if job.cancel.is_set():
                job.status = "cancelled"
                job.phase = "已取消"
            else:
                job.status = "done"
                job.phase = "完成"
        except Cancelled:
            job.status = "cancelled"
            job.phase = "已取消"
            self._log(job, "任务已取消（已写出的文件保留）", "warn")
        except (JobError, pkgfmt.PkgError) as exc:
            job.status = "error"
            job.error = str(exc)
            job.phase = "失败"
            self._log(job, f"任务失败：{exc}", "error")
        except Exception as exc:  # noqa: BLE001
            job.status = "error"
            job.error = f"{type(exc).__name__}: {exc}"
            job.phase = "失败"
            self._log(job, f"未预期的错误：{job.error}", "error")
            self._log(job, __import__("traceback").format_exc(), "error")
        finally:
            job.ended_at = time.time()
            if job.started_at is not None:
                job.done = job.done if job.status == "done" else job.done
            if job.status == "done":
                self._log(job, f"完成，用时 {job.elapsed():.1f}s", "ok")
            try:
                self.settings.add_recent(job.input, job.kind, int((job.result or {}).get("bytes") or 0))
            except Exception:
                pass
            self._finish(job)

    # -- extract -----------------------------------------------------------
    def _estimate_extract_total(self, job: Job) -> int:
        path = Path(job.input)
        options = job.extras.get("options", {})
        only = [x.strip().lstrip(".").lower() for x in (options.get("only_exts") or "").split(",") if x.strip()]
        ignore = [x.strip().lstrip(".").lower() for x in (options.get("ignore_exts") or "").split(",") if x.strip()]

        def keep(entry_path: str) -> bool:
            ext = Path(entry_path).suffix.lower().lstrip(".")
            if only:
                return ext in only
            if ignore:
                return ext not in ignore
            return True

        total = 0
        try:
            if path.is_file():
                for entry in pkgfmt.iter_entries(str(path)):
                    if keep(entry.path):
                        total += 1
            elif path.is_dir():
                pattern = "**/*.pkg" if options.get("recursive") else "*.pkg"
                if options.get("recursive"):
                    files = list(path.glob("**/*.pkg"))
                else:
                    files = [f for sub in path.iterdir() if sub.is_dir() for f in sub.glob("*.pkg")]
                for file in files[:500]:
                    try:
                        for entry in pkgfmt.iter_entries(str(file)):
                            if keep(entry.path):
                                total += 1
                    except pkgfmt.PkgError:
                        continue
        except Exception:
            return 0
        return total

    def _snapshot_tree(self, root: str, limit: int = 20000) -> dict[str, int] | None:
        base = Path(root)
        if not base.exists():
            return {}
        result: dict[str, int] = {}
        try:
            for dirpath, _dirnames, filenames in os.walk(base):
                for name in filenames:
                    full = os.path.join(dirpath, name)
                    try:
                        result[full] = os.path.getsize(full)
                    except OSError:
                        result[full] = 0
                if len(result) > limit:
                    return None
        except OSError:
            return None
        return result

    def _diff_tree(self, before: dict[str, int] | None, root: str) -> tuple[int, int]:
        after = self._snapshot_tree(root)
        if after is None:
            return 0, 0
        if before is None:
            return len(after), sum(after.values())
        changed = 0
        total = 0
        for path, size in after.items():
            old = before.get(path)
            if old is None or old != size:
                changed += 1
                total += size
        return changed, total

    def _run_extract(self, job: Job) -> None:
        info = self._get_repkg()
        if not info.get("ok"):
            raise JobError(info.get("error") or "没有可用的 RePKG.exe，请到「设置」里指定")
        exe = str(info["path"])
        options = job.extras.get("options", {})
        out_dir = job.output_dir
        Path(out_dir).mkdir(parents=True, exist_ok=True)

        job.total = self._estimate_extract_total(job)
        if job.total:
            job.phase = f"准备解包（{job.total} 个条目）"
        else:
            job.phase = "正在解包…"
        self._mark(job)

        before = None if job.extras.get("is_dir") else self._snapshot_tree(out_dir)
        extracted = 0
        skipped = 0
        copied = 0
        fatal = False

        def on_line(line: str) -> None:
            nonlocal extracted, skipped, copied, fatal
            low = line.lower()
            if line.startswith("### Extracting package:"):
                job.phase = f"正在解包 {Path(line.split(':', 1)[1].strip()).name}"
            elif line.startswith("* Extracting:"):
                extracted += 1
                job.done = max(job.done, extracted + skipped)
                job.phase = f"正在解包 {_human_path(line.split(':', 1)[1].strip(), 60)}"
            elif line.startswith("* Skipping, already exists:"):
                skipped += 1
                job.done = max(job.done, extracted + skipped)
            elif line.startswith("* Copying:"):
                copied += 1
            elif "input file not found" in low:
                fatal = True
            self._log(job, line)
            self._mark(job, progress=True)

        args = repkg.extract_args(exe, job.input, out_dir, options)
        self._log(job, "执行：" + " ".join(f'"{a}"' if " " in a else a for a in args[1:]))
        result = job.runner.run(args, cwd=out_dir, on_line=on_line, cancel=job.cancel)
        job.exit_code = result.exit_code

        if job.cancel.is_set():
            raise Cancelled()
        if info.get("path") is None:
            raise JobError("没有可用的 RePKG.exe")

        files, bytes_written = self._diff_tree(before, out_dir) if before is not None else (0, 0)
        if job.extras.get("is_dir"):
            files, bytes_written = self._snapshot_tree_aggregate(out_dir)

        if fatal:
            raise JobError("输入路径不存在或被占用")
        if files == 0 and extracted == 0 and skipped == 0:
            reason = job.error_lines[0] if job.error_lines else "没有提取到任何文件"
            raise JobError(f"{reason}（可能不是有效的 .pkg 或目录里没有 .pkg）")
        if result.exit_code not in (0, None):
            raise JobError(f"RePKG 退出码 {result.exit_code}")

        job.result = {
            "files": files or (extracted + skipped),
            "bytes": bytes_written,
            "output_dir": out_dir,
            "extracted": extracted,
            "skipped": skipped,
            "copied": copied,
            "warnings": job.warnings,
        }
        job.phase = "完成"

    def _snapshot_tree_aggregate(self, root: str) -> tuple[int, int]:
        snap = self._snapshot_tree(root)
        if snap is None:
            return 0, 0
        return len(snap), sum(snap.values())

    # -- tex -----------------------------------------------------------------
    def _run_tex(self, job: Job) -> None:
        info = self._get_repkg()
        if not info.get("ok"):
            raise JobError(info.get("error") or "没有可用的 RePKG.exe，请到「设置」里指定")
        exe = str(info["path"])
        out_dir = job.output_dir
        Path(out_dir).mkdir(parents=True, exist_ok=True)

        recursive = bool(job.extras.get("recursive"))
        overwrite = bool(job.extras.get("overwrite"))
        path = Path(job.input)
        tex_files: list[Path] = []
        try:
            if path.is_file():
                tex_files = [path]
            else:
                tex_files = list(path.glob("**/*.tex" if recursive else "*.tex"))
        except OSError:
            tex_files = []
        job.total = len(tex_files)
        job.phase = f"准备转换（{job.total} 个贴图）"
        self._mark(job)

        before = self._snapshot_tree(out_dir)

        def on_line(line: str) -> None:
            if line.startswith("* Reading:"):
                job.done = min(job.total, job.done + 1) if job.total else job.done + 1
                job.phase = f"转换 {_human_path(line.split(':', 1)[1].strip(), 60)}"
            self._log(job, line)
            self._mark(job, progress=True)

        args = repkg.tex_args(exe, job.input, out_dir, recursive=recursive, overwrite=overwrite)
        self._log(job, "执行：" + " ".join(f'"{a}"' if " " in a else a for a in args[1:]))
        result = job.runner.run(args, cwd=out_dir, on_line=on_line, cancel=job.cancel)
        job.exit_code = result.exit_code
        if job.cancel.is_set():
            raise Cancelled()
        files, bytes_written = self._diff_tree(before, out_dir)
        if files == 0 and job.total:
            reason = job.error_lines[0] if job.error_lines else "没有生成图片"
            raise JobError(f"{reason}（贴图可能损坏或格式不受支持）")
        job.result = {"files": files, "bytes": bytes_written, "output_dir": out_dir, "warnings": job.warnings}
        job.phase = "完成"

    # -- pack ----------------------------------------------------------------
    def _run_pack(self, job: Job) -> None:
        output_pkg = Path(job.extras["output_pkg"])
        options = job.extras.get("options", {})
        exclude = options.get("exclude") or ["project.json", "preview.jpg", "preview.png", "*.tex-json"]
        magic = (options.get("magic") or "PKGV0021").strip().upper() or "PKGV0021"
        output_pkg.parent.mkdir(parents=True, exist_ok=True)

        # 预统计总字节（按排除规则）
        total_bytes = 0
        file_count = 0
        src = Path(job.input)
        for dirpath, dirnames, filenames in os.walk(src):
            dirnames[:] = sorted(dirnames)
            for name in sorted(filenames):
                full = Path(dirpath) / name
                rel = str(full.relative_to(src)).replace("/", "\\")
                if _excluded(rel, exclude):
                    continue
                try:
                    total_bytes += full.stat().st_size
                    file_count += 1
                except OSError:
                    continue
        job.total = total_bytes
        job.unit = "bytes"
        job.phase = f"准备打包（{file_count} 个文件，{_fmt_bytes(total_bytes)}）"
        self._mark(job)

        if file_count == 0:
            raise JobError("没有可打包的文件（可能全被排除规则过滤了）")

        def on_progress(done: int, total: int, rel: str) -> None:
            if job.cancel.is_set():
                raise Cancelled()
            job.total = total or job.total
            job.done = done
            job.phase = f"正在写入 {_human_path(rel, 60)}"
            self._mark(job, progress=True)

        stats = pkgfmt.pack_directory(str(src), str(output_pkg), exclude=exclude, magic=magic, on_progress=on_progress)
        if job.cancel.is_set():
            _safe_unlink(output_pkg)
            raise Cancelled()

        result: dict[str, Any] = {
            "entries": stats.get("entries", file_count),
            "files": stats.get("entries", file_count),
            "bytes": stats.get("bytes", output_pkg.stat().st_size if output_pkg.exists() else 0),
            "output_dir": str(output_pkg.parent),
            "pkg_path": str(output_pkg),
            "output_pkg": str(output_pkg),
            "skipped": stats.get("skipped", []),
            "warnings": job.warnings,
        }
        if options.get("verify", True):
            job.phase = "校验打包结果…"
            self._mark(job)
            result["verify"] = self._verify_pack(output_pkg, job)
        job.result = result
        job.done = job.total
        job.phase = "完成"

    def _verify_pack(self, output_pkg: Path, job: Job) -> dict:
        info = self._get_repkg()
        verify: dict[str, Any] = {"ok": False, "checked": 0, "mismatched": [], "error": None,
                                  "message": ""}
        if not info.get("ok"):
            verify["error"] = "没有可用的 RePKG.exe，跳过校验"
            return verify
        try:
            entries = pkgfmt.iter_entries(str(output_pkg))
            verify["checked"] = len(entries)
            temp_dir = Path(paths.localappdata_dir()) / "verify" / uuid.uuid4().hex[:8]
            temp_dir.mkdir(parents=True, exist_ok=True)
            runner = repkg.Runner()
            args = repkg.extract_args(str(info["path"]), str(output_pkg), str(temp_dir), {"no_tex_convert": True})
            runner.run(args, cwd=str(temp_dir), on_line=lambda _l: None)
            mismatched: list[str] = []
            for entry in entries:
                target = temp_dir / entry.path.replace("\\", os.sep)
                if not target.exists():
                    mismatched.append(entry.path)
                elif target.stat().st_size != entry.length:
                    mismatched.append(entry.path)
            verify["mismatched"] = mismatched[:10]
            verify["ok"] = not mismatched
            verify["message"] = (
                f"条目 {len(entries)} 个、字节数全部回读一致"
                if not mismatched
                else f"{len(mismatched)} 个条目回读不一致（前 {min(5, len(mismatched))} 个见日志）"
            )
            _remove_tree(temp_dir)
        except Exception as exc:  # noqa: BLE001
            verify["error"] = str(exc)
            verify["message"] = f"校验失败：{exc}"
        return verify


# ------------------------------------------------------------------ utilities
def _excluded(rel_path: str, patterns: list[str]) -> bool:
    rel = rel_path.replace("\\", "/")
    name = rel.rsplit("/", 1)[-1]
    for pattern in patterns:
        pattern = str(pattern).strip().replace("\\", "/")
        if not pattern:
            continue
        if fnmatch.fnmatch(rel.lower(), pattern.lower()) or fnmatch.fnmatch(name.lower(), pattern.lower()):
            return True
    return False


def _fmt_bytes(value: int) -> str:
    size = float(value)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if size < 1024 or unit == "TB":
            return f"{size:.1f} {unit}" if unit != "B" else f"{int(size)} B"
        size /= 1024
    return f"{size:.1f} TB"


def _safe_unlink(path: Path) -> None:
    try:
        path.unlink()
    except OSError:
        pass


def _remove_tree(path: Path) -> None:
    import shutil

    try:
        shutil.rmtree(path, ignore_errors=True)
    except OSError:
        pass
