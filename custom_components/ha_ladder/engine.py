"""Ladder logic scan engine.

Pure Python, no Home Assistant imports, so it can be unit tested on its own.
The integration supplies an ``IO`` adapter that reads entity states and calls
services.

Program model (JSON):

    program = {"id", "name", "enabled", "rungs": [rung, ...]}
    rung    = {"id", "comment", "enabled", "logic": series, "outputs": [element, ...]}
    series  = {"id", "t": "series",   "items":    [node, ...]}
    parallel= {"id", "t": "parallel", "branches": [series, ...]}
    element = {"id", "t": "el", "type": "NO", ...parameters}

Every element is evaluated as ``power_out = f(power_in)``. Series nodes AND
their items, parallel nodes OR their branches. The rung's outputs all
receive the power at the end of ``logic`` (they are drawn in parallel at
the right-hand rail).

Operands (strings typed by the user):
    light.kitchen            entity state
    sensor.x[temperature]    entity attribute
    #name                    internal memory marker (retentive)
    #T1.Q  #T1.ET            timer output / elapsed seconds
    #C1.Q  #C1.CV            counter output / current value
    12.5   true   'home'     constants
"""
from __future__ import annotations

import json
import math
import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable, Protocol

TRUE_STATES = {
    "on", "true", "yes", "home", "open", "opening", "detected", "playing",
    "active", "above_horizon", "armed_home", "armed_away", "armed_night",
    "armed_vacation", "armed_custom_bypass", "triggered", "heat", "cool",
    "heat_cool", "auto", "dry", "fan_only", "cleaning", "mowing", "locked",
}
FALSE_STATES = {
    "off", "false", "no", "not_home", "away", "closed", "closing", "clear",
    "idle", "paused", "standby", "below_horizon", "disarmed", "unlocked",
    "docked", "unknown", "unavailable", "none", "",
}
UNAVAILABLE = {"unavailable", "unknown", None}

# Entities written by a coil are read back as the commanded value for this
# long (or until the real state catches up) so seal-in circuits don't flicker.
SETTLE_SECONDS = 5.0
ENFORCE_RETRY_SECONDS = 5.0

CONTACTS = {"NO", "NC", "P", "N"}
TIMERS = {"TON", "TOF", "TP", "TONR"}
COUNTERS = {"CTU", "CTD", "CTUD"}
COILS = {"COIL", "NCOIL", "SET", "RESET", "PCOIL", "NECOIL"}
ELEMENT_TYPES = (
    CONTACTS | TIMERS | COUNTERS | COILS
    | {"CMP", "RANGE", "TIME", "SUN", "MOVE", "MATH", "SCALE", "SVC", "NOTIFY", "NOT", "PTRIG", "NTRIG"}
)

_NUM_RE = re.compile(r"^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$")
_ATTR_RE = re.compile(r"^([a-z_0-9]+\.[a-z0-9_]+)\[([^\]]+)\]$")
_ENTITY_RE = re.compile(r"^[a-z_0-9]+\.[a-z0-9_]+$")
_SUB_RE = re.compile(r"\{([^{}]+)\}")


class IO(Protocol):
    """Adapter between engine and Home Assistant."""

    def get(self, entity_id: str) -> tuple[str | None, dict]: ...
    def call(self, domain: str, service: str, data: dict) -> None: ...
    def now(self) -> datetime: ...
    def monotonic(self) -> float: ...


# --------------------------------------------------------------------------
# value helpers
# --------------------------------------------------------------------------
def to_number(v: Any) -> float | None:
    if v is None:
        return None
    if isinstance(v, bool):
        return 1.0 if v else 0.0
    if isinstance(v, (int, float)):
        return None if (isinstance(v, float) and math.isnan(v)) else float(v)
    s = str(v).strip()
    if _NUM_RE.match(s):
        return float(s)
    return None


