"""scanner.py 的单元测试：Steam 定位、libraryfolders.vdf 解析、作品扫描。

运行：``E:\\repkg\\.venv\\Scripts\\python.exe tests\\test_scanner.py``
本机没有 Steam 时，真实探测相关的断言只要求「返回空值且不抛异常」。
"""

from __future__ import annotations

import json
import os
import shutil
import sys
import unittest
from datetime import datetime
from unittest import mock

TESTS_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(TESTS_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.core import pkgfmt, scanner  # noqa: E402

WORK_DIR = os.path.join(TESTS_DIR, "_work", "scanner")


def _write(path: str, data: bytes) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as fp:
        fp.write(data)


def _write_vdf(root: str, content: str) -> str:
    path = os.path.join(root, "steamapps", "libraryfolders.vdf")
    _write(path, content.encode("utf-8"))
    return path


def _vdf_escape(path: str) -> str:
    return path.replace("\\", "\\\\")


def _make_library_vdf(root: str, libraries: list[str], legacy: bool = False) -> None:
    os.makedirs(os.path.join(root, "steamapps"), exist_ok=True)
    lines = ['"libraryfolders"', "{"]
    if legacy:
        lines.append('\t"TimeNextStatsReport"\t\t"123456"')
        lines.append('\t"ContentStatsID"\t\t"-123456"')
        for index, library in enumerate(libraries, 1):
            lines.append(f'\t"{index}"\t\t"{_vdf_escape(library)}"')
        lines.append('\t"3"\t\t"431960"')  # 旧格式里常见但非路径的键值，应被过滤
    else:
        for index, library in enumerate(libraries):
            lines.extend(
                [
                    f'\t"{index}"',
                    "\t{",
                    f'\t\t"path"\t\t"{_vdf_escape(library)}"',
                    '\t\t"label"\t\t""',
                    '\t\t"contentid"\t\t"0"',
                    '\t\t"apps"',
                    "\t\t{",
                    '\t\t\t"431960"\t\t"123456789"',
                    "\t\t}",
                    "\t}",
                ]
            )
    lines.append("}")
    _write_vdf(root, "\n".join(lines) + "\n")


def _make_item(root: str, item_id: str, files: dict[str, bytes]) -> str:
    item_dir = os.path.join(root, item_id)
    for rel_path, data in files.items():
        _write(os.path.join(item_dir, *rel_path.split("/")), data)
    os.makedirs(item_dir, exist_ok=True)
    return item_dir


class ScannerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        shutil.rmtree(WORK_DIR, ignore_errors=True)
        os.makedirs(WORK_DIR, exist_ok=True)
        cls.workshop_root = os.path.join(WORK_DIR, "workshop", "content", "431960")
        os.makedirs(cls.workshop_root, exist_ok=True)
        cls.expected_sizes: dict[str, int] = {}
        cls.expected_mtimes: dict[str, float] = {}

        cls._make_item(
            "2169432",
            {
                "project.json": json.dumps(
                    {
                        "title": "我的壁纸",
                        "type": "scene",
                        "preview": "preview.jpg",
                        "tags": ["Anime", "Girl"],
                        "description": "测试作品",
                        "workshopid": "2169432",
                    },
                    ensure_ascii=False,
                ).encode("utf-8-sig"),  # 带 BOM
                "preview.jpg": b"jpeg-bytes",
                "scene.pkg": b"fake-pkg-bytes",
                "materials/a.tex": b"t" * 100,
            },
        )
        cls._make_item("1111", {"scene.pkg": b"only-pkg"})  # 没有 project.json
        cls._make_item(
            "4444",
            {
                "project.json": json.dumps({"title": "双包作品", "type": "scene"}).encode("utf-8"),
                "scene.pkg": b"scene",
                "video.pkg": b"video",
                "preview.gif": b"gif",
            },
        )
        cls._make_item(
            "6666",
            {"project.json": b"{broken json", "scene.pkg": b"pkg", "notes.txt": b"x"},
        )
        cls._make_item(
            "7777",
            {
                "project.json": json.dumps(
                    {"title": "BOM 作品", "type": "video", "preview": "缺失.jpg", "tags": "nope"},
                    ensure_ascii=False,
                ).encode("utf-8-sig"),
                "preview.png": b"png",
                "scene.pkg": b"pkg",
            },
        )
        cls._make_item(
            "9999", {"project.json": '{"title": "无包"}'.encode("utf-8"), "readme.txt": b"x"}
        )
        os.makedirs(os.path.join(cls.workshop_root, "5555"), exist_ok=True)
        cls._make_item("8888", {"notes.txt": b"no pkg here"})

    @classmethod
    def _make_item(cls, item_id: str, files: dict[str, bytes]) -> None:
        _make_item(cls.workshop_root, item_id, files)
        item_dir = os.path.join(cls.workshop_root, item_id)
        total = 0
        newest = 0.0
        for current, _dirnames, filenames in os.walk(item_dir):
            for name in filenames:
                full_path = os.path.join(current, name)
                st = os.stat(full_path)
                total += st.st_size
                newest = max(newest, st.st_mtime)
        cls.expected_sizes[item_id] = total
        cls.expected_mtimes[item_id] = newest

    def setUp(self) -> None:
        self.case_dir = os.path.join(WORK_DIR, "cases", self.id().rsplit(".", 1)[-1])
        shutil.rmtree(self.case_dir, ignore_errors=True)
        os.makedirs(self.case_dir, exist_ok=True)

    # ---------- Steam 定位 / 库目录 ----------

    def test_find_steam_root_does_not_raise(self) -> None:
        root = scanner.find_steam_root()
        self.assertTrue(root is None or os.path.isdir(root), msg=f"返回值异常：{root!r}")

    def test_find_workshop_dirs_extra_dirs_passthrough(self) -> None:
        extra = os.path.join(self.case_dir, "手动目录")
        dirs = scanner.find_workshop_dirs([extra])
        normalized = [os.path.normpath(path) for path in dirs]
        self.assertIn(os.path.normpath(extra), normalized)
        self.assertEqual(scanner.find_workshop_dirs(None), scanner.find_workshop_dirs([]))

    def test_parse_library_folders_new_format(self) -> None:
        root = os.path.join(self.case_dir, "steam")
        library_one = os.path.join(self.case_dir, "lib1")
        library_two = os.path.join(self.case_dir, "lib2")
        missing = os.path.join(self.case_dir, "missing-lib")
        for library in (library_one, library_two):
            os.makedirs(library, exist_ok=True)
        _make_library_vdf(root, [library_one, library_two, missing])
        folders = scanner.parse_library_folders(root)
        self.assertEqual(
            [os.path.normcase(item) for item in folders],
            [os.path.normcase(root), os.path.normcase(library_one), os.path.normcase(library_two)],
        )

    def test_parse_library_folders_legacy_format(self) -> None:
        root = os.path.join(self.case_dir, "steam-legacy")
        library = os.path.join(self.case_dir, "legacy-lib")
        os.makedirs(library, exist_ok=True)
        _make_library_vdf(root, [library], legacy=True)
        folders = scanner.parse_library_folders(root)
        self.assertEqual(
            [os.path.normcase(item) for item in folders],
            [os.path.normcase(root), os.path.normcase(library)],
        )

    def test_parse_library_folders_without_vdf(self) -> None:
        root = os.path.join(self.case_dir, "empty-steam")
        os.makedirs(os.path.join(root, "steamapps"), exist_ok=True)
        self.assertEqual(scanner.parse_library_folders(root), [os.path.normpath(root)])
        self.assertEqual(scanner.parse_library_folders(""), [])
        self.assertEqual(scanner.parse_library_folders(os.path.join(self.case_dir, "nope")), [])

    def test_find_workshop_dirs_with_fake_steam(self) -> None:
        root = os.path.join(self.case_dir, "steam")
        libraries = [os.path.join(self.case_dir, "liba"), os.path.join(self.case_dir, "libb")]
        for library in libraries:
            os.makedirs(os.path.join(library, *scanner.WORKSHOP_SUBDIR), exist_ok=True)
        _make_library_vdf(root, libraries)
        extra = os.path.join(self.case_dir, "extra-workshop")
        with mock.patch.object(scanner, "find_steam_root", return_value=root):
            dirs = scanner.find_workshop_dirs([extra])
        normalized = {os.path.normcase(os.path.normpath(path)) for path in dirs}
        for library in libraries:
            self.assertIn(
                os.path.normcase(os.path.join(library, *scanner.WORKSHOP_SUBDIR)), normalized
            )
        self.assertIn(os.path.normcase(os.path.normpath(extra)), normalized)

    # ---------- 作品扫描 ----------

    def _scan(self) -> list[dict]:
        return scanner.scan_items([self.workshop_root])

    def test_scan_items_fields(self) -> None:
        items = self._scan()
        ids = [item["id"] for item in items]
        self.assertEqual(ids, ["1111", "4444", "6666", "7777", "2169432"])

        by_id = {item["id"]: item for item in items}
        first = by_id["2169432"]
        self.assertEqual(first["title"], "我的壁纸")
        self.assertEqual(first["type"], "scene")
        self.assertTrue(first["preview"].endswith("preview.jpg"))
        self.assertTrue(first["pkg"].endswith("scene.pkg"))
        self.assertEqual(first["pkg_count"], 1)
        self.assertEqual(first["tags"], ["Anime", "Girl"])
        self.assertEqual(first["description"], "测试作品")
        self.assertEqual(first["workshop_id"], "2169432")
        self.assertEqual(first["size"], self.expected_sizes["2169432"])
        expected_mtime = (
            datetime.fromtimestamp(self.expected_mtimes["2169432"])
            .astimezone()
            .isoformat(timespec="seconds")
        )
        self.assertEqual(first["mtime"], expected_mtime)
        self.assertIsNotNone(scanner.os.path.isabs(first["dir"]))

        no_project = by_id["1111"]
        self.assertEqual(no_project["title"], "1111")
        self.assertEqual(no_project["type"], "unknown")
        self.assertEqual(no_project["tags"], [])
        self.assertEqual(no_project["description"], "")
        self.assertEqual(no_project["workshop_id"], "1111")
        self.assertEqual(no_project["preview"], "")
        self.assertEqual(no_project["pkg_count"], 1)

        broken = by_id["6666"]
        self.assertEqual(broken["title"], "6666")
        self.assertEqual(broken["type"], "unknown")

        bom_item = by_id["7777"]
        self.assertEqual(bom_item["title"], "BOM 作品")
        self.assertEqual(bom_item["tags"], [])
        self.assertTrue(bom_item["preview"].endswith("preview.png"))  # 声明的图缺失时回退

        dual = by_id["4444"]
        self.assertEqual(dual["pkg_count"], 2)
        self.assertTrue(dual["pkg"].endswith("scene.pkg"))  # scene.pkg 优先

        # 没有 pkg 的目录必须被跳过
        self.assertNotIn("9999", by_id)
        self.assertNotIn("5555", by_id)
        self.assertNotIn("8888", by_id)

    def test_scan_items_mtime_is_newest_file(self) -> None:
        items = {item["id"]: item for item in self._scan()}
        for item_id in ("1111", "4444", "2169432"):
            item = items[item_id]
            parsed = datetime.fromisoformat(item["mtime"])
            self.assertIsNotNone(parsed.tzinfo, msg=f"{item_id} 的 mtime 缺少时区：{item['mtime']}")

    def test_scan_items_never_raises_on_bad_input(self) -> None:
        missing = os.path.join(self.case_dir, "not-exists")
        a_file = os.path.join(self.case_dir, "a-file.txt")
        _write(a_file, b"x")
        self.assertEqual(scanner.scan_items([missing, a_file, None, ""]), [])
        self.assertEqual(scanner.scan_items(None), [])
        self.assertEqual(scanner.scan_items(self.case_dir), [])

    def test_scan_items_max_items_and_progress(self) -> None:
        progress: list[tuple[int, int, str]] = []
        items = scanner.scan_items(
            [self.workshop_root],
            max_items=2,
            on_progress=lambda done, total, title: progress.append((done, total, title)),
        )
        self.assertEqual(len(items), 2)
        self.assertEqual(progress[0][0], 1)
        self.assertEqual(progress[0][1], 2)
        self.assertEqual(progress[-1][0], 2)
        self.assertTrue(progress[0][2])

    def test_scan_items_without_sizes(self) -> None:
        items = scanner.scan_items([self.workshop_root], with_sizes=False)
        self.assertTrue(items)
        for item in items:
            self.assertEqual(item["size"], 0)
            self.assertTrue(item["mtime"])

    def test_scan_dirs_summary(self) -> None:
        summary = scanner.scan_dirs_summary([self.workshop_root, os.path.join(self.case_dir, "nope")])
        self.assertEqual(len(summary), 2)
        self.assertEqual(summary[0]["path"], os.path.normpath(self.workshop_root))
        self.assertEqual(summary[0]["count"], 5)
        self.assertIsNone(summary[0]["error"])
        self.assertEqual(summary[1]["count"], 0)
        self.assertIsNotNone(summary[1]["error"])

    def test_real_steam_scan_if_available(self) -> None:
        steam_root = scanner.find_steam_root()
        if steam_root is None:
            print("[scanner] 本机未安装 Steam，跳过真实扫描（find_steam_root 返回 None）")
            self.assertIsNone(steam_root)
            dirs = scanner.find_workshop_dirs()
            self.assertIsInstance(dirs, list)
            self.assertEqual(scanner.scan_items(dirs), [])
            return
        dirs = scanner.find_workshop_dirs()
        print(f"[scanner] Steam 根目录：{steam_root}，workshop 目录 {len(dirs)} 个")
        items = scanner.scan_items(dirs)
        print(f"[scanner] 真实扫描到作品 {len(items)} 个")
        self.assertIsInstance(items, list)
        if not items:
            return
        # 真实作品的 pkg 必须能被 pkgfmt 正确解析（真实包 magic 可能是 PKGV0002、路径用 / 分隔）
        pkg_path = items[0]["pkg"]
        info = pkgfmt.inspect_file(pkg_path)
        print(
            f"[scanner] 真实 pkg 校验：{os.path.basename(pkg_path)} "
            f"magic={info['magic']} entries={info['entry_count']}"
        )
        self.assertTrue(info["magic"].startswith("PKGV"))
        self.assertGreater(info["entry_count"], 0)
        self.assertGreaterEqual(info["data_size"], sum(row["size"] for row in info["entries"]))
        first = pkgfmt.iter_entries(pkg_path)[0]
        self.assertEqual(len(pkgfmt.read_entry_bytes(pkg_path, first)), first.length)


if __name__ == "__main__":
    unittest.main(verbosity=2)
