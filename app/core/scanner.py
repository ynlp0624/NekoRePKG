"""Steam 与 Wallpaper Engine 创意工坊目录扫描。

只做「只读」探测：注册表、libraryfolders.vdf、workshop\\content\\431960 下的作品目录。
所有公开函数都不会抛异常（找不到就返回空值），单个作品失败会被跳过。
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime
from typing import Callable, Iterable

__all__ = [
    "APPID",
    "find_steam_root",
    "parse_library_folders",
    "find_workshop_dirs",
    "scan_items",
    "scan_dirs_summary",
]

APPID = "431960"  # Wallpaper Engine 的 Steam AppID
WORKSHOP_SUBDIR = ("steamapps", "workshop", "content", APPID)
_PREVIEW_NAMES = ("preview.jpg", "preview.png", "preview.gif", "preview.jpeg")
_PKG_PREFERENCE = ("scene.pkg", "video.pkg", "web.pkg")

# VDF 里的路径可能写成 "D:\\SteamLibrary"；正则捕获转义后的内容
_VDF_PATH_RE = re.compile(r'"path"\s+"((?:[^"\\]|\\.)*)"', re.IGNORECASE)
_VDF_LEGACY_RE = re.compile(r'"(\d+)"\s+"((?:[^"\\]|\\.)*)"')

ProgressCallback = Callable[[int, int, str], None]


def _unescape_vdf(value: str) -> str:
    """还原 VDF 字符串里的 ``\\\\`` 与 ``\\"`` 转义。"""
    out: list[str] = []
    index = 0
    while index < len(value):
        char = value[index]
        if char == "\\" and index + 1 < len(value):
            out.append(value[index + 1])
            index += 2
            continue
        out.append(char)
        index += 1
    return "".join(out)


def _dedupe(paths: Iterable[str]) -> list[str]:
    """按大小写不敏感去重，保持顺序。"""
    seen: set[str] = set()
    result: list[str] = []
    for path in paths:
        if not path:
            continue
        key = os.path.normpath(path).casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(os.path.normpath(path))
    return result


def _registry_candidates() -> list[str]:
    """从注册表读取 Steam 安装路径（仅 Windows，失败返回空列表）。"""
    try:
        import winreg
    except ImportError:
        return []
    keys = (
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "SteamPath"),
        (winreg.HKEY_CURRENT_USER, r"Software\Valve\Steam", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\WOW6432Node\Valve\Steam", "InstallPath"),
        (winreg.HKEY_LOCAL_MACHINE, r"SOFTWARE\Valve\Steam", "InstallPath"),
    )
    found: list[str] = []
    for hive, key_path, value_name in keys:
        try:
            with winreg.OpenKey(hive, key_path) as key:
                value, _ = winreg.QueryValueEx(key, value_name)
        except OSError:
            continue
        if isinstance(value, str) and value.strip():
            found.append(value.strip().strip('"'))
    return found


def find_steam_root() -> str | None:
    """定位 Steam 安装目录，找不到返回 ``None``。"""
    candidates = _registry_candidates()
    program_files = os.environ.get("ProgramFiles", r"C:\Program Files")
    program_files_x86 = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    candidates.append(os.path.join(program_files_x86, "Steam"))
    candidates.append(os.path.join(program_files, "Steam"))
    for drive in "CDEFGHIJKLMNOPQRSTUVWXYZ":
        drive_root = f"{drive}:\\"
        if not os.path.isdir(drive_root):
            continue
        candidates.append(os.path.join(drive_root, "Steam"))
        candidates.append(os.path.join(drive_root, "Program Files (x86)", "Steam"))
        candidates.append(os.path.join(drive_root, "Program Files", "Steam"))

    seen: set[str] = set()
    for candidate in candidates:
        try:
            path = os.path.normpath(os.path.expandvars(candidate))
        except (TypeError, ValueError):
            continue
        key = path.casefold()
        if key in seen:
            continue
        seen.add(key)
        if not path or not os.path.isdir(path):
            continue
        if os.path.isdir(os.path.join(path, "steamapps")) or os.path.isfile(
            os.path.join(path, "steam.exe")
        ):
            return path
    return None


