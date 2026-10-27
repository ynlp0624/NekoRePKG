"""pkgfmt 的单元测试：自身读写、RePKG.exe 交叉验证、损坏包、目录打包。

运行：``E:\\repkg\\.venv\\Scripts\\python.exe tests\\test_pkgfmt.py``
"""

from __future__ import annotations

import os
import shutil
import struct
import subprocess
import sys
import time
import unittest

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(TESTS_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)
if TESTS_DIR not in sys.path:
    sys.path.insert(0, TESTS_DIR)

import make_fixture  # noqa: E402
from app.core import pkgfmt  # noqa: E402

REPKG = os.path.join(PROJECT_ROOT, "resources", "RePKG.exe")
WORK_DIR = make_fixture.WORK_DIR


def _run_repkg(*args: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [REPKG, *args],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        timeout=300,
    )


def _file_map(root: str) -> dict[str, str]:
    """相对路径（小写、反斜杠）→ 绝对路径。"""
    result: dict[str, str] = {}
    for current, _dirnames, filenames in os.walk(root):
        for name in filenames:
            full_path = os.path.join(current, name)
            rel_path = os.path.relpath(full_path, root).replace(os.sep, "\\")
            result[rel_path.casefold()] = full_path
    return result


def _build_raw(
    entries: list[tuple[bytes, int, int]],
    magic: bytes = b"PKGV0021",
    count: int | None = None,
    data: bytes = b"",
) -> bytes:
    """手工拼 pkg 字节流，用于构造损坏样本。"""
    parts = [struct.pack("<i", len(magic)), magic, struct.pack("<i", len(entries) if count is None else count)]
    for path_bytes, offset, length in entries:
        parts.append(struct.pack("<i", len(path_bytes)))
        parts.append(path_bytes)
        parts.append(struct.pack("<i", offset))
        parts.append(struct.pack("<i", length))
    return b"".join(parts) + data


class PkgFormatTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture = make_fixture.ensure()
        cls.src_tree = cls.fixture["src_tree"]
        cls.fixture_pkg = cls.fixture["fixture_pkg"]
        cls.manual_pkg = cls.fixture["manual_pkg"]

    def setUp(self) -> None:
        self.case_dir = os.path.join(WORK_DIR, "cases", self.id().rsplit(".", 1)[-1])
        shutil.rmtree(self.case_dir, ignore_errors=True)
        os.makedirs(self.case_dir, exist_ok=True)

    # ---------- 自身读写 ----------

    def test_fixture_package_structure(self) -> None:
        pkg = pkgfmt.read_package(self.fixture_pkg)
        file_size = os.path.getsize(self.fixture_pkg)
        self.assertEqual(pkg.magic, "PKGV0021")
        self.assertEqual(pkg.file_size, file_size)
        self.assertEqual(pkg.header_size + pkg.data_size, file_size)
        self.assertEqual(len(pkg.entries), 8)
        self.assertEqual(pkg.warnings, [])
        paths = {entry.path for entry in pkg.entries}
        self.assertIn("materials\\中文目录\\壁纸.json", paths)
        self.assertIn("utf8_雫ねこ★ボイス.txt", paths)
        self.assertIn("noext", paths)
        self.assertIn("空格 目录\\子 目录.json", paths)
        self.assertEqual(sum(entry.length for entry in pkg.entries), pkg.data_size)
        for entry in pkg.entries:
            self.assertGreaterEqual(entry.offset, 0)
            self.assertLessEqual(entry.offset + entry.length, pkg.data_size)

    def test_read_entry_bytes_matches_source(self) -> None:
        pkg = pkgfmt.read_package(self.fixture_pkg)
        src_map = _file_map(self.src_tree)
        for entry in pkg.entries:
            data = pkgfmt.read_entry_bytes(self.fixture_pkg, entry)
            source = src_map[entry.path.casefold()]
            with open(source, "rb") as fp:
                expected = fp.read()
            self.assertEqual(data, expected, msg=f"条目内容不一致：{entry.path}")

    def test_iter_entries_is_cached_and_fast(self) -> None:
        first = pkgfmt.iter_entries(self.fixture_pkg)
        started = time.perf_counter()
        second = pkgfmt.iter_entries(self.fixture_pkg)
        elapsed = time.perf_counter() - started
        self.assertEqual([entry.path for entry in first], [entry.path for entry in second])
        self.assertLess(elapsed, 0.05)

    def test_manual_pkg_with_unicode_paths(self) -> None:
        pkg = pkgfmt.read_package(self.manual_pkg)
        self.assertEqual(pkg.magic, "PKGV0021")
        rows = {entry.path: entry for entry in pkg.entries}
        self.assertEqual(rows["manual\\中文.txt"].length, len("手动拼接的内容 ✓".encode("utf-8")))
        self.assertEqual(rows["manual\\empty.bin"].length, 0)
        self.assertEqual(
            pkgfmt.read_entry_bytes(self.manual_pkg, rows["根文件.json"]), b'{"manual": true}'
        )
        self.assertEqual(pkgfmt.read_entry_bytes(self.manual_pkg, rows["manual\\empty.bin"]), b"")

    def test_write_package_roundtrip(self) -> None:
        source = os.path.join(WORK_DIR, "src_tree", "materials", "deep", "nested", "dir", "data.bin")
        out_pkg = os.path.join(self.case_dir, "roundtrip.pkg")
        result = pkgfmt.write_package(
            out_pkg,
            [
                ("目录\\中文.json", b'{"a": 1}'),
                ("plain.bin", source),
                ("empty", b""),
            ],
            magic="PKGV0019",
        )
        self.assertEqual(result["entries"], 3)
        self.assertEqual(result["bytes"], os.path.getsize(out_pkg))
        pkg = pkgfmt.read_package(out_pkg)
        self.assertEqual(pkg.magic, "PKGV0019")
        self.assertEqual([entry.path for entry in pkg.entries], ["目录\\中文.json", "plain.bin", "empty"])
        self.assertEqual(pkgfmt.read_entry_bytes(out_pkg, pkg.entries[1]), bytes(range(256)) * 4)

    def test_write_package_rejects_bad_input(self) -> None:
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.write_package(os.path.join(self.case_dir, "empty.pkg"), [])
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.write_package(
                os.path.join(self.case_dir, "bad_magic.pkg"), [("a.txt", b"x")], magic="NOTPKG"
            )
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.write_package(
                os.path.join(self.case_dir, "missing.pkg"),
                [("a.txt", os.path.join(self.case_dir, "not-exists.bin"))],
            )

    def test_write_package_is_atomic_on_failure(self) -> None:
        out_pkg = os.path.join(self.case_dir, "atomic.pkg")
        with open(out_pkg, "wb") as fp:
            fp.write(b"old-content")
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.write_package(
                out_pkg,
                [
                    ("ok.txt", b"fine"),
                    ("broken.txt", os.path.join(self.case_dir, "not-exists.bin")),
                ],
            )
        with open(out_pkg, "rb") as fp:
            self.assertEqual(fp.read(), b"old-content")
        leftovers = [name for name in os.listdir(self.case_dir) if name.endswith(".tmp")]
        self.assertEqual(leftovers, [])

    # ---------- RePKG.exe 交叉验证 ----------

    def test_repkg_extract_matches_source_tree(self) -> None:
        if not os.path.isfile(REPKG):
            self.skipTest("RePKG.exe 不存在")
        out_dir = os.path.join(self.case_dir, "extract")
        result = _run_repkg("extract", "-o", out_dir, self.fixture_pkg)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        expected = _file_map(self.src_tree)
        actual = _file_map(out_dir)
        self.assertEqual(sorted(expected), sorted(actual))
        for rel_path, source_path in expected.items():
            with open(source_path, "rb") as fp:
                expected_bytes = fp.read()
            with open(actual[rel_path], "rb") as fp:
                actual_bytes = fp.read()
            self.assertEqual(expected_bytes, actual_bytes, msg=f"解包内容不一致：{rel_path}")

    def test_writer_output_listed_by_repkg_info(self) -> None:
        if not os.path.isfile(REPKG):
            self.skipTest("RePKG.exe 不存在")
        out_pkg = os.path.join(self.case_dir, "info.pkg")
        wanted = ["materials\\中文目录\\列表.json", "utf8_雫ねこ★.bin", "noext"]
        entries = [(path, f"payload-{index}".encode("utf-8")) for index, path in enumerate(wanted)]
        pkgfmt.write_package(out_pkg, entries)
        result = _run_repkg("info", "-e", out_pkg)
        self.assertEqual(result.returncode, 0, msg=result.stdout + result.stderr)
        for path in wanted:
            self.assertIn(path, result.stdout)
        self.assertIn("Package entries", result.stdout)

    # ---------- inspect ----------

    def test_inspect_file_by_ext(self) -> None:
        out_pkg = os.path.join(self.case_dir, "inspect.pkg")
        entries = [
            ("materials\\a.json", b"0123456789"),
            ("materials\\dir\\b.tex", b"x" * 20),
            ("materials\\dir\\c.TEX", b"y" * 30),
            ("noext", b"12345"),
            ("images\\p.png", b"z" * 7),
        ]
        pkgfmt.write_package(out_pkg, entries)
        info = pkgfmt.inspect_file(out_pkg)
        self.assertEqual(info["magic"], "PKGV0021")
        self.assertEqual(info["entry_count"], 5)
        self.assertEqual(info["data_size"], 10 + 20 + 30 + 5 + 7)
        self.assertEqual(info["warnings"], [])
        self.assertEqual(
            info["by_ext"],
            [
                {"ext": ".tex", "count": 2, "size": 50},
                {"ext": ".json", "count": 1, "size": 10},
                {"ext": ".png", "count": 1, "size": 7},
                {"ext": "", "count": 1, "size": 5},
            ],
        )
        by_path = {row["path"]: row for row in info["entries"]}
        row = by_path["materials\\dir\\b.tex"]
        self.assertEqual(row["name"], "b.tex")
        self.assertEqual(row["dir"], "materials\\dir")
        self.assertEqual(row["ext"], ".tex")
        self.assertEqual(row["type"], "texture")
        self.assertEqual(row["size"], 20)
        self.assertEqual(by_path["noext"]["dir"], "")
        self.assertEqual(by_path["images\\p.png"]["type"], "binary")
        self.assertEqual(by_path["materials\\dir\\c.TEX"]["ext"], ".tex")

    # ---------- 损坏包 ----------

    def _write(self, name: str, data: bytes) -> str:
        path = os.path.join(self.case_dir, name)
        with open(path, "wb") as fp:
            fp.write(data)
        return path

    def test_rejects_non_pkg(self) -> None:
        path = self._write("not_pkg.bin", b"this is definitely not a package file")
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.read_package(path)
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.inspect_file(path)

    def test_rejects_bad_magic(self) -> None:
        path = self._write("bad_magic.pkg", _build_raw([], magic=b"XXXX0001"))
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.read_package(path)

    def test_rejects_truncated_header(self) -> None:
        path = self._write("truncated.pkg", struct.pack("<i", 8) + b"PKGV0021")
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.read_package(path)

    def test_magic_longer_than_32_is_truncated(self) -> None:
        magic = b"PKGV0021" + b"x" * 40
        path = self._write("long_magic.pkg", _build_raw([], magic=magic))
        pkg = pkgfmt.read_package(path)
        self.assertEqual(pkg.magic, magic[:32].decode("utf-8"))
        self.assertTrue(any("截断" in warning for warning in pkg.warnings))

    def test_missing_file_raises_pkg_error(self) -> None:
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.read_package(os.path.join(self.case_dir, "not-exists.pkg"))

    def test_rejects_absurd_entry_count(self) -> None:
        path = self._write("absurd.pkg", _build_raw([], count=10_000_000))
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.read_package(path)

    def test_out_of_bounds_entry_warns_and_raises_on_read(self) -> None:
        path = self._write("oob.pkg", _build_raw([(b"a.bin", 0, 999)], data=b"12345"))
        pkg = pkgfmt.read_package(path)
        self.assertEqual(len(pkg.entries), 1)
        self.assertTrue(pkg.warnings, msg="越界条目应写入 warnings")
        info = pkgfmt.inspect_file(path)
        self.assertTrue(info["warnings"])
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.read_entry_bytes(path, pkg.entries[0])

    def test_truncated_file_reports_pkg_error(self) -> None:
        good = _build_raw([(b"a.bin", 0, 10)], data=b"0123456789")
        path = self._write("cut.pkg", good[: len(good) - 4])
        pkg = pkgfmt.read_package(path)
        self.assertTrue(pkg.warnings)

    # ---------- 目录打包 ----------

    def _make_tree(self, files: dict[str, bytes]) -> str:
        root = os.path.join(self.case_dir, "tree")
        for rel_path, data in files.items():
            full_path = os.path.join(root, *rel_path.split("/"))
            os.makedirs(os.path.dirname(full_path), exist_ok=True)
            with open(full_path, "wb") as fp:
                fp.write(data)
        return root

    def test_pack_directory_default_exclude(self) -> None:
        tree = self._make_tree(
            {
                "project.json": b"{}",
                "preview.jpg": b"jpg",
                "preview.png": b"png",
                "scene.json": b"{}",
                "materials/a.tex": b"tex",
                "materials/a.tex-json": b"texjson",
                "materials/sub/photo.PNG": b"PNG",
            }
        )
        out_pkg = os.path.join(self.case_dir, "default.pkg")
        result = pkgfmt.pack_directory(tree, out_pkg)
        self.assertEqual(result["entries"], 3)
        self.assertEqual(result["skipped"], [])
        paths = [entry.path for entry in pkgfmt.iter_entries(out_pkg)]
        self.assertEqual(sorted(paths), ["materials\\a.tex", "materials\\sub\\photo.PNG", "scene.json"])

    def test_pack_directory_custom_exclude_and_progress(self) -> None:
        tree = self._make_tree(
            {"keep.txt": b"a" * 10, "drop.bin": b"b" * 20, "sub\\mixed": b"c" * 5}
        )
        out_pkg = os.path.join(self.case_dir, "custom.pkg")
        progress: list[tuple[int, int, str]] = []
        result = pkgfmt.pack_directory(
            tree,
            out_pkg,
            exclude=["*.bin"],
            on_progress=lambda done, total, rel: progress.append((done, total, rel)),
        )
        self.assertEqual(result["entries"], 2)
        self.assertEqual(result["bytes"], os.path.getsize(out_pkg))
        paths = sorted(entry.path for entry in pkgfmt.iter_entries(out_pkg))
        self.assertEqual(paths, ["keep.txt", "sub\\mixed"])
        self.assertTrue(progress)
        done_values = [item[0] for item in progress]
        self.assertEqual(done_values, sorted(done_values))
        self.assertEqual(progress[-1][0], progress[-1][1])
        self.assertEqual(progress[-1][1], result["bytes"])

    def test_pack_directory_empty(self) -> None:
        tree = self._make_tree({"project.json": b"{}", "preview.jpg": b"x"})
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.pack_directory(tree, os.path.join(self.case_dir, "nothing.pkg"))
        with self.assertRaises(pkgfmt.PkgError):
            pkgfmt.pack_directory(
                os.path.join(self.case_dir, "no-such-dir"),
                os.path.join(self.case_dir, "missing.pkg"),
            )

    # ---------- 大文件性能 ----------

    def test_iter_entries_on_large_package_is_fast(self) -> None:
        entry_count = 512
        payload_size = 120 * 1024 * 1024
        rows = []
        offset = 0
        chunk = payload_size // entry_count
        for index in range(entry_count):
            rows.append((f"assets\\big_{index:04d}.bin".encode("utf-8"), offset, chunk))
            offset += chunk
        large_pkg = os.path.join(self.case_dir, "large.pkg")
        header = _build_raw(rows)
        with open(large_pkg, "wb") as fp:
            fp.write(header)
            fp.seek(len(header) + offset - 1)
            fp.write(b"\x00")
        self.assertGreater(os.path.getsize(large_pkg), 100 * 1024 * 1024)
        started = time.perf_counter()
        entries = pkgfmt.iter_entries(large_pkg)
        elapsed = time.perf_counter() - started
        self.assertEqual(len(entries), entry_count)
        self.assertLess(elapsed, 1.0, msg=f"iter_entries 读取 {entry_count} 条目耗时 {elapsed:.3f}s")
        pkg = pkgfmt.read_package(large_pkg)
        self.assertEqual(pkg.data_size, offset)
        del pkg, entries
        os.remove(large_pkg)


if __name__ == "__main__":
    unittest.main(verbosity=2)
