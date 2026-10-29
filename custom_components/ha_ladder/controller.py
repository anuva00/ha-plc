"""Glue between the ladder engine and Home Assistant."""
from __future__ import annotations

import logging
import time
from datetime import timedelta
from typing import Any, Callable

from homeassistant.core import CALLBACK_TYPE, Context, HomeAssistant, callback
from homeassistant.helpers.event import async_track_time_interval
from homeassistant.helpers.storage import Store
from homeassistant.util import dt as dt_util

from .const import (
    DEFAULT_SCAN_MS,
    MAX_SCAN_MS,
    MIN_SCAN_MS,
    MONITOR_INTERVAL,
    STORE_PROGRAMS,
    STORE_RETAIN,
)
from .engine import Runtime, validate_programs

_LOGGER = logging.getLogger(__name__)


class HassIO:
    """Engine IO adapter. Reads come straight from the in-memory state machine."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        # one shared context so every write is attributed to Ladder Logic
        self.context = Context()
        self._failed: set[str] = set()

    def get(self, entity_id: str):
        st = self.hass.states.get(entity_id)
        if st is None:
            return None, {}
        return st.state, st.attributes

    def call(self, domain: str, service: str, data: dict) -> None:
        self.hass.async_create_task(self._call(domain, service, data), eager_start=True)

    async def _call(self, domain: str, service: str, data: dict) -> None:
        key = f"{domain}.{service}:{data.get('entity_id')}"
        try:
            await self.hass.services.async_call(
                domain, service, dict(data), blocking=False, context=Context(parent_id=self.context.id)
            )
            self._failed.discard(key)
        except Exception as err:  # noqa: BLE001
            # log each distinct failure once, not every retry
            if key not in self._failed:
                self._failed.add(key)
                _LOGGER.warning("Ladder: %s.%s failed: %s", domain, service, err)

    def now(self):
        return dt_util.now()

    def monotonic(self) -> float:
        return time.monotonic()


class LadderController:
    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = Store(hass, 1, STORE_PROGRAMS)
        self._retain_store = Store(hass, 1, STORE_RETAIN)
        self.programs: list[dict] = []
        self.settings: dict[str, Any] = {"scan_ms": DEFAULT_SCAN_MS, "running": True}
        self.runtime: Runtime | None = None
        self._unsub_timer: CALLBACK_TYPE | None = None
        self._monitors: set[Callable[[dict], None]] = set()
        self._listeners: set[Callable[[], None]] = set()
        self._last_push = 0.0
        self._last_entity_update = 0.0
        self._logged_errors: set[str] = set()

    # -- lifecycle -------------------------------------------------------------
    async def async_load(self) -> None:
        data = await self._store.async_load() or {}
        self.programs = data.get("programs") or [_default_program()]
        self.settings.update(data.get("settings") or {})
        retain = await self._retain_store.async_load() or {}
        self.runtime = Runtime(HassIO(self.hass), retain)
        self.runtime.load(self.programs)

    @property
    def running(self) -> bool:
        return self._unsub_timer is not None

    @callback
    def async_start(self) -> None:
        if self._unsub_timer is not None:
            return
        ms = int(min(MAX_SCAN_MS, max(MIN_SCAN_MS, self.settings.get("scan_ms", DEFAULT_SCAN_MS))))
        self._unsub_timer = async_track_time_interval(
            self.hass, self._scan, timedelta(milliseconds=ms), name="ha_ladder scan", cancel_on_shutdown=True
        )
        self._notify_listeners()
        self._push(force=True)

    @callback
    def async_stop(self) -> None:
        if self._unsub_timer is not None:
            self._unsub_timer()
            self._unsub_timer = None
        self._notify_listeners()
        self._push(force=True)

    async def async_shutdown(self) -> None:
        self.async_stop()
        if self.runtime:
            await self._retain_store.async_save(self.runtime.retain_data())

    async def async_set_running(self, running: bool) -> None:
        self.settings["running"] = running
        await self._save()
        if running:
            self.async_start()
        else:
            self.async_stop()

    # -- editing ---------------------------------------------------------------
    async def async_save_programs(self, programs: list[dict]) -> None:
        validate_programs(programs)
        self.programs = programs
        self.runtime.load(programs)
        self._logged_errors.clear()
        await self._save()

    async def async_set_scan_ms(self, ms: int) -> None:
        self.settings["scan_ms"] = int(min(MAX_SCAN_MS, max(MIN_SCAN_MS, ms)))
        await self._save()
        if self.running:
            self.async_stop()
            self.async_start()

    async def _save(self) -> None:
        await self._store.async_save({"programs": self.programs, "settings": self.settings})

    @callback
    def set_memory(self, name: str, value: Any) -> None:
        rt = self.runtime
        name = name.lstrip("#")
        if "." in name:
            base, fld = name.rsplit(".", 1)
            if fld.upper() == "CV" and base in rt.counters:
                rt.counters[base]["cv"] = float(value)
                rt.dirty = True
                return
        rt.memory[name] = value
        rt.dirty = True

    # -- scan --------------------------------------------------------------------
    @callback
    def _scan(self, _now=None) -> None:
        rt = self.runtime
        rt.scan()
        if rt.dirty:
            rt.dirty = False
            self._retain_store.async_delay_save(rt.retain_data, 10)
        # surface new errors in the HA log once (never per scan)
        for key, msg in rt.errors.items():
            sig = f"{key}:{msg}"
            if sig not in self._logged_errors:
                self._logged_errors.add(sig)
                _LOGGER.warning("Ladder element %s: %s", key, msg)
        self._push()
        now = time.monotonic()
        if now - self._last_entity_update >= 30:
            self._last_entity_update = now
            self._notify_listeners()

    # -- monitor (websocket only, never the event bus) ------------------------------
    @callback
    def add_monitor(self, cb: Callable[[dict], None]) -> CALLBACK_TYPE:
        self._monitors.add(cb)
        cb(self.snapshot())

        @callback
        def remove() -> None:
            self._monitors.discard(cb)

        return remove

    def snapshot(self) -> dict:
        rt = self.runtime
        return {
            "running": self.running,
            "m": rt.monitor,
            "e": rt.errors,
            "mem": {k: v for k, v in rt.memory.items() if isinstance(v, (bool, int, float, str)) or v is None},
            "ctr": rt.counters,
            "tmr": {k: {"q": t.q, "et": round(t.et, 2)} for k, t in rt.timers.items()},
            "stats": {
                "count": rt.stats.count,
                "last_ms": round(rt.stats.last_ms, 3),
                "max_ms": round(rt.stats.max_ms, 3),
                "errors": rt.stats.errors,
                "scan_ms": self.settings.get("scan_ms"),
            },
        }

    @callback
    def _push(self, force: bool = False) -> None:
        if not self._monitors:
            return
        now = time.monotonic()
        if not force and now - self._last_push < MONITOR_INTERVAL:
            return
        self._last_push = now
        snap = self.snapshot()
        for cb in list(self._monitors):
            cb(snap)

    # -- entity listeners ----------------------------------------------------------
    @callback
    def add_listener(self, cb: Callable[[], None]) -> CALLBACK_TYPE:
        self._listeners.add(cb)
        return lambda: self._listeners.discard(cb)

    @callback
    def _notify_listeners(self) -> None:
        for cb in list(self._listeners):
            cb()


def _default_program() -> dict:
    return {
        "id": "main",
        "name": "Main",
        "enabled": True,
        "rungs": [
            {
                "id": "r1",
                "comment": "Example: rename the tags to your own entities",
                "enabled": False,
                "logic": {
                    "id": "r1s",
                    "t": "series",
                    "items": [
                        {"id": "r1e1", "t": "el", "type": "NO", "tag": "binary_sensor.hallway_motion"},
                        {"id": "r1e2", "t": "el", "type": "SUN", "mode": "below", "elevation": 0},
                        {"id": "r1e3", "t": "el", "type": "TOF", "name": "HallOff", "pt": 120},
                    ],
                },
                "outputs": [{"id": "r1o1", "t": "el", "type": "COIL", "tag": "light.hallway"}],
            }
        ],
    }
