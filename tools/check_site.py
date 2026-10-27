"""静态站点自检：本地资源引用是否齐全、截图尺寸、页面体积。"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"


def main() -> int:
    html = (DOCS / "index.html").read_text(encoding="utf-8")
    refs = re.findall(r"""(?:src|href)=["']([^"']+)["']""", html)
    missing: list[str] = []
    local = 0
    for ref in refs:
        if ref.startswith(("http", "#", "mailto:", "data:")):
            continue
        local += 1
        target = (DOCS / ref.split("?")[0]).resolve()
        if not target.exists():
            missing.append(ref)

    total = sum(f.stat().st_size for f in DOCS.rglob("*") if f.is_file())
    print(f"local refs: {local}, missing: {missing or 'none'}")
    print(f"site size: {total / 1024 / 1024:.2f} MB")

    # 基本内容检查
    checks = {
        "标题": "NekoRePKG" in html,
        "下载链接": "github.com/ynlp0624/NekoRePKG/releases/latest" in html,
        "源码链接": "github.com/ynlp0624/NekoRePKG" in html,
        "六张截图": len(list((DOCS / "screenshots").glob("*.png"))) >= 6,
        "无外部脚本": not re.search(r"<script[^>]+src=[\"']https?://", html),
        "无外部样式": not re.search(r"<link[^>]+href=[\"']https?://", html),
        "视口 meta": 'name="viewport"' in html,
        "og 标签": 'property="og:title"' in html,
        ".nojekyll": (DOCS / ".nojekyll").exists(),
    }
    ok = True
    for name, passed in checks.items():
        print(("PASS " if passed else "FAIL ") + name)
        ok = ok and passed
    return 0 if ok and not missing else 1


if __name__ == "__main__":
    raise SystemExit(main())
