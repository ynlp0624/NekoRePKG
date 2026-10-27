"""演示「解包 → 修改 → 回封 → 再解包校验」真实链路（scene 壁纸）。

用法：python tools/demo_modify_roundtrip.py <已解包目录> [输出 pkg 路径]
"""
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.core import pkgfmt  # noqa: E402

REPKG = ROOT / "resources" / "RePKG.exe"


def main() -> int:
    src = Path(sys.argv[1])
    scene = src / "scene.json"
    if not scene.exists():
        print("目录里没有 scene.json")
        return 1
    out_pkg = Path(sys.argv[2]) if len(sys.argv) > 2 else Path(tempfile.mkdtemp(prefix="neko_mod_")) / "scene_mod.pkg"

    original = json.loads(scene.read_text(encoding="utf-8"))
    marker = {
        "by": "猫羽雫",
        "tool": "NekoRePKG",
        "at": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    }
    original["_nekorepkg_demo"] = marker
    scene.write_text(json.dumps(original, ensure_ascii=False, indent="\t"), encoding="utf-8")
    print(f"== 已修改 scene.json（顶层字段 {len(original)} 个，加入 _nekorepkg_demo）")

    stats = pkgfmt.pack_directory(
        str(src), str(out_pkg),
        exclude=["project.json", "preview.jpg", "preview.png", "*.tex-json"],
        magic="PKGV0013",
    )
    print(f"== 回封: entries={stats['entries']} bytes={stats['bytes']} -> {out_pkg}")
    print(f"   size={out_pkg.stat().st_size / 1024:.1f} KB  skipped={len(stats.get('skipped', []))}")

    verify_dir = Path(tempfile.mkdtemp(prefix="neko_mod_verify_"))
    proc = subprocess.run([str(REPKG), "extract", str(out_pkg), "-o", str(verify_dir), "--overwrite"],
                          capture_output=True)
    print(f"== RePKG 回读: exit={proc.returncode}")
    reread = json.loads((verify_dir / "scene.json").read_text(encoding="utf-8"))
    got = reread.get("_nekorepkg_demo")
    ok = got == marker
    print(f"   重新解包后的 _nekorepkg_demo = {got}")
    print(f"   条目一致: {stats['entries']} 个；scene.json 修改保留: {'OK' if ok else 'FAIL'}")
    files = list(verify_dir.rglob("*"))
    print(f"   验证目录文件数: {sum(1 for f in files if f.is_file())}")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