def to_bool(v: Any, domain: str | None = None) -> bool:
    if v is None:
        return False
    if isinstance(v, bool):
        return v
    if isinstance(v, (int, float)):
        return v != 0
    s = str(v).strip().lower()
    if domain == "lock":
        return s == "locked"
    if domain == "media_player":
        return s not in {"off", "standby", "unavailable", "unknown", ""}
    if s in TRUE_STATES:
        return True
    if s in FALSE_STATES:
        return False
    n = to_number(s)
    if n is not None:
        return n != 0
    # any other non-empty state (e.g. a select option) counts as true
    return True


def fmt(v: Any) -> str:
    if v is None:
        return "—"
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, float):
        if v.is_integer() and abs(v) < 1e12:
            return str(int(v))
        return f"{v:.2f}".rstrip("0").rstrip(".")
    return str(v)


@dataclass
class Operand:
    kind: str  # const | mem | entity | attr | none
    ref: str = ""
    attr: str = ""
    value: Any = None

    @property
    def domain(self) -> str | None:
        if self.kind in ("entity", "attr"):
            return self.ref.split(".", 1)[0]
        return None


_operand_cache: dict[str, Operand] = {}


def parse_operand(raw: Any) -> Operand:
    if raw is None:
        return Operand("none")
    if isinstance(raw, bool):
        return Operand("const", value=raw)
    if isinstance(raw, (int, float)):
        return Operand("const", value=float(raw))
    s = str(raw).strip()
    cached = _operand_cache.get(s)
    if cached is not None:
        return cached
    op: Operand
    if s == "":
        op = Operand("none")
    elif s.startswith("#"):
        op = Operand("mem", ref=s[1:].strip())
    elif _NUM_RE.match(s):
        op = Operand("const", value=float(s))
    elif s.lower() in ("true", "false"):
        op = Operand("const", value=s.lower() == "true")
    elif len(s) >= 2 and s[0] == s[-1] and s[0] in "'\"":
        op = Operand("const", value=s[1:-1])
    elif (m := _ATTR_RE.match(s)):
        op = Operand("attr", ref=m.group(1), attr=m.group(2).strip())
    elif _ENTITY_RE.match(s):
        op = Operand("entity", ref=s)
    else:
        op = Operand("const", value=s)
    if len(_operand_cache) < 5000:
        _operand_cache[s] = op
    return op


# --------------------------------------------------------------------------
# runtime state
# --------------------------------------------------------------------------
@dataclass
class TimerState:
    running: bool = False
    start: float = 0.0
    et: float = 0.0
    q: bool = False
    prev_in: bool = False
    last: float | None = None  # TONR accumulation


@dataclass
class OutputCmd:
    value: Any
    enforce: bool = False


@dataclass
class ScanStats:
    count: int = 0
    last_ms: float = 0.0
    max_ms: float = 0.0
    errors: int = 0


