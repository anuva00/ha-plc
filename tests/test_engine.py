import importlib.util
import pathlib
import sys
from datetime import datetime

import pytest

_p = pathlib.Path(__file__).parents[1] / "custom_components/ha_ladder/engine.py"
_spec = importlib.util.spec_from_file_location("ladder_engine", _p)
E = importlib.util.module_from_spec(_spec)
sys.modules["ladder_engine"] = E
_spec.loader.exec_module(E)

_n = 0


def nid():
    global _n
    _n += 1
    return f"n{_n}"


def el(type_, **kw):
    return {"id": kw.pop("id", nid()), "t": "el", "type": type_, **kw}


def S(*items):
    return {"id": nid(), "t": "series", "items": list(items)}


def P(*branches):
    return {"id": nid(), "t": "parallel", "branches": [b if b.get("t") == "series" else S(b) for b in branches]}


def prog(*rungs):
    return [{"id": "p1", "name": "Main", "enabled": True,
             "rungs": [{"id": nid(), "logic": l, "outputs": o} for l, o in rungs]}]


class FakeIO:
    def __init__(self):
        self.states = {}
        self.calls = []
        self.t = 1000.0
        self.dt = datetime(2026, 10, 29, 12, 0)

    def set(self, e, s, **attrs):
        self.states[e] = (s, attrs)

    def get(self, e):
        return self.states.get(e, (None, {}))

    def call(self, d, s, data):
        self.calls.append((d, s, data))
        # simulate HA applying the command after the scan
        ent = data.get("entity_id")
        if isinstance(ent, str) and s in ("turn_on", "turn_off"):
            self.states[ent] = ("on" if s == "turn_on" else "off", self.states.get(ent, (None, {}))[1])

    def now(self):
        return self.dt

    def monotonic(self):
        return self.t


@pytest.fixture
def io():
    return FakeIO()


def test_series_parallel_and_coil(io):
    io.set("binary_sensor.a", "on")
    io.set("binary_sensor.b", "off")
    io.set("binary_sensor.c", "on")
    io.set("light.x", "off")
    # (a AND b) OR c -> light.x
    logic = S(P(S(el("NO", tag="binary_sensor.a"), el("NO", tag="binary_sensor.b")), S(el("NO", tag="binary_sensor.c"))))
    rt = E.Runtime(io)
    rt.load(prog((logic, [el("COIL", tag="light.x")])))
    rt.scan()
    assert io.calls == [("light", "turn_on", {"entity_id": "light.x"})]
    rt.scan()
    assert len(io.calls) == 1  # write-on-change only
    io.set("binary_sensor.c", "off")
    rt.scan()
    assert io.calls[-1] == ("light", "turn_off", {"entity_id": "light.x"})


def test_seal_in_does_not_flicker(io):
    """Start/stop latch using the light's own state, with HA lagging behind."""
    io.set("input_button.start", "off")
    io.set("binary_sensor.start", "off")
    io.set("binary_sensor.stop", "off")
    io.set("switch.pump", "off")
    calls = []
    io.call = lambda d, s, data: calls.append((d, s))  # HA never updates state (laggy)
    logic = S(P(S(el("NO", tag="binary_sensor.start")), S(el("NO", tag="switch.pump"))), el("NC", tag="binary_sensor.stop"))
    rt = E.Runtime(io)
    rt.load(prog((logic, [el("COIL", tag="switch.pump")])))
    rt.scan()
    io.set("binary_sensor.start", "on"); io.t += 0.1; rt.scan()
    io.set("binary_sensor.start", "off"); io.t += 0.1; rt.scan()
    io.t += 0.1; rt.scan()
    assert calls == [("switch", "turn_on")]
    io.set("switch.pump", "on"); io.t += 0.1; rt.scan()
    io.set("binary_sensor.stop", "on"); io.t += 0.1; rt.scan()
    assert calls[-1] == ("switch", "turn_off")