def parse_library_folders(steam_root: str) -> list[str]:
    """解析 ``steamapps\\libraryfolders.vdf``，返回所有库目录（含 Steam 根目录本身）。

    兼容新格式 ``"0" { "path" "D:\\\\SteamLibrary" }`` 与旧格式 ``"1" "D:\\\\Steam"``。
    """
    if not steam_root:
        return []
    root = os.path.normpath(os.path.expandvars(str(steam_root)))
    folders: list[str] = []
    if os.path.isdir(root):
        folders.append(root)
    vdf_path = os.path.join(root, "steamapps", "libraryfolders.vdf")
    try:
        with open(vdf_path, "rb") as fp:
            text = fp.read().decode("utf-8", "replace")
    except OSError:
        text = ""

    raw_paths = [match.group(1) for match in _VDF_PATH_RE.finditer(text)]
    if not raw_paths:
        raw_paths = [match.group(2) for match in _VDF_LEGACY_RE.finditer(text)]

    for raw in raw_paths:
        path = _unescape_vdf(raw).strip()
        if not path:
            continue
        try:
            path = os.path.normpath(path)
        except (TypeError, ValueError):
            continue
        if os.path.isdir(path):
            folders.append(path)
    return _dedupe(folders)


def _as_dirs(dirs) -> list[str]:
    """把 ``str | Iterable[str] | None`` 规整成去重后的目录列表。"""
    if dirs is None:
        return []
    if isinstance(dirs, (str, os.PathLike)):
        values = [os.fspath(dirs)]
    else:
        values = [os.fspath(item) for item in dirs if item]
    cleaned: list[str] = []
    for value in values:
        try:
            cleaned.append(os.path.normpath(os.path.expandvars(os.path.expanduser(str(value)))))
        except (TypeError, ValueError):
            continue
    return _dedupe(cleaned)


def find_workshop_dirs(extra_dirs: Iterable[str] | None = None) -> list[str]:
    """返回所有存在的 ``steamapps\\workshop\\content\\431960`` 目录，外加手动添加的目录。

    ``extra_dirs`` 原样加入（即使不存在），便于 UI 显示用户配置的错误路径。
    """
    result: list[str] = []
    try:
        steam_root = find_steam_root()
    except Exception:  # pragma: no cover - 防御性兜底
        steam_root = None
    if steam_root:
        try:
            libraries = parse_library_folders(steam_root)
        except Exception:  # pragma: no cover
            libraries = [steam_root]
        for library in libraries:
            candidate = os.path.join(library, *WORKSHOP_SUBDIR)
            if os.path.isdir(candidate):
                result.append(candidate)
    for extra in _as_dirs(extra_dirs):
        result.append(extra)
    return _dedupe(result)


def _iso_time(timestamp: float) -> str:
    """时间戳 → 带本地时区的 ISO8601（秒级）。"""
    try:
        return datetime.fromtimestamp(timestamp).astimezone().isoformat(timespec="seconds")
    except (OverflowError, OSError, ValueError):
        return ""


def _read_project(item_dir: str) -> dict:
    """读取 project.json，字段缺失/编码异常时容错。"""
    project_path = os.path.join(item_dir, "project.json")
    try:
        with open(project_path, "rb") as fp:
            raw = fp.read()
    except OSError:
        return {}
    text = None
    for encoding in ("utf-8-sig", "utf-8", "gbk"):
        try:
            text = raw.decode(encoding)
            break
        except UnicodeDecodeError:
            continue
    if text is None:
        text = raw.decode("utf-8", "replace")
    try:
        data = json.loads(text)
    except (ValueError, TypeError):
        return {}
    return data if isinstance(data, dict) else {}


def _list_files(item_dir: str) -> list[str]:
    """列出作品目录下的普通文件名（忽略权限错误）。"""
    try:
        with os.scandir(item_dir) as entries:
            return [entry.name for entry in entries if entry.is_file()]
    except OSError:
        return []


def _find_pkgs(item_dir: str) -> list[str]:
    """返回作品目录下的 .pkg 文件（scene.pkg 优先）。"""
    pkgs = [name for name in _list_files(item_dir) if name.lower().endswith(".pkg")]
    pkgs.sort(key=lambda name: name.casefold())
    preferred = [name for name in pkgs if name.casefold() in _PKG_PREFERENCE]
    preferred.sort(key=lambda name: _PKG_PREFERENCE.index(name.casefold()))
    others = [name for name in pkgs if name not in preferred]
    return [os.path.join(item_dir, name) for name in preferred + others]


def _find_preview(item_dir: str, declared: str) -> str:
    """优先用 project.json 里的 preview，其次按常见名字查找。"""
    if declared:
        candidate = os.path.join(item_dir, declared.replace("/", os.sep).replace("\\", os.sep))
        if os.path.isfile(candidate):
            return candidate
        # 大小写不敏感兜底
        try:
            lower_map = {entry.name.casefold(): entry.name for entry in os.scandir(item_dir)}
        except OSError:
            lower_map = {}
        name = os.path.basename(declared.replace("\\", "/")).casefold()
        if name in lower_map:
            return os.path.join(item_dir, lower_map[name])
    names = {name.casefold(): name for name in _list_files(item_dir)}
    for wanted in _PREVIEW_NAMES:
        actual = names.get(wanted)
        if actual:
            return os.path.join(item_dir, actual)
    return ""


