"""路径与运行时资源定位（开发模式 / PyInstaller 打包模式）。"""
from __future__ import annotations

import os
import sys
from pathlib import Path

APP_NAME = "NekoRePKG"
APP_TITLE = "NekoRePKG · 猫羽解包器"
APP_VERSION = "1.0.0"


def is_frozen() -> bool:
    return bool(getattr(sys, "frozen", False))


def bundle_dir() -> Path:
    """打包后资源根（onefile 为 _MEIPASS，onedir 为内嵌目录）；开发模式返回项目根。"""
    if is_frozen():
        base = getattr(sys, "_MEIPASS", None)
        if base:
            return Path(base)
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def exe_dir() -> Path:
    """可执行文件所在目录（开发模式返回项目根）。"""
    if is_frozen():
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parents[2]


def web_dir() -> Path:
    dev = Path(__file__).resolve().parents[1] / "web"
    frozen = bundle_dir() / "app" / "web"
    if is_frozen() and frozen.exists():
        return frozen
    if dev.exists():
        return dev
    return frozen


def resources_dir() -> Path:
    dev = Path(__file__).resolve().parents[2] / "resources"
    frozen = bundle_dir() / "resources"
    if is_frozen() and frozen.exists():
        return frozen
    if dev.exists():
        return dev
    return frozen


def bundled_repkg() -> Path | None:
    exe = resources_dir() / "RePKG.exe"
    return exe if exe.exists() else None


def appdata_dir() -> Path:
    base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
    return Path(base) / APP_NAME


def localappdata_dir() -> Path:
    base = os.environ.get("LOCALAPPDATA") or str(Path.home() / "AppData" / "Local")
    return Path(base) / APP_NAME


def config_path() -> Path:
    return appdata_dir() / "settings.json"


def logs_dir() -> Path:
    return appdata_dir() / "logs"


def thumbs_dir() -> Path:
    return localappdata_dir() / "thumbs"


def inbox_dir() -> Path:
    return localappdata_dir() / "inbox"


def default_output_dir() -> Path:
    home = Path.home()
    desktop = home / "Desktop"
    base = desktop if desktop.exists() else home
    return base / "NekoRePKG"


def ensure_dirs() -> None:
    for d in (appdata_dir(), logs_dir(), thumbs_dir(), inbox_dir(), default_output_dir()):
        try:
            d.mkdir(parents=True, exist_ok=True)
        except OSError:
            pass


def is_child_of(path: str | os.PathLike, parent: str | os.PathLike) -> bool:
    try:
        Path(path).resolve().relative_to(Path(parent).resolve())
        return True
    except (ValueError, OSError):
        return False
