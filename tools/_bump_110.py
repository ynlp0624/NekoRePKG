"""把版本号从 1.0.1 升到 1.1.0（各处引用），并更新官网文案。"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def patch(relative: str, pairs: list[tuple[str, str]]) -> None:
    path = ROOT / relative
    text = path.read_text(encoding="utf-8")
    original = text
    for old, new in pairs:
        if old not in text:
            print(f"  [skip] {relative}: {old[:50]}")
            continue
        text = text.replace(old, new)
    if text != original:
        path.write_text(text, encoding="utf-8")
        print(f"  patched {relative}")


patch("app/core/paths.py", [('APP_VERSION = "1.0.1"', 'APP_VERSION = "1.1.0"')])
patch("build/version_info.txt", [("1.0.1", "1.1.0")])
patch("app/web/js/mock.js", [("version: '1.0.1'", "version: '1.1.0'")])
patch("tools/gh-publish.js", [("const VERSION = 'v1.0.1';", "const VERSION = 'v1.1.0';")])
patch("tools/update_release_notes.js", [("const TAG = 'v1.0.1';", "const TAG = 'v1.1.0';")])
patch("tools/gitcode-release.js", [("const TAG = 'v1.0.1';", "const TAG = 'v1.1.0';")])

patch("docs/index.html", [
    ("v1.0.1 · Windows 10/11 x64 · 完全离线", "v1.1.0 · Windows 10/11 x64 · 完全离线"),
    ("当前稳定版 v1.0.1，源码 MIT 开源，内核致谢 RePKG。", "当前稳定版 v1.1.0，源码 MIT 开源，内核致谢 RePKG。"),
    (
        "v1.0.1 更新：打包页新增「排除转换出的 PNG」，回封时自动跳过由 <code>.tex</code> 转换出的图片（原始 .tex 保留），包更干净。",
        "v1.1.0 更新：解包输出自动按包建子文件夹（工坊 ID / 精简作品名），不再把不同壁纸混在同一目录；打包页的「排除转换出的 PNG」继续保留。",
    ),
    ("<tr><th>版本</th><td>v1.0.1 <span class=\"muted\">（2026-10-27）</span></td></tr>",
     "<tr><th>版本</th><td>v1.1.0 <span class=\"muted\">（2026-11-18）</span></td></tr>"),
    ("releases/v1.0.1", "releases/v1.1.0"),
    ("下载 v1.0.1", "下载 v1.1.0"),
    ("每个包会输出到独立子文件夹", "每个包会输出到独立子文件夹"),
])

patch("README.md", [
    (
        "- **解包**：拖入或选择 `.pkg`（支持多个/整个文件夹），一键解出素材与贴图 PNG；完整选项（仅/忽略扩展名、单目录、递归、复制 project.json、用作品名命名、不转贴图、覆盖）。",
        "- **解包**：拖入或选择 `.pkg`（支持多个/整个文件夹），一键解出素材与贴图 PNG；**每个包自动建独立子文件夹**——工坊包用工坊 ID（如 `2595877264`），普通包用精简作品名（去掉 `[4K]` 等标签，最多 40 字）；完整选项（仅/忽略扩展名、单目录、递归、复制 project.json、用作品名命名、不转贴图、覆盖）。",
    ),
    (
        "**解包会不会破坏原文件？**",
        "**解包后的文件为什么在子文件夹里？**\n默认按「工坊 ID / 精简作品名」给每个包建子文件夹，避免不同壁纸的文件混在一起。解包页 → 高级选项 →「输出子文件夹命名」可改成 ID、作品名、ID+名称、包文件名，或选「不建子文件夹」回到旧行为。\n\n**解包会不会破坏原文件？**",
    ),
])
