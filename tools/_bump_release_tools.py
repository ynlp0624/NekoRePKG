"""把发布脚本里的版本号与 Release 说明改成读 docs/release-notes.md（避免重复维护）。"""
from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / "tools"


def patch(path: Path, pairs: list[tuple[str, str]]) -> None:
    text = path.read_text(encoding="utf-8")
    for old, new in pairs:
        if old not in text:
            print(f"  skip (not found): {path.name}: {old[:60]}")
            continue
        text = text.replace(old, new)
    path.write_text(text, encoding="utf-8")
    print(f"patched {path.name}")


# gh-publish.js：版本 + 说明从 md 读取
gh = TOOLS / "gh-publish.js"
text = gh.read_text(encoding="utf-8")
text = re.sub(r"const VERSION = '[^']+';", "const VERSION = 'v1.0.1';", text, count=1)
text = re.sub(
    r"const RELEASE_BODY = `.*?`;\n",
    "const RELEASE_BODY = fs.readFileSync(path.join(ROOT, 'docs', 'release-notes.md'), 'utf8');\n",
    text,
    count=1,
    flags=re.S,
)
gh.write_text(text, encoding="utf-8")
print("patched gh-publish.js")

patch(TOOLS / "update_release_notes.js", [("const TAG = 'v1.0.0';", "const TAG = 'v1.0.1';")])

gc = TOOLS / "gitcode-release.js"
text = gc.read_text(encoding="utf-8")
text = re.sub(r"const TAG = '[^']+';", "const TAG = 'v1.0.1';", text, count=1)
text = re.sub(
    r"const BODY = `.*?`;\n",
    "const BODY = fs.readFileSync(path.join(ROOT, 'docs', 'release-notes.md'), 'utf8');\n",
    text,
    count=1,
    flags=re.S,
)
gc.write_text(text, encoding="utf-8")
print("patched gitcode-release.js")
