"""Wallpaper Engine .pkg 文件格式读写（纯 Python 实现，不依赖 RePKG.exe）。

格式（全部小端）：

    i32  magic_len  + magic（UTF-8 字节，通常为 "PKGV0021"）
    i32  entry_count
    重复 entry_count 次：
        i32 path_len + path（UTF-8 字节，用 ``\\`` 分隔）
        i32 offset（相对数据区起点）
        i32 length
    数据区从「头部结束位置」开始。

注意：写入时长度前缀一律使用 **字节长度**。RePKG 的 C# 写入器误用了
字符数，遇到中文路径会产生坏包，这里不复刻该 bug。
"""

from __future__ import annotations

import fnmatch
import os
import stat
import struct
import tempfile
from dataclasses import dataclass, field
from functools import lru_cache
from typing import Callable, Iterable, Sequence

__all__ = [
    "PkgError",
    "Entry",
    "Package",
    "DEFAULT_MAGIC",
    "DEFAULT_EXCLUDE",
    "read_package",
    "iter_entries",
    "read_entry_bytes",
    "inspect_file",
    "write_package",
    "pack_directory",
]

MAX_MAGIC_LEN = 32          # 与 RePKG 一致：魔数最多保留 32 个字符
MAX_PATH_LEN = 32768        # 单个路径长度合理性上限（防止坏包拖垮解析）
INT32_MAX = 0x7FFFFFFF
DEFAULT_MAGIC = "PKGV0021"
DEFAULT_EXCLUDE = ["project.json", "preview.jpg", "preview.png", "*.tex-json"]
COPY_CHUNK = 1024 * 1024    # 读写大文件时的块大小

ProgressCallback = Callable[[int, int, str], None]


class PkgError(Exception):
    """pkg 读写错误，``str(exc)`` 为可读中文原因。"""


@dataclass
class Entry:
    """pkg 内的一个条目（不预载文件内容）。"""

    path: str
    offset: int
    length: int


@dataclass
class Package:
    """pkg 头部解析结果。"""

    magic: str
    entries: list[Entry]
    header_size: int
    data_size: int
    file_size: int
    warnings: list[str] = field(default_factory=list)


class _SequentialReader:
    """按块预读的顺序读取器，避免逐字段 read 的系统调用开销。"""

    __slots__ = ("_fp", "_buf", "_pos", "_chunk", "total")

    def __init__(self, fp, chunk: int = 256 * 1024) -> None:
        self._fp = fp
        self._buf = b""
        self._pos = 0
        self._chunk = chunk
        self.total = 0

    def read(self, n: int, what: str = "数据") -> bytes:
        if n < 0:
            raise PkgError(f"文件已损坏（{what}长度为负数）")
        while len(self._buf) - self._pos < n:
            want = max(n - (len(self._buf) - self._pos), self._chunk)
            chunk = self._fp.read(want)
            if not chunk:
                raise PkgError(f"文件已损坏或被截断（读取{what}时数据不足）")
            self._buf = self._buf[self._pos:] + chunk
            self._pos = 0
        out = self._buf[self._pos:self._pos + n]
        self._pos += n
        self.total += n
        return out

    def read_i32(self, what: str) -> int:
        return struct.unpack("<i", self.read(4, what))[0]


