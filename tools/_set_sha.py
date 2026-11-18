"""把新的 exe SHA-256 写进官网 specs 与 release notes。用法：python tools/_set_sha.py <sha>"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sha = sys.argv[1].strip().upper()
if not re.fullmatch(r"[0-9A-F]{64}", sha):
    raise SystemExit("invalid sha256")

index = ROOT / "docs" / "index.html"
text = index.read_text(encoding="utf-8")
text, n = re.subn(r'(<code id="sha">)[0-9A-F]{64}(</code>)', rf"\g<1>{sha}\g<2>", text)
index.write_text(text, encoding="utf-8")
print(f"index.html replaced: {n}")

notes = ROOT / "docs" / "release-notes.md"
data = notes.read_text(encoding="utf-8")
if "__SHA256__" in data:
    data = data.replace("__SHA256__", sha)
else:
    data = re.sub(r"(SHA-256（单文件版）：`)[0-9A-F]{64}(`)", rf"\g<1>{sha}\g<2>", data)
notes.write_text(data, encoding="utf-8")
print("release-notes.md updated")
