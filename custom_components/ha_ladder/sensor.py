"""Diagnostic scan-time sensor (updates at most every 30 s)."""
from __future__ import annotations

from homeassistant.components.sensor import SensorEntity, SensorStateClass
from homeassistant.const import EntityCategory, UnitOfTime

from .switch import device_info


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([LadderScanSensor(entry)])


class LadderScanSensor(SensorEntity):
    _attr_has_entity_name = True
    _attr_name = "Scan time"
    _attr_icon = "mdi:timer-cog-outline"
    _attr_should_poll = False
    _attr_native_unit_of_measurement = UnitOfTime.MILLISECONDS
    _attr_state_class = SensorStateClass.MEASUREMENT  # measurement sensors never appear in the logbook
    _attr_entity_category = EntityCategory.DIAGNOSTIC
    _attr_suggested_display_precision = 2
    _unrecorded_attributes = frozenset({"scan_count"})

    def __init__(self, entry) -> None:
        self._ctrl = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_scan_time"
        self._attr_device_info = device_info(entry.entry_id)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._ctrl.add_listener(self.async_write_ha_state))

    @property
    def native_value(self):
        return round(self._ctrl.runtime.stats.last_ms, 3)

    @property
    def extra_state_attributes(self):
        s = self._ctrl.runtime.stats
        return {
            "max_ms": round(s.max_ms, 3),
            "scan_count": s.count,
            "errors": s.errors,
            "cycle_ms": self._ctrl.settings.get("scan_ms"),
        }