@lru_cache(maxsize=64)
def _read_header_cached(path: str, file_size: int, mtime_ns: int):
    """解析头部；结果按 (路径, 大小, mtime) 缓存，重复调用零成本。"""
    try:
        fp = open(path, "rb")
    except OSError as exc:
        raise PkgError(f"无法打开文件：{path}（{exc}）") from None
    with fp:
        reader = _SequentialReader(fp)
        magic_len = reader.read_i32("魔数长度")
        if magic_len <= 0 or magic_len > 64:
            raise PkgError(f"不是有效的 pkg 文件（魔数长度异常：{magic_len}）")
        magic_raw = reader.read(magic_len, "魔数")
        warnings: list[str] = []
        try:
            magic = magic_raw.decode("utf-8")
        except UnicodeDecodeError:
            magic = magic_raw.decode("utf-8", "replace")
            warnings.append("魔数不是合法的 UTF-8，已用占位字符替换")
        if len(magic) > MAX_MAGIC_LEN:
            magic = magic[:MAX_MAGIC_LEN]
            warnings.append(f"魔数超过 {MAX_MAGIC_LEN} 个字符，已按 RePKG 的行为截断")
        if not magic.startswith("PKGV"):
            raise PkgError(f"不是有效的 pkg 文件（魔数为 {magic!r}，应以 PKGV 开头）")

        count = reader.read_i32("条目数")
        if count < 0:
            raise PkgError(f"不是有效的 pkg 文件（条目数为负数：{count}）")
        # 每条至少 12 字节（path_len + offset + length），用于快速拒绝荒诞条目数
        if count * 12 > file_size - reader.total:
            raise PkgError(
                f"不是有效的 pkg 文件（条目数 {count} 超出文件可容纳的范围，文件可能已损坏）"
            )

        entries: list[Entry] = []
        for index in range(count):
            path_len = reader.read_i32(f"第 {index + 1} 个条目的路径长度")
            if path_len < 0 or path_len > MAX_PATH_LEN:
                raise PkgError(f"文件已损坏（第 {index + 1} 个条目的路径长度异常：{path_len}）")
            path_raw = reader.read(path_len, f"第 {index + 1} 个条目的路径")
            try:
                entry_path = path_raw.decode("utf-8")
            except UnicodeDecodeError:
                entry_path = path_raw.decode("utf-8", "replace")
                warnings.append(f"第 {index + 1} 个条目的路径不是合法的 UTF-8，已用占位字符替换")
            offset = reader.read_i32(f"第 {index + 1} 个条目的 offset")
            length = reader.read_i32(f"第 {index + 1} 个条目的 length")
            if offset < 0 or length < 0:
                raise PkgError(f"文件已损坏（第 {index + 1} 个条目的偏移或长度是负数）")
            entries.append(Entry(entry_path, offset, length))

        header_size = reader.total
        data_size = file_size - header_size
        if data_size < 0:
            raise PkgError("文件已损坏（头部长度超过文件本身）")

    for entry in entries:
        if entry.offset + entry.length > data_size:
            warnings.append(
                f"条目数据越界：{entry.path}（offset={entry.offset}, length={entry.length}, 数据区={data_size}）"
            )
    return magic, tuple(entries), header_size, data_size, file_size, tuple(warnings)


def _read_header(path) -> tuple[str, list[Entry], int, int, int, list[str]]:
    """读取并校验 pkg 头部，返回可变副本。"""
    real_path = os.path.abspath(os.fspath(path))
    try:
        st = os.stat(real_path)
    except OSError as exc:
        raise PkgError(f"无法读取文件：{real_path}（{exc}）") from None
    if not stat.S_ISREG(st.st_mode):
        raise PkgError(f"不是普通文件：{real_path}")
    magic, entries, header_size, data_size, file_size, warnings = _read_header_cached(
        real_path, st.st_size, st.st_mtime_ns
    )
    return magic, list(entries), header_size, data_size, file_size, list(warnings)


def read_package(path) -> Package:
    """读取 pkg 头部（不读数据区），损坏时抛 :class:`PkgError`。"""
    magic, entries, header_size, data_size, file_size, warnings = _read_header(path)
    return Package(magic, entries, header_size, data_size, file_size, warnings)


def iter_entries(path) -> list[Entry]:
    """只读头部返回条目列表；大包（>100MB）也不会读取数据区。"""
    return _read_header(path)[1]


def read_entry_bytes(path, entry: Entry) -> bytes:
    """读取单个条目的文件内容。"""
    _, _, header_size, data_size, _, _ = _read_header(path)
    if entry.offset < 0 or entry.length < 0:
        raise PkgError(f"条目偏移或长度非法：{entry.path}")
    if entry.offset + entry.length > data_size:
        raise PkgError(
            f"条目数据越界：{entry.path}（offset={entry.offset}, length={entry.length}, 数据区={data_size}）"
        )
    try:
        with open(os.fspath(path), "rb") as fp:
            fp.seek(header_size + entry.offset)
            data = fp.read(entry.length)
    except OSError as exc:
        raise PkgError(f"读取条目失败：{entry.path}（{exc}）") from None
    if len(data) != entry.length:
        raise PkgError(f"读取条目数据不足，文件可能已损坏：{entry.path}")
    return data