def _dir_stats(item_dir: str) -> tuple[int, float]:
    """递归统计目录总字节数与最新 mtime。"""
    total = 0
    newest = 0.0
    for root, _dirnames, filenames in os.walk(item_dir):
        for filename in filenames:
            full_path = os.path.join(root, filename)
            try:
                st = os.stat(full_path)
            except OSError:
                continue
            total += st.st_size
            if st.st_mtime > newest:
                newest = st.st_mtime
    if newest == 0.0:
        try:
            newest = os.stat(item_dir).st_mtime
        except OSError:
            newest = 0.0
    return total, newest


def _as_str_list(value) -> list[str]:
    if not isinstance(value, (list, tuple)):
        return []
    return [str(item) for item in value if isinstance(item, (str, int, float))]


def _build_item(root: str, name: str, with_sizes: bool) -> dict | None:
    """构造单个作品信息；不是有效作品（没有 pkg）时返回 ``None``。"""
    item_dir = os.path.join(root, name)
    try:
        pkg_files = _find_pkgs(item_dir)
        if not pkg_files:
            return None
        project = _read_project(item_dir)
        preview = _find_preview(item_dir, str(project.get("preview") or ""))
        if with_sizes:
            size, newest = _dir_stats(item_dir)
        else:
            try:
                newest = os.stat(item_dir).st_mtime
            except OSError:
                newest = 0.0
            size = 0
        workshop_id = project.get("workshopid") or project.get("workshop_id") or name
        title = str(project.get("title") or "").strip() or name
        item_type = str(project.get("type") or "").strip().lower() or "unknown"
        return {
            "id": str(name),
            "dir": os.path.abspath(item_dir),
            "title": title,
            "type": item_type,
            "preview": preview,
            "pkg": pkg_files[0],
            "pkg_count": len(pkg_files),
            "size": size,
            "mtime": _iso_time(newest),
            "tags": _as_str_list(project.get("tags")),
            "description": str(project.get("description") or ""),
            "workshop_id": str(workshop_id).strip(),
        }
    except Exception:  # 单个作品失败绝不能拖垮整个扫描
        return None


def _id_sort_key(name: str) -> tuple[int, object]:
    return (0, int(name)) if name.isdigit() else (1, name.casefold())


def scan_items(
    dirs=None,
    with_sizes: bool = True,
    max_items: int = 5000,
    on_progress: ProgressCallback | None = None,
) -> list[dict]:
    """扫描 workshop 目录，返回 SPEC 6.5 items 结构。

    :param dirs: 一个或多个 ``steamapps\\workshop\\content\\431960`` 目录。
    :param with_sizes: 是否递归统计体积与最新修改时间（关掉可显著加速）。
    :param max_items: 最多返回多少个作品。
    :param on_progress: 回调 ``(done, total, title)``，按候选作品数推进。
    """
    roots = _as_dirs(dirs)
    candidates: list[tuple[str, str]] = []
    for root in roots:
        try:
            names = sorted(os.listdir(root), key=_id_sort_key)
        except OSError:
            continue
        for name in names:
            full_path = os.path.join(root, name)
            try:
                if os.path.isdir(full_path):
                    candidates.append((root, name))
            except OSError:
                continue
    if max_items is not None and max_items >= 0:
        candidates = candidates[:max_items]

    total = len(candidates)
    items: list[dict] = []
    for index, (root, name) in enumerate(candidates, 1):
        item = _build_item(root, name, with_sizes)
        if item is not None:
            items.append(item)
        if on_progress is not None:
            try:
                on_progress(index, total, item["title"] if item else name)
            except Exception:
                pass
    return items


def scan_dirs_summary(dirs) -> list[dict]:
    """快速汇总每个 workshop 目录下的作品数，供 UI 显示。

    :return: ``[{"path", "count", "error"}]``，``count`` 为含 .pkg 的子目录数。
    """
    summary: list[dict] = []
    for root in _as_dirs(dirs):
        count = 0
        error: str | None = None
        try:
            with os.scandir(root) as entries:
                for entry in entries:
                    try:
                        if not entry.is_dir():
                            continue
                        with os.scandir(entry.path) as sub_entries:
                            if any(
                                sub.is_file() and sub.name.lower().endswith(".pkg")
                                for sub in sub_entries
                            ):
                                count += 1
                    except OSError:
                        continue
        except OSError as exc:
            error = f"无法读取目录：{exc.strerror or exc}"
        summary.append({"path": root, "count": count, "error": error})
    return summary
