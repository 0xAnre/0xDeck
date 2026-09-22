from __future__ import annotations

import json
from pathlib import Path

STATE_PATH = Path(__file__).resolve().parent.parent / ".canvas-state.json"


def load_parquet_folder() -> str | None:
    if not STATE_PATH.exists():
        return None
    try:
        data = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        folder = data.get("parquet_folder")
        return folder if isinstance(folder, str) and folder.strip() else None
    except (OSError, json.JSONDecodeError):
        return None


def save_parquet_folder(folder: str) -> Path:
    path = Path(folder).expanduser().resolve()
    STATE_PATH.write_text(
        json.dumps({"parquet_folder": str(path)}, indent=2),
        encoding="utf-8",
    )
    return path


def get_resolved_folder() -> Path | None:
    raw = load_parquet_folder()
    if not raw:
        return None
    path = Path(raw).expanduser().resolve()
    if not path.is_dir():
        return None
    return path