def inspect_file(path) -> dict:
    """解析 pkg 头部并汇总信息，结构匹配 SPEC 6.2 的 entries/by_ext。

    返回 ``{"magic", "entry_count", "data_size", "entries", "by_ext", "warnings"}``。
    """
    pkg = read_package(path)
    entries: list[dict] = []
    by_ext: dict[str, dict] = {}
    for entry in pkg.entries:
        p = entry.path
        sep = max(p.rfind("\\"), p.rfind("/"))
        name = p[sep + 1:] if sep >= 0 else p
        dir_name = p[:sep] if sep >= 0 else ""
        ext = os.path.splitext(name)[1].lower()
        entries.append(
            {
                "path": p,
                "name": name,
                "dir": dir_name,
                "ext": ext,
                "type": "texture" if ext == ".tex" else "binary",
                "size": entry.length,
                "offset": entry.offset,
            }
        )
        bucket = by_ext.get(ext)
        if bucket is None:
            bucket = by_ext[ext] = {"ext": ext, "count": 0, "size": 0}
        bucket["count"] += 1
        bucket["size"] += entry.length
    return {
        "magic": pkg.magic,
        "entry_count": len(pkg.entries),
        "data_size": pkg.data_size,
        "entries": entries,
        "by_ext": sorted(by_ext.values(), key=lambda item: (-item["size"], item["ext"])),
        "warnings": pkg.warnings,
    }


def _normalize_rel_path(value) -> str:
    """统一成 ``\\`` 分隔、无前导分隔符的相对路径。"""
    path = str(value).replace("/", "\\").lstrip("\\")
    if not path:
        raise PkgError("条目路径不能为空")
    return path


def _prepare_items(entries: Sequence[tuple]) -> tuple[list[dict], int]:
    """把 (相对路径, bytes|源文件路径) 规整为内部结构。"""
    if not entries:
        raise PkgError("没有要打包的条目")
    items: list[dict] = []
    total = 0
    for raw_path, value in entries:
        rel_path = _normalize_rel_path(raw_path)
        if isinstance(value, (bytes, bytearray, memoryview)):
            data = bytes(value)
            size = len(data)
            items.append({"path": rel_path, "size": size, "data": data})
        else:
            try:
                source = os.fspath(value)
            except TypeError:
                raise PkgError(f"条目内容必须是 bytes 或文件路径：{rel_path}") from None
            source = os.path.abspath(source)
            if not os.path.isfile(source):
                raise PkgError(f"源文件不存在：{source}")
            try:
                size = os.path.getsize(source)
            except OSError as exc:
                raise PkgError(f"无法读取源文件：{source}（{exc}）") from None
            if size > INT32_MAX:
                raise PkgError(f"单个条目超过 2GB，无法打包：{rel_path}")
            items.append({"path": rel_path, "size": size, "source": source})
        total += size
        if total > INT32_MAX:
            raise PkgError("数据区总大小超过 2GB，无法打包")
    return items, total


def _build_header(items: Sequence[dict], magic: str) -> bytes:
    """生成完整条目头（offset 相对数据区累加）。"""
    magic_text = str(magic)
    magic_bytes = magic_text.encode("utf-8")
    if not magic_text.startswith("PKGV"):
        raise PkgError(f"魔数必须以 PKGV 开头：{magic_text!r}")
    if not 0 < len(magic_bytes) <= MAX_MAGIC_LEN:
        raise PkgError(f"魔数字节长度必须在 1~{MAX_MAGIC_LEN} 之间：{magic_text!r}")
    buf = bytearray()
    buf += struct.pack("<i", len(magic_bytes))
    buf += magic_bytes
    buf += struct.pack("<i", len(items))
    offset = 0
    for item in items:
        path_bytes = item["path"].encode("utf-8")
        if len(path_bytes) > MAX_PATH_LEN:
            raise PkgError(f"条目路径过长：{item['path']}")
        buf += struct.pack("<i", len(path_bytes))
        buf += path_bytes
        buf += struct.pack("<i", offset)
        buf += struct.pack("<i", item["size"])
        offset += item["size"]
    return bytes(buf)