class Runtime:
    """Executes ladder programs one scan at a time."""

    def __init__(self, io: IO, retain: dict | None = None) -> None:
        self.io = io
        self.programs: list[dict] = []
        retain = retain or {}
        # retentive data: memory markers, counters, TONR elapsed
        self.memory: dict[str, Any] = dict(retain.get("memory", {}))
        self.counters: dict[str, dict] = {k: dict(v) for k, v in retain.get("counters", {}).items()}
        self.tonr: dict[str, float] = dict(retain.get("tonr", {}))
        # forced tags: "#marker", "entity_id" or "entity_id[attr]" -> value (persist like a PLC force table)
        self.forces: dict[str, Any] = dict(retain.get("forces", {}))
        self.timers: dict[str, TimerState] = {}
        self.edges: dict[str, Any] = {}  # element id -> previous value
        self.image: dict[str, OutputCmd] = {}  # this scan's output image
        self.last_cmd: dict[str, Any] = {}  # entity -> last commanded value
        self.last_write: dict[str, float] = {}
        self.pending: dict[str, tuple[Any, float]] = {}
        self.monitor: dict[str, list] = {}
        self.errors: dict[str, str] = {}
        self.stats = ScanStats()
        self.dirty = False
        self.on_write: Callable[[str, Any], None] | None = None
        self._now_mono = 0.0
        self._now: datetime | None = None

    # -- persistence ------------------------------------------------------
    def retain_data(self) -> dict:
        return {"memory": self.memory, "counters": self.counters, "tonr": self.tonr, "forces": self.forces}

    # -- forcing ---------------------------------------------------------------
    @staticmethod
    def force_key(raw: Any) -> str | None:
        op = parse_operand(raw)
        if op.kind == "mem":
            return "#" + op.ref
        if op.kind == "entity":
            return op.ref
        if op.kind == "attr":
            return f"{op.ref}[{op.attr}]"
        return None

    def set_force(self, raw: Any, value: Any) -> str:
        key = self.force_key(raw)
        if key is None:
            raise ValueError(f"{raw!r} can't be forced")
        self.forces[key] = value
        self.dirty = True
        return key

    def clear_force(self, raw: Any | None = None) -> None:
        if raw is None:
            self.forces.clear()
        else:
            self.forces.pop(self.force_key(raw) or "", None)
        self.dirty = True

    def load(self, programs: list[dict]) -> None:
        self.programs = programs
        self.monitor = {}
        self.errors = {}
        # drop edge memory for elements that no longer exist
        ids = set()
        for p in programs:
            for r in p.get("rungs", []):
                _collect_ids(r.get("logic"), ids)
                for o in r.get("outputs", []):
                    _collect_ids(o, ids)
        self.edges = {k: v for k, v in self.edges.items() if k.split(":")[0] in ids}

    # -- reading ------------------------------------------------------------
    def read(self, raw: Any) -> Any:
        op = parse_operand(raw)
        if op.kind == "none":
            return None
        if op.kind == "const":
            return op.value
        if self.forces:
            key = self.force_key(raw)
            if key in self.forces:
                return self.forces[key]
        if op.kind == "mem":
            return self._read_mem(op.ref)
        state, attrs = self.io.get(op.ref)
        if op.kind == "attr":
            v = (attrs or {}).get(op.attr)
            return v
        # pending command read-back (output image), see SETTLE_SECONDS
        if op.ref in self.image:
            return self.image[op.ref].value
        pend = self.pending.get(op.ref)
        if pend is not None:
            val, t = pend
            if self._now_mono - t < SETTLE_SECONDS and not _state_matches(op.ref, state, val):
                return val
            self.pending.pop(op.ref, None)
        if state in UNAVAILABLE:
            return None
        n = to_number(state)
        return n if n is not None else state

    def read_bool(self, raw: Any) -> bool:
        op = parse_operand(raw)
        v = self.read(raw)
        return to_bool(v, op.domain)

    def read_num(self, raw: Any) -> float | None:
        return to_number(self.read(raw))

    def _read_mem(self, ref: str) -> Any:
        if "." in ref:
            name, fld = ref.rsplit(".", 1)
            fld = fld.upper()
            if fld in ("Q", "ET", "CV"):
                if name in self.timers:
                    ts = self.timers[name]
                    if fld == "Q":
                        return ts.q
                    if fld == "ET":
                        return round(ts.et, 3)
                if name in self.counters:
                    c = self.counters[name]
                    if fld == "Q":
                        return bool(c.get("q"))
                    if fld == "CV":
                        return float(c.get("cv", 0))
                if name in self.tonr and fld == "ET":
                    return self.tonr[name]
                if ref not in self.memory:
                    return False if fld == "Q" else 0.0
        return self.memory.get(ref)

    # -- writing ------------------------------------------------------------
    def write(self, raw: Any, value: Any, enforce: bool = False) -> None:
        op = parse_operand(raw)
        if self.forces and op.kind in ("mem", "entity"):
            key = "#" + op.ref if op.kind == "mem" else op.ref
            if key in self.forces:
                value = self.forces[key]  # a forced tag ignores the logic
        if op.kind == "mem":
            if self.memory.get(op.ref) != value:
                self.memory[op.ref] = value
                self.dirty = True
        elif op.kind == "entity":
            command_for(op.ref, value)  # raises if the entity can't take this value
            self.image[op.ref] = OutputCmd(value, enforce)
        elif op.kind != "none":
            raise ValueError(f"cannot write to {raw!r}")

    def _flush(self) -> None:
        # forced outputs are driven even when no coil wrote them this scan
        for key, val in self.forces.items():
            if key in self.last_cmd and key not in self.image:
                self.image[key] = OutputCmd(val)
        for entity, cmd in self.image.items():
            state, attrs = self.io.get(entity)
            if state in UNAVAILABLE:
                continue
            new = cmd.value
            matches = _state_matches(entity, state, new, attrs)
            if entity not in self.last_cmd:
                need = not matches
            elif not _same(self.last_cmd[entity], new):
                need = True
            elif cmd.enforce and not matches:
                need = (
                    entity not in self.pending
                    and self._now_mono - self.last_write.get(entity, -1e9) >= ENFORCE_RETRY_SECONDS
                )
            else:
                need = False
            self.last_cmd[entity] = new
            if need:
                try:
                    for domain, service, data in command_for(entity, new):
                        self.io.call(domain, service, data)
                except Exception as err:  # noqa: BLE001
                    self.errors[entity] = str(err)
                    self.stats.errors += 1
                    continue
                self.last_write[entity] = self._now_mono
                self.pending[entity] = (new, self._now_mono)
                if self.on_write:
                    self.on_write(entity, new)
        self.image = {}

    # -- scan ---------------------------------------------------------------
    def scan(self) -> None:
        self._now_mono = self.io.monotonic()
        self._now = self.io.now()
        t0 = self._now_mono
        mon: dict[str, list] = {}
        self.monitor = mon
        for prog in self.programs:
            if not prog.get("enabled", True):
                continue
            for rung in prog.get("rungs", []):
                if not rung.get("enabled", True):
                    continue
                try:
                    power = self._eval(rung.get("logic"), True)
                    for out in rung.get("outputs", []):
                        self._eval(out, power)
                except Exception as err:  # noqa: BLE001 - keep scanning other rungs
                    self.errors[rung.get("id", "?")] = str(err)
                    self.stats.errors += 1
        self._flush()
        dt = (self.io.monotonic() - t0) * 1000
        self.stats.count += 1
        self.stats.last_ms = dt
        self.stats.max_ms = max(self.stats.max_ms, dt)

    def _eval(self, node: dict | None, power: bool) -> bool:
        if node is None:
            return power
        t = node.get("t")
        nid = node.get("id", "")
        if t == "series":
            p = power
            for item in node.get("items", []):
                p = self._eval(item, p)
            self.monitor[nid] = [power, p, None]
            return p
        if t == "parallel":
            branches = node.get("branches", [])
            if not branches:
                return power
            out = False
            for br in branches:
                out = self._eval(br, power) or out
            self.monitor[nid] = [power, out, None]
            return out
        try:
            po, val = self._element(node, power)
            if nid in self.errors:
                self.errors.pop(nid, None)
        except Exception as err:  # noqa: BLE001
            self.errors[nid] = str(err)
            self.stats.errors += 1
            self.monitor[nid] = [power, False, "ERR"]
            return False
        self.monitor[nid] = [power, po, val]
        return po

    # -- elements -------------------------------------------------------------
    def _edge(self, key: str, cur: Any) -> Any:
        prev = self.edges.get(key, cur)
        self.edges[key] = cur
        return prev

    def _element(self, el: dict, pi: bool) -> tuple[bool, Any]:
        typ = el.get("type")
        eid = el.get("id", "")
        now = self._now_mono

        if typ == "NO":
            v = self.read_bool(el.get("tag"))
            return pi and v, v
        if typ == "NC":
            v = self.read_bool(el.get("tag"))
            return pi and not v, v
        if typ in ("P", "N"):
            v = self.read_bool(el.get("tag"))
            prev = self._edge(eid, v)
            hit = (v and not prev) if typ == "P" else (prev and not v)
            return pi and hit, v
        if typ == "NOT":
            return not pi, None
        if typ in ("PTRIG", "NTRIG"):  # edge of the power flow (RLO), true for one scan
            prev = self._edge(eid, pi)
            return ((pi and not prev) if typ == "PTRIG" else (prev and not pi)), None

        if typ == "CMP":
            a, b = self.read(el.get("a")), self.read(el.get("b"))
            return pi and compare(a, el.get("op", "=="), b), f"{fmt(a)} {el.get('op', '==')} {fmt(b)}"
        if typ == "RANGE":
            v, lo, hi = self.read_num(el.get("a")), self.read_num(el.get("min")), self.read_num(el.get("max"))
            ok = v is not None and lo is not None and hi is not None and lo <= v <= hi
            if el.get("invert"):
                ok = v is not None and not ok
            return pi and ok, fmt(v)
        if typ == "TIME":
            ok = in_time_window(self._now, el.get("from", "00:00"), el.get("to", "00:00"), el.get("days") or [])
            return pi and ok, self._now.strftime("%H:%M") if self._now else None
        if typ == "SUN":
            state, attrs = self.io.get("sun.sun")
            elev = to_number((attrs or {}).get("elevation"))
            thr = to_number(el.get("elevation")) or 0.0
            if elev is None:
                above = state == "above_horizon"
            else:
                above = elev > thr
            ok = above if el.get("mode", "above") == "above" else not above
            return pi and ok, f"{fmt(elev)}°" if elev is not None else state

        if typ in TIMERS:
            return self._timer(el, pi, now)
        if typ in COUNTERS:
            return self._counter(el, pi)

        if typ in COILS:
            tag = el.get("tag")
            enforce = bool(el.get("enforce"))
            if typ == "COIL":
                self.write(tag, pi, enforce)
            elif typ == "NCOIL":
                self.write(tag, not pi, enforce)
            elif typ == "SET":
                if pi:
                    self.write(tag, True, enforce)
            elif typ == "RESET":
                if pi:
                    self.write(tag, False, enforce)
            elif typ == "PCOIL":  # -(P)- operand true for one scan on rising RLO
                prev = self._edge(eid, pi)
                self.write(tag, bool(pi and not prev))
            elif typ == "NECOIL":  # -(N)- operand true for one scan on falling RLO
                prev = self._edge(eid, pi)
                self.write(tag, bool(prev and not pi))
            return pi, self.read_bool(tag) if typ not in ("PCOIL", "NECOIL") else pi

        if typ == "MOVE":
            v = self.read(el.get("src"))
            if pi:
                self.write(el.get("dst"), v)
            return pi, fmt(v)
        if typ == "MATH":
            a, b = self.read_num(el.get("a")), self.read_num(el.get("b"))
            r = math_op(el.get("op", "+"), a, b)
            if pi and r is not None:
                self.write(el.get("dst"), r)
            return pi and r is not None, fmt(r)
        if typ == "SCALE":
            v = self.read_num(el.get("src"))
            r = scale(v, *(self.read_num(el.get(k)) for k in ("in_min", "in_max", "out_min", "out_max")), clamp=el.get("clamp", True))
            if pi and r is not None:
                self.write(el.get("dst"), r)
            return pi and r is not None, fmt(r)

        if typ in ("SVC", "NOTIFY"):
            prev = self._edge(eid, pi)
            edge = el.get("edge", "rising")
            fire = (pi and not prev) if edge == "rising" else (prev and not pi)
            if fire:
                self._fire_service(el)
            return pi, None

        raise ValueError(f"unknown element type {typ!r}")

    def _timer(self, el: dict, pi: bool, now: float) -> tuple[bool, Any]:
        typ = el["type"]
        name = (el.get("name") or el.get("id") or "").strip()
        pt = max(0.0, to_number(self.read(el.get("pt"))) or 0.0)
        ts = self.timers.setdefault(name, TimerState())
        if typ == "TON":
            if pi:
                if not ts.running:
                    ts.running, ts.start = True, now
                ts.et = min(now - ts.start, pt)
                ts.q = ts.et >= pt
            else:
                ts.running, ts.et, ts.q = False, 0.0, False
        elif typ == "TOF":
            if pi:
                ts.q, ts.running, ts.et = True, False, 0.0
            elif ts.q:
                if not ts.running:
                    ts.running, ts.start = True, now
                ts.et = min(now - ts.start, pt)
                if ts.et >= pt:
                    ts.q, ts.running = False, False
        elif typ == "TP":
            if pi and not ts.prev_in and not ts.running:
                ts.running, ts.start = True, now
            if ts.running:
                ts.et = min(now - ts.start, pt)
                if ts.et >= pt:
                    ts.running = False
            elif not pi:
                ts.et = 0.0
            ts.q = ts.running
        elif typ == "TONR":
            et = self.tonr.get(name, 0.0)
            if el.get("reset") and self.read_bool(el.get("reset")):
                et = 0.0
                ts.last = None
            elif pi:
                if ts.last is not None:
                    et = min(pt, et + (now - ts.last))
                ts.last = now
            else:
                ts.last = None
            if self.tonr.get(name) != et:
                self.tonr[name] = et
                self.dirty = True
            ts.et, ts.q = et, et >= pt and pt > 0 or (pt == 0 and pi)
        ts.prev_in = pi
        return ts.q, f"{fmt(ts.et)}/{fmt(pt)}s"

    def _counter(self, el: dict, pi: bool) -> tuple[bool, Any]:
        typ = el["type"]
        name = (el.get("name") or el.get("id") or "").strip()
        pv = to_number(self.read(el.get("pv"))) or 0.0
        c = self.counters.setdefault(name, {"cv": 0.0, "q": False})
        cv = float(c.get("cv", 0))
        prev_cu = self._edge(el["id"] + ":cu", pi)
        cu = pi and not prev_cu
        reset = bool(el.get("reset")) and self.read_bool(el.get("reset"))
        load = bool(el.get("load")) and self.read_bool(el.get("load"))
        if typ == "CTU":
            if reset:
                cv = 0.0
            elif cu:
                cv += 1
            q = cv >= pv
        elif typ == "CTD":
            if load:
                cv = pv
            elif cu:
                cv -= 1
            q = cv <= 0
        else:  # CTUD: power = count up, `cd` operand = count down
            cdv = self.read_bool(el.get("cd")) if el.get("cd") else False
            prev_cd = self._edge(el["id"] + ":cd", cdv)
            cd = cdv and not prev_cd
            if reset:
                cv = 0.0
            elif load:
                cv = pv
            else:
                cv += (1 if cu else 0) - (1 if cd else 0)
            q = cv >= pv
        if c.get("cv") != cv or c.get("q") != q:
            c["cv"], c["q"] = cv, q
            self.dirty = True
        return q, f"{fmt(cv)}/{fmt(pv)}"

    def substitute(self, text: str) -> str:
        return _SUB_RE.sub(lambda m: fmt(self.read(m.group(1).strip())), text or "")

    def _fire_service(self, el: dict) -> None:
        if el["type"] == "NOTIFY":
            svc = (el.get("service") or "notify.notify").strip()
            data = {"message": self.substitute(el.get("message", ""))}
            if el.get("title"):
                data["title"] = self.substitute(el["title"])
        else:
            svc = (el.get("service") or "").strip()
            raw = el.get("data") or "{}"
            data = json.loads(raw) if isinstance(raw, str) else dict(raw)
            data = _sub_deep(data, self.substitute)
            if el.get("entity"):
                ents = [e.strip() for e in str(el["entity"]).split(",") if e.strip()]
                data["entity_id"] = ents[0] if len(ents) == 1 else ents
        if "." not in svc:
            raise ValueError(f"service must be domain.service, got {svc!r}")
        domain, service = svc.split(".", 1)
        self.io.call(domain, service, data)


