"""Ladder Logic: PLC-style ladder programming for Home Assistant."""
from __future__ import annotations

import logging
from pathlib import Path

import voluptuous as vol

from homeassistant.components import panel_custom
from homeassistant.components.frontend import async_remove_panel
from homeassistant.components.http import StaticPathConfig
from homeassistant.config_entries import ConfigEntry
from homeassistant.const import EVENT_HOMEASSISTANT_STARTED, Platform
from homeassistant.core import CoreState, Event, HomeAssistant, ServiceCall
from homeassistant.helpers import config_validation as cv

from .const import DOMAIN, PANEL_ELEMENT, PANEL_URL, STATIC_URL, VERSION
from .controller import LadderController
from .websocket import async_register_websocket

_LOGGER = logging.getLogger(__name__)
PLATFORMS = [Platform.SWITCH, Platform.SENSOR]
CONFIG_SCHEMA = cv.config_entry_only_config_schema(DOMAIN)

type LadderConfigEntry = ConfigEntry[LadderController]


async def async_setup(hass: HomeAssistant, config: dict) -> bool:
    async_register_websocket(hass)
    await hass.http.async_register_static_paths(
        [StaticPathConfig(STATIC_URL, str(Path(__file__).parent / "frontend"), False)]
    )
    return True


async def async_setup_entry(hass: HomeAssistant, entry: LadderConfigEntry) -> bool:
    controller = LadderController(hass)
    await controller.async_load()
    entry.runtime_data = controller
    hass.data[DOMAIN] = controller

    await panel_custom.async_register_panel(
        hass,
        webcomponent_name=PANEL_ELEMENT,
        frontend_url_path=PANEL_URL,
        module_url=f"{STATIC_URL}/ladder-panel.js?v={VERSION}",
        sidebar_title="Ladder Logic",
        sidebar_icon="mdi:ladder",
        require_admin=True,
        config={},
    )

    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)

    async def set_marker(call: ServiceCall) -> None:
        controller.set_memory(call.data["name"], call.data["value"])

    hass.services.async_register(
        DOMAIN,
        "set_marker",
        set_marker,
        schema=vol.Schema({vol.Required("name"): cv.string, vol.Required("value"): vol.Any(bool, vol.Coerce(float), cv.string)}),
    )

    # Only start scanning once every integration has loaded, otherwise the
    # first scan would see half the house as "unavailable".
    if controller.settings.get("running", True):
        if hass.state is CoreState.running:
            controller.async_start()
        else:
            async def _started(_: Event) -> None:
                controller.async_start()

            entry.async_on_unload(hass.bus.async_listen_once(EVENT_HOMEASSISTANT_STARTED, _started))
    return True


async def async_unload_entry(hass: HomeAssistant, entry: LadderConfigEntry) -> bool:
    ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    await entry.runtime_data.async_shutdown()
    async_remove_panel(hass, PANEL_URL)
    hass.services.async_remove(DOMAIN, "set_marker")
    hass.data.pop(DOMAIN, None)
    return ok
