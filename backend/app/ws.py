from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket
from starlette.websockets import WebSocketDisconnect

CHANNEL_PATTERN = re.compile(r"^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$")


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).isoformat()


def is_valid_channel(channel: str) -> bool:
    return bool(CHANNEL_PATTERN.fullmatch(channel))


class WebSocketChannelManager:
    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = {}

    def connection_count(self, channel: str) -> int:
        return len(self._connections.get(channel, set()))

    async def connect(self, channel: str, websocket: WebSocket) -> None:
        await websocket.accept()
        bucket = self._connections.setdefault(channel, set())
        bucket.add(websocket)
        await self._send(websocket, channel, {"type": "connected"})

    def disconnect(self, channel: str, websocket: WebSocket) -> None:
        bucket = self._connections.get(channel)
        if not bucket:
            return
        bucket.discard(websocket)
        if not bucket:
            self._connections.pop(channel, None)

    async def publish(self, channel: str, payload: Any) -> None:
        message = {"type": "event", "payload": payload}
        for websocket in list(self._connections.get(channel, set())):
            await self._send(websocket, channel, message)

    async def handle_client_text(self, channel: str, websocket: WebSocket, text: str) -> None:
        try:
            data = json.loads(text)
        except json.JSONDecodeError:
            await self._send(
                websocket,
                channel,
                {"type": "error", "message": "Invalid JSON"},
            )
            return

        if not isinstance(data, dict):
            await self._send(
                websocket,
                channel,
                {"type": "error", "message": "Message must be a JSON object"},
            )
            return

        message_type = data.get("type")
        if message_type == "ping":
            await self._send(websocket, channel, {"type": "pong"})
            return

        await self._send(
            websocket,
            channel,
            {"type": "error", "message": "Unsupported client message type"},
        )

    async def _send(self, websocket: WebSocket, channel: str, body: dict[str, Any]) -> None:
        envelope = {
            **body,
            "channel": channel,
            "timestamp": utc_timestamp(),
        }
        await websocket.send_text(json.dumps(envelope))


ws_manager = WebSocketChannelManager()
