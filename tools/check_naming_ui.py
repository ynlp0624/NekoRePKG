"""WebView2 中检查解包页「输出子文件夹命名」下拉是否可用。"""
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

    window = webview.create_window("naming-ui-check", url=server.url, width=1200, height=900, hidden=True)

    def checks(win) -> None:
        win.events.loaded.wait(30)
        time.sleep(1.0)
        win.evaluate_js("location.hash = '#/extract?adv=1'")
        time.sleep(1.2)
        RESULT.update(win.evaluate_js("""
        (function(){
          const sel = document.getElementById('folder-naming');
          const hint = document.getElementById('out-hint');
          return {
            hasSelect: !!sel,
            value: sel ? sel.value : null,
            options: sel ? Array.from(sel.options).map(o => o.value) : [],
            hint: hint ? hint.innerText : '',
            versionShown: document.body.innerText.includes('1.1.0')
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
    ok = (
        RESULT.get("hasSelect")
        and RESULT.get("value") == "auto"
        and RESULT.get("options") == ["auto", "id", "title", "id_title", "pkg", "none"]
        and "每个包会新建子文件夹" in RESULT.get("hint", "")
    )
    print("PASS" if ok else "FAIL")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
