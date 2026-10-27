"""生成 pkgfmt 测试用的源文件树与 .pkg fixture。

产物统一放在 ``tests/_work/`` 下：

    src_tree/      源文件树（用于与 RePKG.exe 解包结果逐字节比对）
    fixture.pkg    src_tree 打包后的 pkg（pack_directory，无排除规则）
    manual.pkg     手工用 struct 拼出的 pkg（不经过 pkgfmt 写入器，用于交叉验证解析）

直接运行：``python tests/make_fixture.py``
"""

from __future__ import annotations

import json
import os
import random
import shutil
import struct
import sys

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(TESTS_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.core import pkgfmt  # noqa: E402

WORK_DIR = os.path.join(TESTS_DIR, "_work")
SRC_TREE = os.path.join(WORK_DIR, "src_tree")
FIXTURE_PKG = os.path.join(WORK_DIR, "fixture.pkg")
MANUAL_PKG = os.path.join(WORK_DIR, "manual.pkg")

BIG_FILE_SIZE = 5 * 1024 * 1024


def _write(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fp:
        fp.write(data)


def build_source_tree() -> str:
    """重建源文件树，返回目录路径。"""
    if os.path.isdir(SRC_TREE):
        shutil.rmtree(SRC_TREE)
    rng = random.Random(20261027)
    files = {
        "materials\\中文目录\\壁纸.json": json.dumps(
            {"title": "雫的测试壁纸", "type": "scene"}, ensure_ascii=False, indent=2
        ).encode("utf-8"),
        "materials\\deep\\nested\\dir\\data.bin": bytes(range(256)) * 4,
        "noext": b"no extension here\n",
        "empty.txt": b"",
        "big.bin": rng.randbytes(BIG_FILE_SIZE),
        "utf8_雫ねこ★ボイス.txt": "猫羽雫 (≧◡≦)♡ nya~\n".encode("utf-8"),
        "assets\\preview.jpg": b"\xff\xd8\xff\xe0" + b"preview bytes" * 32 + b"\xff\xd9",
        "空格 目录\\子 目录.json": b'{"spaces": true}',
    }
    for rel_path, data in files.items():
        _write(os.path.join(SRC_TREE, *rel_path.split("\\")), data)
    return SRC_TREE


def build_fixture_pkg() -> str:
    """用 pack_directory 把源文件树打成 fixture.pkg（不过滤任何文件）。"""
    pkgfmt.pack_directory(SRC_TREE, FIXTURE_PKG, exclude=[])
    return FIXTURE_PKG


def build_manual_pkg() -> str:
    """不经过 pkgfmt 写入器，手工拼一个带中文路径的 pkg，交叉验证解析。"""
    entries = [
        ("manual\\中文.txt", "手动拼接的内容 ✓".encode("utf-8")),
        ("manual\\empty.bin", b""),
        ("根文件.json", b'{"manual": true}'),
    ]
    data_parts: list[bytes] = []
    header = bytearray()
    magic = b"PKGV0021"
    header += struct.pack("<i", len(magic)) + magic
    header += struct.pack("<i", len(entries))
    offset = 0
    for rel_path, data in entries:
        path_bytes = rel_path.encode("utf-8")
        header += struct.pack("<i", len(path_bytes)) + path_bytes
        header += struct.pack("<i", offset)
        header += struct.pack("<i", len(data))
        data_parts.append(data)
        offset += len(data)
    os.makedirs(WORK_DIR, exist_ok=True)
    with open(MANUAL_PKG, "wb") as fp:
        fp.write(bytes(header))
        for part in data_parts:
            fp.write(part)
    return MANUAL_PKG


def ensure() -> dict[str, str]:
    """确保 fixture 存在并返回各路径。"""
    build_source_tree()
    build_fixture_pkg()
    build_manual_pkg()
    return {
        "work_dir": WORK_DIR,
        "src_tree": SRC_TREE,
        "fixture_pkg": FIXTURE_PKG,
        "manual_pkg": MANUAL_PKG,
    }


def main() -> int:
    paths = ensure()
    for key, value in paths.items():
        print(f"{key}: {value}")
    print(f"fixture entries: {len(pkgfmt.iter_entries(paths['fixture_pkg']))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