def test_ton_tof_tp(io):
    io.set("binary_sensor.m", "on")
    rt = E.Runtime(io)
    rt.load(prog(
        (S(el("NO", tag="binary_sensor.m"), el("TON", name="T1", pt=5)), [el("COIL", tag="#ton")]),
        (S(el("NO", tag="binary_sensor.m"), el("TOF", name="T2", pt=3)), [el("COIL", tag="#tof")]),
        (S(el("NO", tag="binary_sensor.m"), el("TP", name="T3", pt=2)), [el("COIL", tag="#tp")]),
    ))
    rt.scan()
    assert rt.memory == {"ton": False, "tof": True, "tp": True}
    io.t += 2.5; rt.scan()
    assert rt.memory["tp"] is False and rt.memory["ton"] is False
    io.t += 2.5; rt.scan()
    assert rt.memory["ton"] is True
    assert rt.read("#T1.ET") == 5
    io.set("binary_sensor.m", "off"); io.t += 1; rt.scan()
    assert rt.memory == {"ton": False, "tof": True, "tp": False}
    io.t += 3.1; rt.scan()
    assert rt.memory["tof"] is False


def test_counter_and_compare(io):
    io.set("binary_sensor.door", "off")
    rt = E.Runtime(io)
    rt.load(prog(
        (S(el("NO", tag="binary_sensor.door"), el("CTU", name="C1", pv=3, reset="#rst")), [el("COIL", tag="#done")]),
        (S(el("CMP", a="#C1.CV", op=">=", b=2)), [el("COIL", tag="#two")]),
    ))
    for _ in range(3):
        rt.scan(); io.set("binary_sensor.door", "on"); rt.scan(); io.set("binary_sensor.door", "off")
    rt.scan()
    assert rt.counters["C1"]["cv"] == 3 and rt.memory["done"] is True and rt.memory["two"] is True
    rt.memory["rst"] = True; rt.scan()
    assert rt.counters["C1"]["cv"] == 0


def test_edges_and_service(io):
    io.set("binary_sensor.bell", "off")
    rt = E.Runtime(io)
    rt.load(prog((S(el("P", tag="binary_sensor.bell")),
                  [el("NOTIFY", service="notify.mobile_app_phone", message="Ding {sensor.temp}C"),
                   el("SVC", service="light.turn_on", entity="light.porch", data='{"brightness_pct": 50}')])))
    io.set("sensor.temp", "21.5")
    rt.scan()
    assert io.calls == []
    io.set("binary_sensor.bell", "on"); rt.scan(); rt.scan()
    assert io.calls == [
        ("notify", "mobile_app_phone", {"message": "Ding 21.5C"}),
        ("light", "turn_on", {"brightness_pct": 50, "entity_id": "light.porch"}),
    ]


def test_math_scale_move_to_entity(io):
    io.set("sensor.lux", "250")
    io.set("light.desk", "off", brightness=None)
    rt = E.Runtime(io)
    rt.load(prog(
        (S(), [el("SCALE", src="sensor.lux", in_min=0, in_max=500, out_min=100, out_max=0, dst="#b")]),
        (S(), [el("MATH", op="+", a="#b", b=10, dst="#b2")]),
        (S(el("CMP", a="#b2", op=">", b=0)), [el("MOVE", src="#b2", dst="light.desk")]),
    ))
    rt.scan()
    assert rt.memory["b"] == 50 and rt.memory["b2"] == 60
    assert io.calls == [("light", "turn_on", {"entity_id": "light.desk", "brightness_pct": 60})]


def test_time_window_and_sun(io):
    assert E.in_time_window(datetime(2026, 10, 29, 23, 30), "22:00", "06:00", [])
    assert E.in_time_window(datetime(2026, 10, 30, 5, 0), "22:00", "06:00", [3])  # Thu night window
    assert not E.in_time_window(datetime(2026, 10, 30, 5, 0), "22:00", "06:00", [4])
    io.set("sun.sun", "below_horizon", elevation=-3)
    rt = E.Runtime(io)
    rt.load(prog((S(el("SUN", mode="below", elevation=0)), [el("COIL", tag="#dark")])))
    rt.scan()
    assert rt.memory["dark"] is True


