from __future__ import annotations

from fastapi.testclient import TestClient

import app
from app.main import app as fastapi_app

client = TestClient(fastapi_app)


def test_health_returns_status_parquet_folder_and_version() -> None:
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()

    assert set(payload) == {"status", "parquet_folder", "version"}
    assert payload["status"] == "ok"
    assert isinstance(payload["parquet_folder"], str)
    assert payload["version"] == app.APP_VERSION
