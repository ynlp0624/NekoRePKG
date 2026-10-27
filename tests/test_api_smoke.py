"""端到端 API 冒烟测试（不启动窗口）：直接起本地 HTTP 服务并调用真实接口。

运行：E:\\repkg\\.venv\\Scripts\\python.exe tests\\test_api_smoke.py
"""
from __future__ import annotations

import json
import os
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Api  # noqa: E402
from app.core import paths, repkg as repkg_mod  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402

FIXTURE = ROOT / "tests" / "_work" / "fixture.pkg"


def request(base: str, method: str, path: str, payload=None, raw: bytes | None = None, content_type: str = ""):
    data = raw if raw is not None else (json.dumps(payload).encode("utf-8") if payload is not None else None)
    headers = {"Content-Type": "application/json"} if payload is not None else {}
    if content_type:
        headers["Content-Type"] = content_type
    req = urllib.request.Request(base + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            if "application/json" in ctype:
                return resp.status, json.loads(body.decode("utf-8"))
            return resp.status, body
    except urllib.error.HTTPError as exc:
        body = exc.read()
        try:
            return exc.code, json.loads(body.decode("utf-8"))
        except Exception:
            return exc.code, body


def wait_job(base: str, job_id: str, timeout: float = 120) -> dict:
    deadline = time.time() + timeout
    last = None
    while time.time() < deadline:
        status, jobs = request(base, "GET", "/api/jobs")
        for job in jobs["jobs"]:
            if job["id"] == job_id:
                last = job
                if job["status"] in ("done", "error", "cancelled"):
                    return job
        time.sleep(0.4)
    raise AssertionError(f"任务超时：{job_id} {last}")


def main() -> int:
    if not FIXTURE.exists():
        sys.path.insert(0, str(ROOT / "tests"))
        import make_fixture  # noqa: PLC0415

        make_fixture.ensure()
    assert FIXTURE.exists(), f"缺少 fixture：{FIXTURE}"
    settings = Settings(path=Path(tempfile.mkdtemp(prefix="nekorepkg_cfg_")) / "settings.json")
    hub = Hub()
    state = {"repkg": repkg_mod.detect(None)}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()
    base = server.url.rstrip("/")

    ok = True

    def check(name: str, condition: bool, detail=""):
        nonlocal ok
        print(("  PASS  " if condition else "  FAIL  ") + name + (f"  {detail}" if detail and not condition else ""))
        if not condition:
            ok = False

    try:
        print("[1] /api/state")
        status, st = request(base, "GET", "/api/state")
        check("state 200", status == 200)
        check("repkg 可用", bool(st.get("repkg", {}).get("ok")), str(st.get("repkg")))
        check("settings 存在", "theme" in st.get("settings", {}))

        print("[2] /api/inspect")
        status, info = request(base, "POST", "/api/inspect", {"path": str(FIXTURE)})
        check("inspect 200", status == 200, str(info)[:200])
        check("条目数 > 5", info.get("entry_count", 0) > 5, str(info.get("entry_count")))
        check("by_ext 非空", bool(info.get("by_ext")))
        check("包含中文条目", any("中文" in e["path"] for e in info.get("entries", [])))

        print("[3] 解包任务")
        out_dir = tempfile.mkdtemp(prefix="nekorepkg_out_")
        status, res = request(base, "POST", "/api/jobs/extract", {
            "inputs": [str(FIXTURE)],
            "output_dir": out_dir,
            "options": {"no_tex_convert": True, "overwrite": True},
        })
        check("入队成功", status == 200 and res.get("job_ids"), str(res))
        job = wait_job(base, res["job_ids"][0])
        check("任务完成", job["status"] == "done", str(job)[:400])
        files = list(Path(out_dir).rglob("*"))
        check("产出文件", any(f.is_file() for f in files), str(files[:5]))
        check("进度 100%", job["progress"]["percent"] == 100.0, str(job["progress"]))

        print("[4] 日志 + SSE 兼容")
        status, logs = request(base, "GET", f"/api/jobs/log?id={job['id']}&after=0")
        check("日志 200", status == 200)
        check("有日志行", len(logs.get("lines", [])) > 3, str(len(logs.get("lines", []))))

        print("[5] 画廊/缩略图")
        img_dir = Path(out_dir)
        png = img_dir / "preview.jpg"
        from PIL import Image

        Image.new("RGB", (640, 360), (95, 149, 255)).save(png, format="JPEG")
        status, gallery = request(base, "GET", f"/api/gallery?dir={urllib.parse.quote(str(img_dir))}")
        check("gallery 200", status == 200, str(gallery)[:200])
        check("找到图片", gallery.get("total", 0) >= 1, str(gallery.get("total")))
        status, thumb = request(base, "GET", f"/api/thumb?path={urllib.parse.quote(str(png))}&w=200")
        check("thumb 200", status == 200 and isinstance(thumb, bytes), str(status))

        print("[6] 打包任务")
        src = Path(tempfile.mkdtemp(prefix="nekorepkg_pack_"))
        (src / "materials").mkdir()
        (src / "materials" / "layer.json").write_text('{"a":1}', encoding="utf-8")
        (src / "scene.json").write_text("{}", encoding="utf-8")
        (src / "project.json").write_text("{}", encoding="utf-8")
        target = Path(tempfile.mkdtemp(prefix="nekorepkg_pkg_")) / "scene.pkg"
        status, res = request(base, "POST", "/api/jobs/pack", {
            "source_dir": str(src), "output_pkg": str(target),
            "options": {"exclude": ["project.json"], "magic": "PKGV0021", "verify": True},
        })
        check("打包入队", status == 200, str(res))
        job = wait_job(base, res["job_id"])
        check("打包完成", job["status"] == "done", str(job)[:500])
        check("pkg 已生成", target.exists() and target.stat().st_size > 0)
        check("校验通过", bool(job.get("result", {}).get("verify", {}).get("ok")),
              str(job.get("result", {}).get("verify")))

        print("[7] 设置")
        status, res = request(base, "POST", "/api/settings", {"settings": {"theme": "pro", "concurrency": 1}})
        check("保存设置", status == 200 and res["settings"]["theme"] == "pro", str(res)[:200])
        check("设置落盘", json.loads(Path(settings.path).read_text(encoding="utf-8"))["settings"]["theme"] == "pro")

        print("[8] 错误处理")
        status, res = request(base, "POST", "/api/inspect", {"path": str(src / "scene.json")})
        check("非 pkg 返回 400", status == 400, f"{status} {res}")
        status, res = request(base, "GET", "/api/nope")
        check("未知接口 404", status == 404, str(status))

        print("[9] 静态资源")
        status, html = request(base, "GET", "/")
        check("index.html 200", status == 200 and b"<html" in html.lower(), str(status))

        print("[10] SSE 事件流")
        events: list[dict] = []
        sse_ready = threading.Event()

        def sse_reader() -> None:
            try:
                with urllib.request.urlopen(base + "/events", timeout=30) as resp:
                    sse_ready.set()
                    buffer = b""
                    while True:
                        chunk = resp.readline()
                        if not chunk:
                            break
                        buffer += chunk
                        while b"\n\n" in buffer:
                            block, buffer = buffer.split(b"\n\n", 1)
                            for line in block.split(b"\n"):
                                if line.startswith(b"data: "):
                                    try:
                                        events.append(json.loads(line[6:].decode("utf-8")))
                                    except ValueError:
                                        pass
            except Exception:
                sse_ready.set()

        thread = threading.Thread(target=sse_reader, daemon=True)
        thread.start()
        sse_ready.wait(5)
        time.sleep(0.2)
        status, res = request(base, "POST", "/api/jobs/extract", {
            "inputs": [str(FIXTURE)],
            "output_dir": tempfile.mkdtemp(prefix="nekorepkg_sse_"),
            "options": {"no_tex_convert": True, "overwrite": True},
        })
        deadline = time.time() + 20
        while time.time() < deadline and not any(e.get("type") == "job" for e in events):
            time.sleep(0.2)
        check("收到 SSE job 事件", any(e.get("type") == "job" for e in events),
              f"events={[e.get('type') for e in events][:5]}")
        check("收到 SSE log 事件", any(e.get("type") == "log" for e in events),
              f"events={[e.get('type') for e in events][:8]}")
    finally:
        server.stop()
        jobs.shutdown()

    print("\n结果：" + ("全部通过" if ok else "存在失败"))
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