def test_strings_and_unavailable(io):
    io.set("person.me", "home")
    io.set("switch.z", "unavailable")
    rt = E.Runtime(io)
    rt.load(prog((S(el("CMP", a="person.me", op="==", b="'home'")), [el("COIL", tag="switch.z"), el("COIL", tag="#h")])))
    rt.scan()
    assert rt.memory["h"] is True and io.calls == []  # unavailable target is skipped
    io.set("switch.z", "off"); rt.scan()
    assert io.calls == [("switch", "turn_on", {"entity_id": "switch.z"})]


def test_error_isolated(io):
    rt = E.Runtime(io)
    rt.load(prog((S(), [el("COIL", tag="sensor.readonly")]), (S(), [el("COIL", tag="#ok")])))
    io.set("sensor.readonly", "1")
    rt.scan()
    assert rt.memory["ok"] is True
    assert rt.stats.errors == 1


def test_retain_roundtrip(io):
    rt = E.Runtime(io)
    rt.memory["x"] = 5
    rt.counters["C"] = {"cv": 2, "q": False}
    rt2 = E.Runtime(io, rt.retain_data())
    assert rt2.read("#x") == 5 and rt2.read("#C.CV") == 2


def test_validate():
    E.validate_programs(prog((S(el("NO", tag="a.b")), [el("COIL", tag="#x")])))
    with pytest.raises(ValueError):
        E.validate_programs(prog((S(el("BOGUS")), [])))
    with pytest.raises(ValueError):
        E.validate_programs(prog((S(), [el("SVC", service="a.b", data="{bad")])))


def test_edges_one_scan_each(io):
    io.set("binary_sensor.btn", "on")  # already on at startup -> must NOT trigger
    rt = E.Runtime(io)
    rt.load(prog(
        (S(el("P", tag="binary_sensor.btn")), [el("COIL", tag="#pc")]),
        (S(el("N", tag="binary_sensor.btn")), [el("COIL", tag="#nc")]),
        (S(el("NO", tag="binary_sensor.btn"), el("PTRIG")), [el("COIL", tag="#pt")]),
        (S(el("NO", tag="binary_sensor.btn"), el("NTRIG")), [el("COIL", tag="#nt")]),
        (S(el("NO", tag="binary_sensor.btn")), [el("PCOIL", tag="#pcoil"), el("NECOIL", tag="#ncoil")]),
    ))
    rt.scan()
    assert not any(rt.memory.values())
    io.set("binary_sensor.btn", "off"); rt.scan()
    assert rt.memory == {"pc": False, "nc": True, "pt": False, "nt": True, "pcoil": False, "ncoil": True}
    rt.scan()
    assert not any(rt.memory.values())
    io.set("binary_sensor.btn", "on"); rt.scan()
    assert rt.memory == {"pc": True, "nc": False, "pt": True, "nt": False, "pcoil": True, "ncoil": False}
    rt.scan()
    assert not any(rt.memory.values())


def test_edge_toggle_latch(io):
    """Classic Siemens toggle: P edge flips a marker."""
    io.set("binary_sensor.btn", "off")
    rt = E.Runtime(io)
    p_id = nid()
    rt.load(prog(
        (S(el("P", tag="binary_sensor.btn", id=p_id)), [el("COIL", tag="#edge")]),
        (S(el("NO", tag="#edge"), el("NC", tag="#lamp")), [el("SET", tag="#tmp")]),
        (S(el("NO", tag="#edge"), el("NO", tag="#lamp")), [el("RESET", tag="#tmp")]),
        (S(el("NO", tag="#edge")), [el("MOVE", src="#tmp", dst="#lamp")]),
    ))
    rt.scan()
    states = []
    for v in ["on", "on", "off", "on", "off", "off", "on"]:
        io.set("binary_sensor.btn", v); rt.scan(); states.append(bool(rt.memory.get("lamp")))
    assert states == [True, True, True, False, False, False, True]