# --------------------------------------------------------------------------
# pure helpers
# --------------------------------------------------------------------------
def _collect_ids(node: Any, out: set) -> None:
    if not isinstance(node, dict):
        return
    if node.get("id"):
        out.add(node["id"])
    for it in node.get("items", []) or []:
        _collect_ids(it, out)
    for br in node.get("branches", []) or []:
        _collect_ids(br, out)


def _sub_deep(v: Any, fn: Callable[[str], str]) -> Any:
    if isinstance(v, str):
        return fn(v) if "{" in v else v
    if isinstance(v, dict):
        return {k: _sub_deep(x, fn) for k, x in v.items()}
    if isinstance(v, list):
        return [_sub_deep(x, fn) for x in v]
    return v


def _same(a: Any, b: Any) -> bool:
    na, nb = to_number(a), to_number(b)
    if na is not None and nb is not None and not isinstance(a, bool) and not isinstance(b, bool):
        return abs(na - nb) < 1e-6
    return a == b


def compare(a: Any, op: str, b: Any) -> bool:
    na, nb = to_number(a), to_number(b)
    if na is not None and nb is not None:
        a, b = na, nb
    else:
        if a is None or b is None:
            return op == "!=" and (a is None) != (b is None)
        if isinstance(a, bool) or isinstance(b, bool):
            a, b = to_bool(a), to_bool(b)
        else:
            a, b = str(a).lower(), str(b).lower()
    try:
        return {
            "==": a == b, "!=": a != b, ">": a > b,
            "<": a < b, ">=": a >= b, "<=": a <= b,
        }[op]
    except (KeyError, TypeError):
        return False


