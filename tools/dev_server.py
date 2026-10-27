"""开发/联调用：只启动本地 HTTP 后端（不打开 pywebview 窗口）。

用法：E:\\repkg\\.venv\\Scripts\\python.exe tools\\dev_server.py
然后浏览器打开打印出来的地址（真实模式，非 mock）。
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.api import Api  # noqa: E402
from app.core import paths, repkg as repkg_mod  # noqa: E402
from app.core.config import Settings  # noqa: E402
from app.core.jobs import JobManager  # noqa: E402
from app.server import ApiServer, Hub  # noqa: E402


def main() -> int:
    settings = Settings()
    hub = Hub()
    state = {"repkg": repkg_mod.detect(settings.get("repkg_path"))}
    jobs = JobManager(settings, lambda: state["repkg"], hub.publish)
    api = Api(settings, jobs, state, hub)
    server = ApiServer(api, hub, paths.web_dir())
    server.start()
    print(f"DEV_URL={server.url}", flush=True)
    print(f"repkg={state['repkg']}", flush=True)
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        pass
    finally:
        jobs.shutdown()
        server.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
