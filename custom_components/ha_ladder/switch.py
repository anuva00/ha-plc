"""RUN/STOP switch for the ladder runtime."""
from __future__ import annotations

from homeassistant.components.switch import SwitchEntity
from homeassistant.helpers.device_registry import DeviceInfo

from .const import DOMAIN, VERSION


def device_info(entry_id: str) -> DeviceInfo:
    return DeviceInfo(identifiers={(DOMAIN, entry_id)}, name="Ladder Logic PLC", manufacturer="ha_ladder", sw_version=VERSION)


async def async_setup_entry(hass, entry, async_add_entities) -> None:
    async_add_entities([LadderRunSwitch(entry), LadderTestModeSwitch(entry)])


class LadderRunSwitch(SwitchEntity):
    _attr_has_entity_name = True
    _attr_name = "Run"
    _attr_icon = "mdi:play-pause"
    _attr_should_poll = False

    def __init__(self, entry) -> None:
        self._ctrl = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_run"
        self._attr_device_info = device_info(entry.entry_id)

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._ctrl.add_listener(self._changed))

    def _changed(self) -> None:
        # only write state when RUN/STOP actually changes (keeps the logbook quiet)
        if self._attr_is_on != self._ctrl.running:
            self._attr_is_on = self._ctrl.running
            self.async_write_ha_state()

    @property
    def is_on(self) -> bool:
        return self._ctrl.running

    async def async_turn_on(self, **kwargs) -> None:
        await self._ctrl.async_set_running(True)

    async def async_turn_off(self, **kwargs) -> None:
        await self._ctrl.async_set_running(False)


class LadderTestModeSwitch(SwitchEntity):
    """Test mode: the program runs but outputs and actions are only simulated."""

    _attr_has_entity_name = True
    _attr_name = "Test mode"
    _attr_icon = "mdi:test-tube"
    _attr_should_poll = False

    def __init__(self, entry) -> None:
        self._ctrl = entry.runtime_data
        self._attr_unique_id = f"{entry.entry_id}_test_mode"
        self._attr_device_info = device_info(entry.entry_id)
        self._attr_is_on = self._ctrl.simulate

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(self._ctrl.add_listener(self._changed))

    def _changed(self) -> None:
        if self._attr_is_on != self._ctrl.simulate:
            self._attr_is_on = self._ctrl.simulate
            self.async_write_ha_state()

    async def async_turn_on(self, **kwargs) -> None:
        await self._ctrl.async_set_simulate(True)

    async def async_turn_off(self, **kwargs) -> None:
        await self._ctrl.async_set_simulate(False)
