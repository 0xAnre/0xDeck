from __future__ import annotations

import unittest

from fastapi.testclient import TestClient

from app.main import app
from app.ws import ws_manager

CHANNEL = "trades.live"


class WebSocketInfrastructureTests(unittest.TestCase):
    def setUp(self) -> None:
        self.client = TestClient(app)

    def test_connect_sends_connected_with_channel(self) -> None:
        with self.client.websocket_connect(f"/api/ws/{CHANNEL}") as websocket:
            message = websocket.receive_json()
            self.assertEqual(message["type"], "connected")
            self.assertEqual(message["channel"], CHANNEL)
            self.assertIsInstance(message["timestamp"], str)
            self.assertTrue(message["timestamp"].endswith("+00:00") or message["timestamp"].endswith("Z"))

    def test_ping_returns_pong(self) -> None:
        with self.client.websocket_connect(f"/api/ws/{CHANNEL}") as websocket:
            websocket.receive_json()
            websocket.send_json({"type": "ping"})
            message = websocket.receive_json()
            self.assertEqual(message["type"], "pong")
            self.assertEqual(message["channel"], CHANNEL)
            self.assertIn("timestamp", message)

    def test_invalid_message_returns_error(self) -> None:
        with self.client.websocket_connect(f"/api/ws/{CHANNEL}") as websocket:
            websocket.receive_json()
            websocket.send_text("not-json")
            message = websocket.receive_json()
            self.assertEqual(message["type"], "error")
            self.assertEqual(message["channel"], CHANNEL)
            self.assertIn("message", message)

            websocket.send_json({"type": "subscribe"})
            message = websocket.receive_json()
            self.assertEqual(message["type"], "error")

    def test_disconnect_removes_connection(self) -> None:
        with self.client.websocket_connect(f"/api/ws/{CHANNEL}") as websocket:
            websocket.receive_json()
            self.assertEqual(ws_manager.connection_count(CHANNEL), 1)

        self.assertEqual(ws_manager.connection_count(CHANNEL), 0)


if __name__ == "__main__":
    unittest.main()
