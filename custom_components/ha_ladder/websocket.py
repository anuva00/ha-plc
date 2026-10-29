"""Websocket API used by the ladder editor panel."""
from __future__ import annotations

from typing import Any

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback

from .const import DOMAIN, VERSION


def _ctrl(hass: HomeAssistant):
    return hass.data.get(DOMAIN)


@callback
def async_register_websocket(hass: HomeAssistant) -> None:
    for cmd in (ws_get, ws_save, ws_run, ws_settings, ws_monitor, ws_set_memory, ws_force, ws_unforce, ws_trace_set, ws_trace_get, ws_simulate):
        websocket_api.async_register_command(hass, cmd)


def _not_ready(connection, msg) -> None:
    connection.send_error(msg["id"], "not_ready", "Ladder Logic is not set up")


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@websocket_api.require_admin
@callback
def ws_get(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    connection.send_result(
        msg["id"], {"programs": c.programs, "settings": c.settings, "running": c.running, "version": VERSION}
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/save", vol.Required("programs"): [dict]}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_save(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    try:
        await c.async_save_programs(msg["programs"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/run", vol.Required("running"): bool})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_run(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    await c.async_set_running(msg["running"])
    connection.send_result(msg["id"], {"running": c.running})


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/settings", vol.Required("scan_ms"): vol.Coerce(int)}
)
@websocket_api.require_admin
@websocket_api.async_response
async def ws_settings(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    await c.async_set_scan_ms(msg["scan_ms"])
    connection.send_result(msg["id"], {"settings": c.settings})


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/set_memory",
        vol.Required("name"): str,
        vol.Required("value"): vol.Any(bool, int, float, str, None),
    }
)
@websocket_api.require_admin
@callback
def ws_set_memory(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    c.set_memory(msg["name"], msg["value"])
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/monitor"})
@websocket_api.require_admin
@callback
def ws_monitor(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)

    @callback
    def forward(snap: dict[str, Any]) -> None:
        connection.send_message(websocket_api.event_message(msg["id"], snap))

    connection.send_result(msg["id"])
    connection.subscriptions[msg["id"]] = c.add_monitor(forward)


_VALUE = vol.Any(bool, int, float, str, None)


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/force", vol.Required("name"): str, vol.Required("value"): _VALUE})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_force(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    try:
        key = await c.async_force(msg["name"], msg["value"])
    except ValueError as err:
        connection.send_error(msg["id"], "invalid", str(err))
        return
    connection.send_result(msg["id"], {"key": key})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/unforce", vol.Optional("name"): str})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_unforce(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    await c.async_unforce(msg.get("name"))
    connection.send_result(msg["id"], {"ok": True})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/trace/set", vol.Required("signals"): [str]})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_trace_set(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    signals = await c.async_set_trace(msg["signals"])
    connection.send_result(msg["id"], {"signals": signals})


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/trace/get"})
@websocket_api.require_admin
@callback
def ws_trace_get(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    connection.send_result(msg["id"], c.trace_data())


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/simulate", vol.Required("enabled"): bool})
@websocket_api.require_admin
@websocket_api.async_response
async def ws_simulate(hass, connection, msg) -> None:
    c = _ctrl(hass)
    if c is None:
        return _not_ready(connection, msg)
    await c.async_set_simulate(msg["enabled"])
    connection.send_result(msg["id"], {"simulate": c.simulate})
