"""PyInstaller 入口（也用于开发：python run_app.py）。"""
from __future__ import annotations

import os
import sys

if not getattr(sys, "frozen", False):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.main import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())
