"""WebView2 中检查打包页新开关是否可用（隐藏窗口）。"""
from __future__ import annotations

import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Api  # noqa: E402
from app.core import paths, repkg as repkg_mod  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402

RESULT: dict = {}


def main() -> int:
    import webview

    settings = Settings(path=Path(tempfile.mkdtemp(prefix="neko_ui_")) / "settings.json")
    hub = Hub()
    state = {"repkg": repkg_mod.detect(None)}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()

    window = webview.create_window("pack-ui-check", url=server.url, width=1100, height=760, hidden=True)

    def checks(win) -> None:
        win.events.loaded.wait(30)
        time.sleep(1.0)
        win.evaluate_js("location.hash = '#/pack'")
        time.sleep(1.2)
        RESULT.update(win.evaluate_js("""
        (function(){
          const body = document.body.innerText || '';
          const sw = document.getElementById('exclude-converted');
          const ver = (document.querySelector('.status-bar, footer, .app-foot') || {}).innerText || '';
          return {
            hasSwitch: !!sw,
            checked: sw ? sw.checked : null,
            hasLabel: body.includes('排除转换出的 PNG'),
            hasHint: body.includes('同目录存在同名'),
            versionShown: document.body.innerText.includes('1.0.1'),
            textLen: body.length
          };
        })()
        """))
        try:
            win.destroy()
        except Exception:
            pass

    try:
        webview.start(checks, window)
    finally:
        server.stop()
        jobs.shutdown()

    print(RESULT)
    ok = RESULT.get("hasSwitch") and RESULT.get("checked") and RESULT.get("hasLabel") and RESULT.get("hasHint")
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