def math_op(op: str, a: float | None, b: float | None) -> float | None:
    if a is None:
        return None
    if op in ("ABS", "abs"):
        return abs(a)
    if op in ("NEG", "neg"):
        return -a
    if op in ("ROUND", "round"):
        return float(round(a, int(b or 0)))
    if b is None:
        return None
    if op == "+":
        return a + b
    if op == "-":
        return a - b
    if op == "*":
        return a * b
    if op == "/":
        return None if b == 0 else a / b
    if op == "%":
        return None if b == 0 else a % b
    if op in ("MIN", "min"):
        return min(a, b)
    if op in ("MAX", "max"):
        return max(a, b)
    raise ValueError(f"unknown math op {op!r}")


def scale(v, in_min, in_max, out_min, out_max, clamp=True):
    if None in (v, in_min, in_max, out_min, out_max) or in_max == in_min:
        return None
    r = out_min + (v - in_min) * (out_max - out_min) / (in_max - in_min)
    if clamp:
        lo, hi = min(out_min, out_max), max(out_min, out_max)
        r = max(lo, min(hi, r))
    return r


def _hm(s: str) -> int:
    try:
        h, m = str(s).split(":")[:2]
        return int(h) * 60 + int(m)
    except (ValueError, AttributeError):
        return 0


