"""用真实工坊壁纸跑一遍完整链路（inspect → extract → gallery → repack+verify）。

用法：python tools/try_real_wallpaper.py "E:\\SteamLibrary\\...\\2595877264"
"""
from __future__ import annotations

import json
import sys
import tempfile
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Api  # noqa: E402
from app.core import paths, repkg as repkg_mod  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402


def get(base: str, path: str):
    with urllib.request.urlopen(base + path, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def post(base: str, path: str, payload: dict):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode("utf-8"),
                                 headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=180) as resp:
        return json.loads(resp.read().decode("utf-8"))


def wait_job(base: str, job_id: str, timeout: float = 300) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        for job in get(base, "/api/jobs")["jobs"]:
            if job["id"] == job_id and job["status"] in ("done", "error", "cancelled"):
                return job
        time.sleep(0.3)
    raise AssertionError("job timeout")


def main() -> int:
    src = Path(sys.argv[1] if len(sys.argv) > 1
               else r"E:\SteamLibrary\steamapps\workshop\content\431960\2595877264")
    pkg = next(src.glob("*.pkg"), None)
    if not pkg:
        print("没有找到 .pkg")
        return 1

    settings = Settings(path=Path(tempfile.mkdtemp(prefix="neko_real_")) / "settings.json")
    hub = Hub()
    state = {"repkg": repkg_mod.detect(None)}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()
    base = server.url.rstrip("/")
    out_dir = Path(tempfile.mkdtemp(prefix="neko_real_out_"))
    try:
        print(f"== 样本: {src.name}")
        info = post(base, "/api/inspect", {"path": str(pkg)})
        print(f"   magic={info.get('magic')} entries={info.get('entry_count')} "
              f"data={info.get('data_size')} size={info.get('size')}")
        print(f"   title={info.get('project', {}).get('title')}")
        print(f"   type={info.get('project', {}).get('type')} tags={info.get('project', {}).get('tags')}")
        print(f"   by_ext={[(b['ext'], b['count']) for b in info.get('by_ext', [])]}")

        t0 = time.time()
        res = post(base, "/api/jobs/extract", {
            "inputs": [str(pkg)], "output_dir": str(out_dir),
            "options": {"overwrite": True, "copy_project": True},
        })
        job = wait_job(base, res["job_ids"][0])
        print(f"== 解包: {job['status']} {time.time() - t0:.1f}s files={job.get('result', {}).get('files')} "
              f"bytes={job.get('result', {}).get('bytes')}")
        if job["status"] != "done":
            print(json.dumps(job, ensure_ascii=False)[:600])
            return 1
        images = sorted((p for p in out_dir.rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")),
                        key=lambda p: p.stat().st_size, reverse=True)
        texjson = list(out_dir.rglob("*.tex-json"))
        print(f"   图片 {len(images)} 张，tex-json {len(texjson)} 个")
        print(f"   输出目录: {out_dir}")
        for p in images[:4]:
            print(f"     {p.relative_to(out_dir)}  {p.stat().st_size / 1024:.0f} KB")

        gallery = get(base, f"/api/gallery?dir={urllib.parse.quote(str(out_dir))}&limit=100")
        print(f"== 画廊: total={gallery.get('total')}")
        if gallery.get("images"):
            first = gallery["images"][0]
            with urllib.request.urlopen(base + first["thumb"], timeout=60) as resp:
                thumb = resp.read()
            Path("E:\\repkg\\shots\\real-thumb.jpg").write_bytes(thumb)
            print(f"   缩略图 OK: {first['name']} {len(thumb)} bytes")

        pkg_out = out_dir.parent / "repack.pkg"
        res = post(base, "/api/jobs/pack", {
            "source_dir": str(out_dir), "output_pkg": str(pkg_out),
            "options": {"exclude": ["project.json", "preview.jpg", "preview.png", "*.tex-json"],
                        "verify": True},
        })
        job = wait_job(base, res["job_id"])
        verify = (job.get("result") or {}).get("verify") or {}
        print(f"== 回封: {job['status']} entries={(job.get('result') or {}).get('entries')} "
              f"verify={verify.get('ok')} msg={verify.get('message')}")
        if job["status"] != "done":
            print(json.dumps(job, ensure_ascii=False)[:600])
            return 1
        if images:
            best = images[0]
            print(f"   largest image: {best}")
        return 0
    finally:
        server.stop()
        jobs.shutdown()


if __name__ == "__main__":
    sys.exit(main())
