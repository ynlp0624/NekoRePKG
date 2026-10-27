"""NekoRePKG 入口：日志、设置、本地服务、桌面窗口。"""
from __future__ import annotations

import ctypes
import logging
import os
import sys
import threading
import time
from logging.handlers import RotatingFileHandler
from pathlib import Path

from app.api import Api
from app.core import paths, repkg as repkg_mod
from app.core.config import Settings
from app.core.jobs import JobManager
from app.server import ApiServer, Hub

logger = logging.getLogger("nekorepkg")

_MUTEX_HANDLE = None


def setup_logging() -> None:
    paths.logs_dir().mkdir(parents=True, exist_ok=True)
    root = logging.getLogger()
    root.setLevel(logging.INFO)
    if getattr(root, "_nekorepkg_configured", False):
        return
    formatter = logging.Formatter("%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    file_handler = RotatingFileHandler(
        paths.logs_dir() / "app.log", maxBytes=2 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    file_handler.setFormatter(formatter)
    root.addHandler(file_handler)
    if not paths.is_frozen():
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        root.addHandler(console)
    root._nekorepkg_configured = True  # type: ignore[attr-defined]


def _acquire_single_instance() -> bool:
    global _MUTEX_HANDLE
    try:
        kernel32 = ctypes.windll.kernel32  # type: ignore[attr-defined]
        _MUTEX_HANDLE = kernel32.CreateMutexW(None, False, "Local\\NekoRePKG_SingleInstance")
        if kernel32.GetLastError() == 183:  # ERROR_ALREADY_EXISTS
            return False
    except Exception:
        return True
    return True


def _message_box(text: str, title: str = "NekoRePKG") -> None:
    try:
        ctypes.windll.user32.MessageBoxW(None, text, title, 0x40)  # type: ignore[attr-defined]
    except Exception:
        pass


def _set_app_id() -> None:
    try:
        ctypes.windll.shell32.SetCurrentProcessExplicitAppUserModelID("NekoRePKG.App.1")  # type: ignore[attr-defined]
    except Exception:
        pass


def main() -> int:
    setup_logging()
    _set_app_id()
    paths.ensure_dirs()
    if not _acquire_single_instance():
        _message_box("NekoRePKG 已经在运行了喵~（看看任务栏）")
        return 0

    web_root = paths.web_dir()
    if not (web_root / "index.html").exists():
        _message_box(f"前端资源缺失：{web_root}\n请重新安装或联系开发者。", "NekoRePKG 启动失败")
        return 1

    settings = Settings()
    state: dict = {"repkg": {}}

    configured = settings.get("repkg_path")
    info = repkg_mod.detect(configured)
    state["repkg"] = info
    logger.info("RePKG: %s", info)

    hub = Hub()
    jobs = JobManager(settings, lambda: state.get("repkg") or {}, hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, web_root)
    server.start()
    logger.info("HTTP 服务已启动：%s", server.url)

    # 预扫描创意工坊（后台，失败无妨）
    threading.Thread(target=api.start_workshop_scan, kwargs={"force": False}, daemon=True).start()

    import webview

    debug = os.environ.get("NEKOREPKG_DEBUG") == "1"
    window = webview.create_window(
        paths.APP_TITLE,
        url=server.url,
        width=1280,
        height=820,
        min_size=(1024, 680),
        background_color="#EEF4FF",
        text_select=False,
        easy_drag=False,
    )
    exit_code = 0
    try:
        webview.start(debug=debug)
    except Exception as exc:  # noqa: BLE001
        logger.exception("窗口启动失败")
        _message_box(f"窗口启动失败：{exc}", "NekoRePKG 启动失败")
        exit_code = 1
    finally:
        logger.info("窗口关闭，清理中…")
        jobs.shutdown()
        server.stop()
        time.sleep(0.2)
    return exit_code


if __name__ == "__main__":
    sys.exit(main())