def in_time_window(now: datetime | None, start: str, end: str, days: list) -> bool:
    if now is None:
        return False
    t = now.hour * 60 + now.minute
    a, b = _hm(start), _hm(end)
    if a == b:
        inside, day = True, now.weekday()
    elif a < b:
        inside, day = a <= t < b, now.weekday()
    else:  # crosses midnight: the window "belongs" to the day it started
        inside = t >= a or t < b
        day = now.weekday() if t >= a else (now.weekday() - 1) % 7
    if days and int(day) not in [int(d) for d in days]:
        return False
    return inside


def _state_matches(entity: str, state: str | None, value: Any, attrs: dict | None = None) -> bool:
    domain = entity.split(".", 1)[0]
    if isinstance(value, bool):
        if domain in ("scene", "button", "input_button"):
            return True  # momentary, nothing to compare
        return to_bool(state, domain) == value
    n = to_number(value)
    if n is not None:
        attrs = attrs or {}
        if domain == "light":
            if n <= 0:
                return state == "off"
            b = to_number(attrs.get("brightness"))
            return state == "on" and b is not None and abs(b / 2.55 - n) < 1.5
        if domain == "cover":
            return _same(attrs.get("current_position"), n)
        if domain == "fan":
            return _same(attrs.get("percentage"), n)
        if domain == "climate":
            return _same(attrs.get("temperature"), n)
        if domain == "media_player":
            return _same(attrs.get("volume_level"), n)
        return _same(state, n)
    return str(state) == str(value)


