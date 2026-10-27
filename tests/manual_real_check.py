"""真实数据手动验收（用本机 Steam 工坊里的壁纸跑完整链路）。

运行：E:\\repkg\\.venv\\Scripts\\python.exe tests\\manual_real_check.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Api  # noqa: E402
from app.core import paths, pkgfmt, repkg as repkg_mod, scanner  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402


def get(base: str, path: str):
    with urllib.request.urlopen(base + path, timeout=120) as resp:
        return resp.status, json.loads(resp.read().decode("utf-8"))


def post(base: str, path: str, payload: dict):
    req = urllib.request.Request(
        base + path,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            return resp.status, json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        return exc.code, json.loads(exc.read().decode("utf-8"))


def wait_job(base: str, job_id: str, timeout: float = 600) -> dict:
    deadline = time.time() + timeout
    while time.time() < deadline:
        _, jobs = get(base, "/api/jobs")
        for job in jobs["jobs"]:
            if job["id"] == job_id and job["status"] in ("done", "error", "cancelled"):
                return job
        time.sleep(0.5)
    raise AssertionError("job timeout")


def main() -> int:
    settings = Settings(path=Path(tempfile.mkdtemp(prefix="nekorepkg_real_")) / "settings.json")
    hub = Hub()
    state = {"repkg": repkg_mod.detect(None)}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()
    base = server.url.rstrip("/")
    events = []

    def sse() -> None:
        try:
            with urllib.request.urlopen(base + "/events", timeout=300) as resp:
                for line in resp:
                    if line.startswith(b"data: "):
                        try:
                            events.append(json.loads(line[6:].decode("utf-8")))
                        except ValueError:
                            pass
        except Exception:
            pass

    threading.Thread(target=sse, daemon=True).start()
    time.sleep(0.3)
    try:
        print("== 工坊扫描")
        post(base, "/api/workshop/refresh", {})
        deadline = time.time() + 120
        payload = None
        while time.time() < deadline:
            ws = next((e for e in events if e.get("type") == "workshop"), None)
            if ws:
                payload = ws["data"]
                break
            time.sleep(0.3)
        if not payload:
            _, payload = get(base, "/api/workshop")
        items = payload.get("items") or []
        print(f"   steam_root={payload.get('steam_root')} dirs={payload.get('dirs')}")
        print(f"   作品数={len(items)} 总大小={sum(i['size'] for i in items) / 1024 ** 3:.2f} GB")
        if not items:
            print("   本机没有工坊数据，跳过真实解包")
            return 0
        sample = next((i for i in items if i.get("pkg") and Path(i["pkg"]).exists()), None)
        if sample is None:
            print("   没有可用 pkg，跳过")
            return 0
        print(f"   样本：{sample['title']} 类型={sample['type']} pkg={sample['pkg']}")

        print("== 工坊缩略图")
        if sample.get("preview_url"):
            with urllib.request.urlopen(base + sample["preview_url"], timeout=60) as resp:
                data = resp.read()
            print(f"   preview thumb: {resp.status} {len(data)} bytes")
        else:
            print("   (无封面)")

        print("== 包信息（真实 PKGV0002）")
        status, info = post(base, "/api/inspect", {"path": sample["pkg"]})
        print(f"   status={status} magic={info.get('magic')} entries={info.get('entry_count')} "
              f"project={bool(info.get('project'))} by_ext={[b['ext'] for b in info.get('by_ext', [])][:6]}")
        assert status == 200 and info.get("entry_count", 0) > 0

        print("== 解包（含贴图转换）")
        out = Path(tempfile.mkdtemp(prefix="nekorepkg_real_out_"))
        started = time.time()
        status, res = post(base, "/api/jobs/extract", {
            "inputs": [sample["pkg"]], "output_dir": str(out),
            "options": {"overwrite": True, "copy_project": True},
        })
        assert status == 200 and res.get("job_ids"), res
        job = wait_job(base, res["job_ids"][0])
        elapsed = time.time() - started
        print(f"   status={job['status']} elapsed={elapsed:.1f}s files={job['result'] and job['result'].get('files')} "
              f"error={job['error']}")
        if job["status"] != "done":
            print(json.dumps(job, ensure_ascii=False)[:800])
            return 1
        images = [p for p in out.rglob("*") if p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")]
        texjson = [p for p in out.rglob("*.tex-json")]
        print(f"   输出图片={len(images)} tex-json={len(texjson)} 目录={out}")

        print("== 画廊")
        status, gallery = get(base, f"/api/gallery?dir={urllib.parse.quote(str(out))}&limit=50")
        print(f"   status={status} total={gallery.get('total')}")
        if gallery.get("images"):
            first = gallery["images"][0]
            with urllib.request.urlopen(base + first["thumb"], timeout=60) as resp:
                print(f"   缩略图 {resp.status} {len(resp.read())} bytes ({first['name']})")

        print("== 回封 + 校验")
        pkg_out = out.parent / "repack.pkg"
        status, res = post(base, "/api/jobs/pack", {
            "source_dir": str(out), "output_pkg": str(pkg_out),
            "options": {"exclude": ["project.json", "preview.jpg", "preview.png", "*.tex-json"],
                        "verify": True},
        })
        assert status == 200, res
        job = wait_job(base, res["job_id"])
        verify = (job.get("result") or {}).get("verify") or {}
        print(f"   status={job['status']} entries={(job.get('result') or {}).get('entries')} "
              f"verify_ok={verify.get('ok')} mismatched={verify.get('mismatched')} err={job.get('error')}")
        assert job["status"] == "done" and verify.get("ok"), "回封校验失败"
        print("   全部真实链路通过 ✔")
        return 0
    finally:
        server.stop()
        jobs.shutdown()


if __name__ == "__main__":
    urllib.error = __import__("urllib.error", fromlist=["error"])
    sys.exit(main())
