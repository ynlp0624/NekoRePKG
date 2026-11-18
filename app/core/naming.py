"""解包输出子文件夹的命名规则。

优先级/模式：
- auto      工坊包（父目录是数字 ID）→ 用 ID；否则用精简后的作品名；再退回包名
- id        强制用父目录数字 ID（没有则退回精简作品名/包名）
- title     精简后的 project.json 标题（没有则退回 ID/包名）
- id_title  「ID + 简短名称」（过长会截断）
- pkg       包文件名（scene.pkg → scene）
- none      不建子文件夹（旧行为）
"""
from __future__ import annotations

import json
import re
from pathlib import Path

MODES = ("auto", "id", "title", "id_title", "pkg", "none")
DEFAULT_MAX_LEN = 40

# 去掉 [..] 【..】 (..) （..） 这类附加标签（如 [4K]、[Mouse Effect...]）
_BRACKET_GROUPS = re.compile(r"\[[^\]]*\]|【[^】]*】|\([^)]*\)|（[^）]*）")
_INVALID_CHARS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
_SPACE = re.compile(r"\s+")
_WIN_RESERVED = {
    "CON", "PRN", "AUX", "NUL",
    *(f"COM{i}" for i in range(1, 10)),
    *(f"LPT{i}" for i in range(1, 10)),
}


def read_project(pkg_path: str | Path) -> dict:
    """读取 pkg 同目录下的 project.json（没有或坏掉时返回空 dict）。"""
    try:
        path = Path(pkg_path).parent / "project.json"
        if not path.is_file():
            return {}
        data = json.loads(path.read_text(encoding="utf-8-sig"))
        return data if isinstance(data, dict) else {}
    except (OSError, ValueError):
        return {}


def detect_id(pkg_path: str | Path) -> str | None:
    """工坊包：父目录名是纯数字时视为作品 ID。"""
    try:
        name = Path(pkg_path).parent.name.strip()
    except (OSError, ValueError):
        return None
    return name if name.isdigit() else None


def sanitize(name: str, max_len: int = DEFAULT_MAX_LEN) -> str:
    """清掉 Windows 非法字符、压缩空白、截断并去掉首尾的点与空格。"""
    text = _INVALID_CHARS.sub(" ", str(name or ""))
    text = _SPACE.sub(" ", text).strip(" .\t")
    if not text:
        return ""
    if len(text) > max_len:
        text = text[:max_len].rstrip(" .")
    if text.upper() in _WIN_RESERVED:
        text = f"_{text}"
    return text


def short_title(title: str, max_len: int = DEFAULT_MAX_LEN) -> str:
    """把标题里 [4K]/[长英文副标题] 之类的标签去掉，再清洗截断。"""
    raw = str(title or "").strip()
    if not raw:
        return ""
    stripped = _BRACKET_GROUPS.sub(" ", raw)
    return sanitize(stripped, max_len)


def resolve_folder(pkg_path: str | Path, mode: str = "auto", max_len: int = DEFAULT_MAX_LEN) -> str | None:
    """算出某个 .pkg 应该输出到的子文件夹名；None 表示不建子文件夹。"""
    mode = (mode or "auto").strip().lower()
    if mode not in MODES:
        mode = "auto"
    if mode == "none":
        return None
    try:
        max_len = int(max_len)
    except (TypeError, ValueError):
        max_len = DEFAULT_MAX_LEN
    max_len = max(8, min(80, max_len))

    pkg = Path(pkg_path)
    workshop_id = detect_id(pkg)
    project = read_project(pkg)
    title = short_title(project.get("title", ""), max_len)
    stem = sanitize(pkg.stem, max_len)

    if mode == "id":
        return workshop_id or title or stem or "output"
    if mode == "title":
        return title or workshop_id or stem or "output"
    if mode == "pkg":
        return stem or "output"
    if mode == "id_title":
        if workshop_id and title:
            combined = sanitize(f"{workshop_id} {title}", max_len)
            return combined or workshop_id
        return workshop_id or title or stem or "output"

    # auto（默认）：工坊 ID 优先，其次精简标题，最后包名
    return workshop_id or title or stem or "output"
