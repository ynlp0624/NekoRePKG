"""命名规则单元测试：python tests/test_naming.py"""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core import naming  # noqa: E402

LONG_TITLE = "[4K]Win11娘 鼠标特效+音频可视化+日期时间[Mouse Effect+Visualizer+Date&time]"
SHORT = "Win11娘 鼠标特效+音频可视化+日期时间"


def make_pkg(parent_name: str, title: str | None = None, pkg_name: str = "scene.pkg") -> Path:
    base = Path(tempfile.mkdtemp(prefix="neko_naming_")) / parent_name
    base.mkdir(parents=True)
    pkg = base / pkg_name
    pkg.write_bytes(b"fake")
    if title is not None:
        (base / "project.json").write_text(json.dumps({"title": title}, ensure_ascii=False), encoding="utf-8")
    return pkg


class NamingTest(unittest.TestCase):
    def test_detect_workshop_id(self):
        self.assertEqual(naming.detect_id(make_pkg("2595877264")), "2595877264")
        self.assertIsNone(naming.detect_id(make_pkg("my wallpaper")))

    def test_short_title_strips_brackets(self):
        self.assertEqual(naming.short_title(LONG_TITLE), SHORT)
        self.assertEqual(naming.short_title("[4K] 某作品"), "某作品")
        self.assertEqual(naming.short_title("《标题》正常"), "《标题》正常")

    def test_short_title_falls_back_when_only_brackets(self):
        self.assertEqual(naming.short_title("[4K]"), "")

    def test_sanitize_invalid_chars_and_length(self):
        self.assertEqual(naming.sanitize('a<b>c:d"e/f\\g|h?i*j'), "a b c d e f g h i j")
        self.assertEqual(len(naming.sanitize("x" * 100)), naming.DEFAULT_MAX_LEN)
        self.assertEqual(naming.sanitize("   .trail.  "), "trail")

    def test_auto_uses_id(self):
        pkg = make_pkg("2595877264", LONG_TITLE)
        self.assertEqual(naming.resolve_folder(pkg, "auto"), "2595877264")

    def test_auto_falls_back_to_title(self):
        pkg = make_pkg("my wallpaper", LONG_TITLE)
        self.assertEqual(naming.resolve_folder(pkg, "auto"), SHORT)

    def test_title_mode(self):
        pkg = make_pkg("my wallpaper", LONG_TITLE)
        self.assertEqual(naming.resolve_folder(pkg, "title"), SHORT)
        self.assertEqual(naming.resolve_folder(make_pkg("x"), "title"), "scene")

    def test_id_title_mode(self):
        pkg = make_pkg("2595877264", LONG_TITLE)
        self.assertEqual(naming.resolve_folder(pkg, "id_title", 40),
                         "2595877264 Win11娘 鼠标特效+音频可视化+日期时间")
        self.assertLessEqual(len(naming.resolve_folder(pkg, "id_title", 20)), 20)

    def test_pkg_mode_and_none(self):
        pkg = make_pkg("2595877264", LONG_TITLE, pkg_name="video.pkg")
        self.assertEqual(naming.resolve_folder(pkg, "pkg"), "video")
        self.assertIsNone(naming.resolve_folder(pkg, "none"))

    def test_unknown_mode_defaults_to_auto(self):
        pkg = make_pkg("2595877264", LONG_TITLE)
        self.assertEqual(naming.resolve_folder(pkg, "bogus"), "2595877264")

    def test_project_json_bom(self):
        pkg = make_pkg("my wallpaper")
        (pkg.parent / "project.json").write_text(
            '\ufeff{"title": "[4K] 带 BOM 的作品"}', encoding="utf-8"
        )
        self.assertEqual(naming.resolve_folder(pkg, "title"), "带 BOM 的作品")

    def test_broken_project_json_falls_back(self):
        pkg = make_pkg("my wallpaper")
        (pkg.parent / "project.json").write_text("{not json", encoding="utf-8")
        self.assertEqual(naming.resolve_folder(pkg, "auto"), "scene")

    def test_max_len_clamped(self):
        pkg = make_pkg("x", "很长的标题" * 20)
        self.assertLessEqual(len(naming.resolve_folder(pkg, "title", 8)), 8)
        self.assertGreaterEqual(len(naming.resolve_folder(pkg, "title", 1)), 8)


if __name__ == "__main__":
    unittest.main()
