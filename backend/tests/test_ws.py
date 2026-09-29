from __future__ import annotations

import asyncio
import unittest
from unittest.mock import AsyncMock

from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from app.main import app
from app.ws import WebSocketChannelManager, ws_manager

CHANNEL = "trades.live"
INVALID_CHANNEL = "!!!"


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

    def test_invalid_channel_rejected_with_1008(self) -> None:
        with self.assertRaises(WebSocketDisconnect) as ctx:
            with self.client.websocket_connect(f"/api/ws/{INVALID_CHANNEL}") as websocket:
                websocket.receive_json()
        self.assertEqual(ctx.exception.code, 1008)

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

    def test_publish_sends_event_to_client(self) -> None:
        payload = {"price": 42}

        with self.client.websocket_connect(f"/api/ws/{CHANNEL}") as websocket:
            websocket.receive_json()
            asyncio.run(ws_manager.publish(CHANNEL, payload))
            message = websocket.receive_json()
            self.assertEqual(message["type"], "event")
            self.assertEqual(message["channel"], CHANNEL)
            self.assertEqual(message["payload"], payload)
            self.assertIn("timestamp", message)

    def test_publish_drops_failed_client_and_continues(self) -> None:
        manager = WebSocketChannelManager()
        channel = "pub.test"
        healthy = AsyncMock()
        healthy.send_text = AsyncMock()
        failing = AsyncMock()
        failing.send_text = AsyncMock(side_effect=RuntimeError("send failed"))
        manager._connections[channel] = {healthy, failing}

        asyncio.run(manager.publish(channel, {"ok": True}))

        self.assertEqual(manager.connection_count(channel), 1)
        self.assertIn(healthy, manager._connections[channel])
        self.assertNotIn(failing, manager._connections[channel])
        healthy.send_text.assert_called_once()

    def test_connect_send_failure_does_not_register(self) -> None:
        manager = WebSocketChannelManager()
        channel = "fail.connect"
        websocket = AsyncMock()
        websocket.accept = AsyncMock()
        websocket.send_text = AsyncMock(side_effect=RuntimeError("connected send failed"))
        websocket.close = AsyncMock()

        registered = asyncio.run(manager.connect(channel, websocket))

        self.assertFalse(registered)
        self.assertEqual(manager.connection_count(channel), 0)
        websocket.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