def command_for(entity: str, value: Any) -> list[tuple[str, str, dict]]:
    """Translate a commanded value into HA service calls."""
    domain = entity.split(".", 1)[0]
    tgt = {"entity_id": entity}
    if isinstance(value, bool):
        on = value
        if domain == "cover":
            return [("cover", "open_cover" if on else "close_cover", tgt)]
        if domain == "valve":
            return [("valve", "open_valve" if on else "close_valve", tgt)]
        if domain == "lock":
            return [("lock", "lock" if on else "unlock", tgt)]
        if domain in ("scene",):
            return [("scene", "turn_on", tgt)] if on else []
        if domain in ("button", "input_button"):
            return [(domain, "press", tgt)] if on else []
        if domain in ("input_number", "number"):
            return [(domain, "set_value", {**tgt, "value": 1 if on else 0})]
        if domain == "vacuum":
            return [("vacuum", "start" if on else "return_to_base", tgt)]
        if domain == "lawn_mower":
            return [("lawn_mower", "start_mowing" if on else "dock", tgt)]
        if domain == "alarm_control_panel":
            return [("alarm_control_panel", "alarm_arm_away" if on else "alarm_disarm", tgt)]
        if domain in ("sensor", "binary_sensor", "sun", "person", "device_tracker", "weather", "zone"):
            raise ValueError(f"{entity} is read-only")
        return [(domain, "turn_on" if on else "turn_off", tgt)]
    n = to_number(value)
    if n is not None:
        if domain in ("input_number", "number"):
            return [(domain, "set_value", {**tgt, "value": n})]
        if domain == "light":
            if n <= 0:
                return [("light", "turn_off", tgt)]
            return [("light", "turn_on", {**tgt, "brightness_pct": max(1, min(100, round(n)))})]
        if domain == "cover":
            return [("cover", "set_cover_position", {**tgt, "position": max(0, min(100, round(n)))})]
        if domain == "fan":
            return [("fan", "set_percentage", {**tgt, "percentage": max(0, min(100, round(n)))})]
        if domain == "climate":
            return [("climate", "set_temperature", {**tgt, "temperature": n})]
        if domain == "media_player":
            return [("media_player", "volume_set", {**tgt, "volume_level": max(0.0, min(1.0, n))})]
        if domain in ("input_text", "text"):
            return [(domain, "set_value", {**tgt, "value": fmt(n)})]
        if domain in ("input_select", "select"):
            return [(domain, "select_option", {**tgt, "option": fmt(n)})]
        raise ValueError(f"can't write a number to {entity}")
    s = "" if value is None else str(value)
    if domain in ("input_text", "text"):
        return [(domain, "set_value", {**tgt, "value": s})]
    if domain in ("input_select", "select"):
        return [(domain, "select_option", {**tgt, "option": s})]
    raise ValueError(f"can't write text to {entity}")


