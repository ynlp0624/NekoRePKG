"""原生对话框自动检查：打开文件夹/文件/保存对话框，找到系统对话框窗口后发 WM_CLOSE 取消。

运行：E:\\repkg\\.venv\\Scripts\\python.exe tests\\dialogs_check.py
（窗口会短暂出现，对话框会被自动关闭）
"""
from __future__ import annotations

import ctypes
import json
import os
import sys
import tempfile
import threading
import time
import urllib.request
from ctypes import wintypes
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core import paths  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402
from app.api import Api  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402

user32 = ctypes.windll.user32
WM_CLOSE = 0x0010
WM_COMMAND = 0x0111
IDCANCEL = 2

WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def windows_of_pid(pid: int) -> list[tuple[int, str, str]]:
    found: list[tuple[int, str, str]] = []

    def callback(hwnd, _lparam):
        wnd_pid = wintypes.DWORD()
        user32.GetWindowThreadProcessId(hwnd, ctypes.byref(wnd_pid))
        if wnd_pid.value == pid:
            cls = ctypes.create_unicode_buffer(256)
            title = ctypes.create_unicode_buffer(256)
            user32.GetClassNameW(hwnd, cls, 256)
            user32.GetWindowTextW(hwnd, title, 256)
            found.append((int(hwnd), cls.value, title.value))
        return True

    user32.EnumWindows(WNDENUMPROC(callback), 0)
    return found


def close_dialog_when_ready(pid: int, results: dict, deadline: float = 15.0) -> None:
    """轮询本进程的 #32770 对话框，出现后发 WM_CLOSE。"""
    started = time.time()
    while time.time() - started < deadline:
        for hwnd, cls, title in windows_of_pid(pid):
            if cls == "#32770":
                results["window"] = {"hwnd": hwnd, "class": cls, "title": title,
                                     "appeared_after": round(time.time() - started, 2)}
                user32.PostMessageW(hwnd, WM_CLOSE, 0, 0)
                return
        time.sleep(0.15)
    results["window"] = None


def call_pick(base: str, kind: str, extra: dict) -> dict:
    body = json.dumps({"kind": kind, "title": "测试", **extra}).encode("utf-8")
    req = urllib.request.Request(base + "/api/pick", data=body,
                                 headers={"Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as exc:
        return {"error": str(exc)}


def main() -> int:
    import webview

    settings = Settings(path=Path(tempfile.mkdtemp(prefix="nekorepkg_dlg_")) / "settings.json")
    hub = Hub()
    state = {"repkg": {}}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()
    base = server.url.rstrip("/")
    results: dict[str, dict] = {}
    pid = os.getpid()

    window = webview.create_window("NekoRePKG 对话框检查", url=server.url, width=900, height=600, hidden=False)

    def checks(window_ref) -> None:
        window_ref.events.loaded.wait(30)
        time.sleep(1.5)
        cases = (
            ("folder", {"default_dir": str(Path.home())}),
            ("pkg", {"default_dir": str(ROOT)}),
            ("save", {"default_dir": str(ROOT), "default_name": "test.pkg", "default_ext": ".pkg"}),
        )
        for kind, extra in cases:
            info: dict = {}
            results[kind] = info
            holder: dict = {}

            def worker():
                holder["resp"] = call_pick(base, kind, extra)

            thread = threading.Thread(target=worker, daemon=True)
            started = time.time()
            thread.start()
            close_dialog_when_ready(pid, info)
            thread.join(25)
            info["elapsed"] = round(time.time() - started, 2)
            info["resp"] = holder.get("resp", {"error": "timeout"})
            print(f"   pick({kind}) -> {json.dumps(info, ensure_ascii=False)}")
            time.sleep(0.6)
        try:
            window_ref.destroy()
        except Exception:
            pass

    try:
        webview.start(checks, window)
    finally:
        server.stop()
        jobs.shutdown()

    ok = True
    for kind, info in results.items():
        resp = info.get("resp") or {}
        good = info.get("window") is not None and resp.get("ok") and resp.get("path") is None
        print(f"   {kind}: dialog={'found' if info.get('window') else 'NOT FOUND'} "
              f"resp={json.dumps(resp, ensure_ascii=False)} -> {'OK' if good else 'FAIL'}")
        ok = ok and good
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
