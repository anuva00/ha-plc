"""Version history and file backups for ladder programs."""
from __future__ import annotations

import copy
import json
import logging
import os
import re
import secrets
import time
from datetime import datetime
from pathlib import Path
from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import STORE_HISTORY, VERSION

_LOGGER = logging.getLogger(__name__)

MAX_AUTO = 50  # unpinned versions kept
MAX_PINNED = 100
BACKUP_DIR = "ladder_backups"
_BACKUP_RE = re.compile(r"^ladder-[A-Za-z0-9_.-]+\.json$")


def _summary(programs: list[dict]) -> dict:
    rungs = sum(len(p.get("rungs", [])) for p in programs)
    return {"programs": len(programs), "rungs": rungs, "names": [p.get("name", "?") for p in programs][:8]}


def _canon(programs: list[dict]) -> str:
    return json.dumps(programs, sort_keys=True, separators=(",", ":"))


class History:
    """Every save becomes a version. Versions can be pinned (kept forever),
    annotated and restored. Old unpinned versions roll off after MAX_AUTO."""

    def __init__(self, hass: HomeAssistant) -> None:
        self.hass = hass
        self._store = Store(hass, 1, STORE_HISTORY)
        self.versions: list[dict] = []  # newest first

    async def async_load(self, current: list[dict]) -> None:
        data = await self._store.async_load() or {}
        self.versions = data.get("versions") or []
        if not self.versions:
            self._add(current, "Initial version", source="initial")
            await self._save()

    async def _save(self) -> None:
        await self._store.async_save({"versions": self.versions})

    def _add(self, programs: list[dict], note: str = "", source: str = "save") -> dict | None:
        if self.versions and _canon(self.versions[0]["programs"]) == _canon(programs):
            return None  # identical to the newest version
        v = {
            "id": secrets.token_hex(5),
            "ts": round(time.time(), 3),
            "note": note or "",
            "source": source,
            "pinned": False,
            "summary": _summary(programs),
            "programs": copy.deepcopy(programs),
        }
        self.versions.insert(0, v)
        self._prune()
        return v

    def _prune(self) -> None:
        unpinned = [v for v in self.versions if not v.get("pinned")]
        drop = {v["id"] for v in unpinned[MAX_AUTO:]}
        pinned = [v for v in self.versions if v.get("pinned")]
        drop |= {v["id"] for v in pinned[MAX_PINNED:]}
        if drop:
            self.versions = [v for v in self.versions if v["id"] not in drop]

    async def async_record(self, programs: list[dict], note: str = "", source: str = "save") -> dict | None:
        v = self._add(programs, note, source)
        if v is not None:
            await self._save()
        elif note and self.versions:
            # same content saved again with a note: annotate the newest version
            if not self.versions[0].get("note"):
                self.versions[0]["note"] = note
                await self._save()
        return v

    def listing(self) -> list[dict]:
        return [{k: v[k] for k in ("id", "ts", "note", "source", "pinned", "summary")} for v in self.versions]

    def get(self, vid: str) -> dict:
        for v in self.versions:
            if v["id"] == vid:
                return v
        raise KeyError(vid)

    async def async_update(self, vid: str, note: str | None = None, pinned: bool | None = None) -> dict:
        v = self.get(vid)
        if note is not None:
            v["note"] = note.strip()[:200]
        if pinned is not None:
            v["pinned"] = bool(pinned)
        self._prune()
        await self._save()
        return {k: v[k] for k in ("id", "ts", "note", "source", "pinned", "summary")}

    async def async_delete(self, vid: str) -> None:
        if self.versions and self.versions[0]["id"] == vid:
            raise ValueError("the newest version is the one running and can't be deleted")
        self.get(vid)
        self.versions = [v for v in self.versions if v["id"] != vid]
        await self._save()

    # -- file backups --------------------------------------------------------
    def _dir(self) -> Path:
        return Path(self.hass.config.path(BACKUP_DIR))

    async def async_backup(self, payload: dict, keep: int | None = None, label: str = "") -> dict:
        name = "ladder-" + datetime.now().strftime("%Y%m%d-%H%M%S")
        if label:
            name += "-" + re.sub(r"[^A-Za-z0-9_-]+", "_", label)[:40]
        name += ".json"
        doc = {"type": "ha_ladder_backup", "version": VERSION, "created": datetime.now().isoformat(timespec="seconds"), **payload}

        def write() -> dict:
            d = self._dir()
            d.mkdir(exist_ok=True)
            path = d / name
            tmp = path.with_suffix(".tmp")
            tmp.write_text(json.dumps(doc, indent=1), encoding="utf-8")
            os.replace(tmp, path)
            removed = []
            if keep and keep > 0:
                files = sorted(d.glob("ladder-*.json"), key=lambda p: p.stat().st_mtime, reverse=True)
                for old in files[keep:]:
                    old.unlink(missing_ok=True)
                    removed.append(old.name)
            return {"name": name, "path": str(path), "size": path.stat().st_size, "removed": removed}

        res = await self.hass.async_add_executor_job(write)
        _LOGGER.info("Ladder: backup written to %s", res["path"])
        return res

    async def async_list_backups(self) -> list[dict]:
        def scan() -> list[dict]:
            d = self._dir()
            if not d.is_dir():
                return []
            out = []
            for p in d.glob("ladder-*.json"):
                st = p.stat()
                out.append({"name": p.name, "size": st.st_size, "mtime": st.st_mtime})
            return sorted(out, key=lambda x: x["mtime"], reverse=True)

        return await self.hass.async_add_executor_job(scan)

    async def async_read_backup(self, name: str) -> dict:
        if not _BACKUP_RE.match(name):
            raise ValueError("invalid backup name")

        def read() -> dict:
            path = self._dir() / name
            return json.loads(path.read_text(encoding="utf-8"))

        try:
            return await self.hass.async_add_executor_job(read)
        except FileNotFoundError as err:
            raise ValueError(f"{name} not found") from err