def validate_programs(programs: Any) -> list[dict]:
    """Light structural validation; raises ValueError on bad input."""
    if not isinstance(programs, list):
        raise ValueError("programs must be a list")

    def check(node: Any, where: str) -> None:
        if not isinstance(node, dict) or not node.get("id"):
            raise ValueError(f"{where}: node needs an id")
        t = node.get("t")
        if t == "series":
            for i, it in enumerate(node.get("items", [])):
                check(it, f"{where}.{i}")
        elif t == "parallel":
            for i, br in enumerate(node.get("branches", [])):
                if br.get("t") != "series":
                    raise ValueError(f"{where}: branch must be series")
                check(br, f"{where}.{i}")
        elif t == "el":
            if node.get("type") not in ELEMENT_TYPES:
                raise ValueError(f"{where}: unknown element {node.get('type')!r}")
            if node.get("type") == "SVC" and node.get("data"):
                try:
                    json.loads(node["data"]) if isinstance(node["data"], str) else None
                except json.JSONDecodeError as err:
                    raise ValueError(f"{where}: service data is not valid JSON ({err})") from err
        else:
            raise ValueError(f"{where}: bad node type {t!r}")

    for p in programs:
        if not isinstance(p, dict) or not p.get("id"):
            raise ValueError("program needs an id")
        for ri, r in enumerate(p.get("rungs", [])):
            where = f"{p.get('name', p['id'])} rung {ri + 1}"
            if r.get("logic") is not None:
                check(r["logic"], where)
            for o in r.get("outputs", []):
                check(o, where + " output")
    return programs
