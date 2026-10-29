import asyncio
from datetime import timedelta

import pytest
from homeassistant.core import HomeAssistant
from homeassistant.setup import async_setup_component
from homeassistant.util import dt as dt_util
from pytest_homeassistant_custom_component.common import MockConfigEntry, async_fire_time_changed, async_mock_service

from custom_components.ha_ladder.const import DOMAIN


def prog():
    return [{
        "id": "p1", "name": "Main", "enabled": True,
        "rungs": [{
            "id": "r1", "comment": "", "enabled": True,
            "logic": {"id": "s1", "t": "series", "items": [
                {"id": "e1", "t": "el", "type": "NO", "tag": "input_boolean.motion"},
                {"id": "e2", "t": "el", "type": "TOF", "name": "T1", "pt": "2"},
            ]},
            "outputs": [{"id": "o1", "t": "el", "type": "COIL", "tag": "light.hall"}],
        }],
    }]


async def _setup(hass):
    assert await async_setup_component(hass, "http", {})
    entry = MockConfigEntry(domain=DOMAIN, data={})
    entry.add_to_hass(hass)
    assert await hass.config_entries.async_setup(entry.entry_id)
    await hass.async_block_till_done()
    return entry


async def test_setup_ws_and_scan(hass: HomeAssistant, hass_ws_client, freezer, monkeypatch):
    from custom_components.ha_ladder import controller as ctl
    monkeypatch.setattr(ctl.HassIO, "monotonic", lambda self: dt_util.utcnow().timestamp())
    hass.states.async_set("input_boolean.motion", "off")
    hass.states.async_set("light.hall", "off")
    on = async_mock_service(hass, "light", "turn_on")
    off = async_mock_service(hass, "light", "turn_off")
    entry = await _setup(hass)
    assert "ha-ladder" in hass.data["frontend_panels"]
    assert hass.states.get("switch.ladder_logic_plc_run").state == "on"

    ws = await hass_ws_client(hass)
    await ws.send_json({"id": 1, "type": "ha_ladder/get"})
    r = await ws.receive_json()
    assert r["success"] and r["result"]["programs"][0]["id"] == "main"

    await ws.send_json({"id": 2, "type": "ha_ladder/save", "programs": prog()})
    assert (await ws.receive_json())["success"]

    await ws.send_json({"id": 3, "type": "ha_ladder/save", "programs": [{"id": "x", "rungs": [{"logic": {"t": "bogus"}}]}]})
    r = await ws.receive_json()
    assert not r["success"] and r["error"]["code"] == "invalid"

    await ws.send_json({"id": 4, "type": "ha_ladder/monitor"})
    assert (await ws.receive_json())["success"]
    first = await ws.receive_json()
    assert first["event"]["running"] is True

    # count state_changed events for the integration's own entities (logbook noise)
    own = []
    hass.bus.async_listen("state_changed", lambda e: e.data["entity_id"].startswith(("switch.ladder", "sensor.ladder")) and own.append(e))

    now = dt_util.utcnow()
    hass.states.async_set("input_boolean.motion", "on")
    for i in range(1, 9):
        freezer.move_to(now + timedelta(milliseconds=260 * i))
        async_fire_time_changed(hass, now + timedelta(milliseconds=260 * i))
        await hass.async_block_till_done()
    assert len(on) == 1 and len(off) == 0
    hass.states.async_set("light.hall", "on")

    hass.states.async_set("input_boolean.motion", "off")
    for i in range(9, 30):
        freezer.move_to(now + timedelta(milliseconds=260 * i))
        async_fire_time_changed(hass, now + timedelta(milliseconds=260 * i))
        await hass.async_block_till_done()
    assert len(on) == 1 and len(off) == 1  # TOF 2 s then off, exactly one call each
    # only the 30 s scan-time sensor may update; it has a unit, so the logbook ignores it
    assert len(own) <= 1 and all(e.data["entity_id"].startswith("sensor.") for e in own)
    assert "unit_of_measurement" in hass.states.get("sensor.ladder_logic_plc_scan_time").attributes

    monitor = await ws.receive_json()
    assert "o1" in monitor["event"]["m"]

    # RUN/STOP switch
    await hass.services.async_call("switch", "turn_off", {"entity_id": "switch.ladder_logic_plc_run"}, blocking=True)
    assert hass.states.get("switch.ladder_logic_plc_run").state == "off"
    assert not entry.runtime_data.running

    assert await hass.config_entries.async_unload(entry.entry_id)
    await hass.async_block_till_done()
    assert "ha-ladder" not in hass.data["frontend_panels"]


async def test_static_js_served(hass, hass_client):
    await _setup(hass)
    client = await hass_client()
    resp = await client.get("/ha_ladder_static/ladder-panel.js")
    assert resp.status == 200
    assert "ha-ladder-panel" in await resp.text()