def _atomic_write(output_path: str, header: bytes, items: Sequence[dict], on_progress=None) -> int:
    """先写同目录临时文件再原子替换，返回最终文件总字节数。"""
    out_dir = os.path.dirname(output_path) or os.curdir
    if not os.path.isdir(out_dir):
        raise PkgError(f"输出目录不存在：{out_dir}")
    total_bytes = len(header) + sum(item["size"] for item in items)
    # done 以「已写入文件的字节数」计（含头部），保证进度最后能到 100%
    done = len(header)
    fd, tmp_path = tempfile.mkstemp(prefix=".nekorepkg-", suffix=".tmp", dir=out_dir)
    try:
        with os.fdopen(fd, "wb", buffering=COPY_CHUNK) as out:
            out.write(header)
            for item in items:
                if "data" in item:
                    out.write(item["data"])
                    done += item["size"]
                    if on_progress is not None:
                        on_progress(done, total_bytes, item["path"])
                    continue
                source = item["source"]
                remaining = item["size"]
                try:
                    with open(source, "rb") as fp:
                        while remaining > 0:
                            chunk = fp.read(min(COPY_CHUNK, remaining))
                            if not chunk:
                                raise PkgError(f"读取源文件失败（内容比预期短）：{source}")
                            out.write(chunk)
                            remaining -= len(chunk)
                            done += len(chunk)
                            if on_progress is not None:
                                on_progress(done, total_bytes, item["path"])
                except OSError as exc:
                    raise PkgError(f"读取源文件失败：{source}（{exc}）") from None
            out.flush()
            os.fsync(out.fileno())
    except BaseException:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise
    try:
        os.replace(tmp_path, output_path)
    except OSError as exc:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
        raise PkgError(f"写入 pkg 失败：{output_path}（{exc}）") from None
    return total_bytes


def write_package(output_path, entries: Iterable[tuple], magic: str = DEFAULT_MAGIC) -> dict:
    """把 ``(相对路径, bytes | 源文件路径)`` 列表写成 pkg。

    :return: ``{"entries": 条目数, "bytes": 文件总字节数}``
    """
    output = os.path.abspath(os.fspath(output_path))
    items, _ = _prepare_items(list(entries))
    header = _build_header(items, magic)
    written = _atomic_write(output, header, items)
    return {"entries": len(items), "bytes": written}


def _is_excluded(rel_path: str, patterns: Sequence[str]) -> bool:
    """排除规则同时匹配相对路径和文件名，大小写不敏感。"""
    name = rel_path.rsplit("\\", 1)[-1]
    low_rel = rel_path.casefold()
    low_name = name.casefold()
    for pattern in patterns:
        pat = str(pattern).strip().replace("/", "\\")
        if not pat:
            continue
        low_pat = pat.casefold()
        if fnmatch.fnmatchcase(low_rel, low_pat) or fnmatch.fnmatchcase(low_name, low_pat):
            return True
    return False


def pack_directory(
    source_dir,
    output_pkg,
    exclude: Sequence[str] | None = None,
    magic: str = DEFAULT_MAGIC,
    on_progress: ProgressCallback | None = None,
) -> dict:
    """递归打包目录为 pkg。

    :param exclude: 排除规则（支持 ``*`` 通配符，同时匹配相对路径与文件名）；
        传 ``None`` 时使用 :data:`DEFAULT_EXCLUDE`，传 ``[]`` 表示不过滤。
    :param on_progress: 回调 ``(done_bytes, total_bytes, rel_path)``，
        ``total_bytes`` 为最终 pkg 的字节数（含头部），结束时应等于 ``bytes``。
    :return: ``{"entries": 条目数, "bytes": 文件总字节数, "skipped": [{"path", "reason"}]}``
    """
    source = os.path.abspath(os.fspath(source_dir))
    if not os.path.isdir(source):
        raise PkgError(f"源目录不存在：{source}")
    patterns = list(DEFAULT_EXCLUDE if exclude is None else exclude)

    items: list[dict] = []
    skipped: list[dict] = []
    total = 0
    for root, dirnames, filenames in os.walk(source):
        dirnames.sort()
        for filename in sorted(filenames):
            full_path = os.path.join(root, filename)
            rel_path = os.path.relpath(full_path, source).replace(os.sep, "\\")
            if _is_excluded(rel_path, patterns):
                continue
            try:
                st = os.stat(full_path)
            except OSError as exc:
                skipped.append({"path": rel_path, "reason": f"无法读取文件信息：{exc}"})
                continue
            if not stat.S_ISREG(st.st_mode):
                skipped.append({"path": rel_path, "reason": "不是普通文件"})
                continue
            if st.st_size > INT32_MAX:
                skipped.append({"path": rel_path, "reason": "文件超过 2GB，pkg 格式不支持"})
                continue
            try:
                with open(full_path, "rb"):
                    pass
            except OSError as exc:
                skipped.append({"path": rel_path, "reason": f"无法读取文件：{exc}"})
                continue
            items.append({"path": rel_path, "size": st.st_size, "source": full_path})
            total += st.st_size
    if not items:
        raise PkgError("源目录里没有可打包的文件（可能都被排除规则过滤了）")

    output = os.path.abspath(os.fspath(output_pkg))
    header = _build_header(items, magic)
    written = _atomic_write(output, header, items, on_progress)
    return {"entries": len(items), "bytes": written, "skipped": skipped}
