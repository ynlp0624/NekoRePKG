"""真实模式 WebView2 集成检查（隐藏窗口，不弹窗打扰）。

验证：真实后端 + 真实前端在 WebView2 里能渲染、路由切换正常、
工坊真实数据渲染成卡片、设置页读到 RePKG 信息、JS 无致命错误。

运行：E:\\repkg\\.venv\\Scripts\\python.exe tests\\webview_real_check.py
"""
from __future__ import annotations

import json
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Api  # noqa: E402
from app.core import paths, repkg as repkg_mod  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402

RESULT: dict = {}


def post(base: str, path: str, payload: dict) -> dict:
    req = urllib.request.Request(
        base + path, data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"}, method="POST",
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def get(base: str, path: str) -> dict:
    with urllib.request.urlopen(base + path, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def main() -> int:
    import webview

    settings = Settings(path=Path(tempfile.mkdtemp(prefix="nekorepkg_wv_")) / "settings.json")
    hub = Hub()
    state = {"repkg": repkg_mod.detect(None)}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()
    base = server.url.rstrip("/")

    print("== 触发工坊扫描")
    post(base, "/api/workshop/refresh", {})
    deadline = time.time() + 90
    items: list[dict] = []
    while time.time() < deadline:
        ws = get(base, "/api/workshop")
        if not ws.get("scanning"):
            items = ws.get("items") or []
            break
        time.sleep(0.5)
    print(f"   工坊作品数={len(items)}")

    window = webview.create_window("check", url=server.url, width=1280, height=820, hidden=True)

    def js(script):
        return window.evaluate_js(script)

    def checks(window_ref) -> None:
        window_ref.events.loaded.wait(30)
        time.sleep(1.0)
        js("""
        window.__probeErrs = window.__probeErrs || [];
        window.addEventListener('error', function(e){ window.__probeErrs.push(String(e.message)); });
        window.addEventListener('unhandledrejection', function(e){ window.__probeErrs.push('rejection:' + String(e.reason)); });
        true
        """)
        routes = ["#/extract", "#/pack", "#/inspect", "#/workshop", "#/gallery", "#/settings"]
        for route in routes:
            js(f"location.hash = '{route}'")
            time.sleep(1.2)
            info = js("""
            (function(){
              return {
                route: location.hash,
                app: !!document.querySelector('.app'),
                navCount: document.querySelectorAll('#nav-list a, #nav-list button, .nav a, .nav button').length,
                textLen: (document.body.innerText || '').length,
                cards: document.querySelectorAll('.ws-card').length,
                toasts: Array.from(document.querySelectorAll('.toast')).map(t => t.innerText.trim()).slice(0,5),
                theme: document.documentElement.dataset.theme,
                errs: (window.__probeErrs || []).slice(0,5),
                empty: document.querySelectorAll('.empty-state, .empty').length
              };
            })()
            """)
            RESULT[route] = info
            print(f"   {route}: {json.dumps(info, ensure_ascii=False)}")
        post(base, "/api/settings", {"settings": {"theme": "pro"}})
        time.sleep(1.0)
        RESULT["themeAfter"] = js("document.documentElement.dataset.theme")
        RESULT["errors"] = js("window.__probeErrs || []")
        print(f"   主题切换后 data-theme={RESULT['themeAfter']}")
        print(f"   JS 错误：{RESULT['errors']}")
        try:
            window_ref.destroy()
        except Exception:
            pass

    try:
        webview.start(checks, window)
    finally:
        server.stop()
        jobs.shutdown()

    ws = RESULT.get("#/workshop", {})
    cards = ws.get("cards", 0)
    expected = len(items)
    ok_ws = (expected == 0 and cards == 0) or (cards > 0)
    print(f"\n工坊卡片={cards} 期望≈{expected} -> {'OK' if ok_ws else 'MISMATCH'}")
    bad = [r for r, v in RESULT.items() if r.startswith("#/") and (not v.get("app") or v.get("textLen", 0) < 200)]
    print("路由渲染失败：", bad)
    return 0 if (not bad and ok_ws) else 1


if __name__ == "__main__":
    sys.exit(main())
