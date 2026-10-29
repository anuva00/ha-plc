/* Ladder Logic panel for Home Assistant — vanilla web component, no build step. */

const CW = 124;        // cell width
const CH = 92;         // cell height
const WY = 50;         // wire y inside a cell
const RAIL = 14;       // rail inset
const VERSION = "0.4.0";

const PALETTE = [
  { group: "Bit logic", items: [
    ["NO", "-| |-", "Normally open contact"],
    ["NC", "-|/|-", "Normally closed contact"],
    ["P", "-|P|-", "Rising edge contact"],
    ["N", "-|N|-", "Falling edge contact"],
    ["PTRIG", "P_TRIG", "Positive edge of power flow (one scan)"],
    ["NTRIG", "N_TRIG", "Negative edge of power flow (one scan)"],
    ["NOT", "-NOT-", "Invert power flow"],
  ]},
  { group: "Compare", items: [
    ["CMP", "CMP", "Compare two values (==, <>, >, <, >=, <=)"],
    ["RANGE", "IN_RANGE", "Value between min and max"],
    ["TIME", "TIME", "Time-of-day window (with days)"],
    ["SUN", "SUN", "Sun above/below an elevation"],
  ]},
  { group: "Timers", items: [
    ["TON", "TON", "On-delay timer"],
    ["TOF", "TOF", "Off-delay timer"],
    ["TP", "TP", "Pulse timer"],
    ["TONR", "TONR", "Retentive on-delay timer"],
  ]},
  { group: "Counters", items: [
    ["CTU", "CTU", "Count up"],
    ["CTD", "CTD", "Count down"],
    ["CTUD", "CTUD", "Count up/down"],
  ]},
  { group: "Outputs", items: [
    ["COIL", "-( )-", "Output coil"],
    ["NCOIL", "-(/)-", "Negated coil"],
    ["SET", "-(S)-", "Set (latch)"],
    ["RESET", "-(R)-", "Reset (unlatch)"],
    ["PCOIL", "-(P)-", "Set operand for one scan on rising edge"],
    ["NECOIL", "-(N)-", "Set operand for one scan on falling edge"],
  ]},
  { group: "Data", items: [
    ["MOVE", "MOVE", "Copy a value"],
    ["MATH", "MATH", "+ − × ÷ min max abs round"],
    ["SCALE", "SCALE", "Linear scaling"],
  ]},
  { group: "Home Assistant", items: [
    ["SVC", "SERVICE", "Call any HA action on an edge"],
    ["NOTIFY", "NOTIFY", "Send a notification on an edge"],
  ]},
];
const SHORT = {"PTRIG": "edge RLO+", "NTRIG": "edge RLO−", "CMP": "compare", "RANGE": "in range", "TIME": "time window", "SUN": "sun", "TON": "on-delay", "TOF": "off-delay", "TP": "pulse", "TONR": "retentive", "CTU": "count up", "CTD": "count down", "CTUD": "up/down", "MOVE": "copy value", "MATH": "arithmetic", "SCALE": "scale", "SVC": "call action", "NOTIFY": "notify", "NOT": "invert"};
const DESCR = Object.fromEntries(PALETTE.flatMap((g) => g.items.map((i) => [i[0], i[2]])));
const OUTPUT_TYPES = new Set(["COIL", "NCOIL", "SET", "RESET", "PCOIL", "NECOIL", "MOVE", "MATH", "SCALE", "SVC", "NOTIFY"]);
const CONTACT_TYPES = new Set(["NO", "NC", "P", "N"]);
const COIL_TYPES = new Set(["COIL", "NCOIL", "SET", "RESET", "PCOIL", "NECOIL"]);
const TIMER_TYPES = new Set(["TON", "TOF", "TP", "TONR"]);
const COUNTER_TYPES = new Set(["CTU", "CTD", "CTUD"]);

const DEFAULTS = {
  NO: { tag: "" }, NC: { tag: "" }, P: { tag: "" }, N: { tag: "" }, NOT: {}, PTRIG: {}, NTRIG: {},
  CMP: { a: "", op: ">", b: "" },
  RANGE: { a: "", min: "0", max: "100", invert: false },
  TIME: { from: "22:00", to: "06:00", days: [] },
  SUN: { mode: "below", elevation: "0" },
  TON: { name: "", pt: "5" }, TOF: { name: "", pt: "5" }, TP: { name: "", pt: "5" },
  TONR: { name: "", pt: "60", reset: "" },
  CTU: { name: "", pv: "10", reset: "" }, CTD: { name: "", pv: "10", load: "" },
  CTUD: { name: "", pv: "10", cd: "", reset: "", load: "" },
  COIL: { tag: "", enforce: false }, NCOIL: { tag: "", enforce: false },
  SET: { tag: "", enforce: false }, RESET: { tag: "", enforce: false }, PCOIL: { tag: "" }, NECOIL: { tag: "" },
  MOVE: { src: "", dst: "" },
  MATH: { op: "+", a: "", b: "", dst: "" },
  SCALE: { src: "", in_min: "0", in_max: "100", out_min: "0", out_max: "100", dst: "", clamp: true },
  SVC: { service: "", entity: "", data: "{}", edge: "rising" },
  NOTIFY: { service: "notify.notify", title: "", message: "", edge: "rising" },
};

const OPERAND_HELP = "entity_id · entity_id[attribute] · #marker · #T1.Q / #T1.ET · #C1.CV · 42 · 'text'";
const FIELDS = {
  contact: [["tag", "Tag", "operand", "Entity or #marker read as true/false"]],
  NOT: [], PTRIG: [], NTRIG: [], NECOIL: [["tag", "Tag", "operand", "Usually a #marker"]],
  CMP: [["a", "Value A", "operand"], ["op", "Operator", "select", ["==", "!=", ">", "<", ">=", "<="]], ["b", "Value B", "operand"]],
  RANGE: [["a", "Value", "operand"], ["min", "Min", "operand"], ["max", "Max", "operand"], ["invert", "Outside range instead", "check"]],
  TIME: [["from", "From", "time"], ["to", "To", "time"], ["days", "Days (none = every day)", "days"]],
  SUN: [["mode", "Sun is", "select", ["above", "below"]], ["elevation", "Elevation (°)", "text"]],
  timer: [["name", "Timer name", "text", "Read as #NAME.Q and #NAME.ET"], ["pt", "Preset time (s)", "operand"]],
  TONR: [["name", "Timer name", "text"], ["pt", "Preset time (s)", "operand"], ["reset", "Reset", "operand"]],
  CTU: [["name", "Counter name", "text", "Read as #NAME.CV and #NAME.Q"], ["pv", "Preset value", "operand"], ["reset", "Reset", "operand"]],
  CTD: [["name", "Counter name", "text"], ["pv", "Preset value", "operand"], ["load", "Load preset", "operand"]],
  CTUD: [["name", "Counter name", "text"], ["pv", "Preset value", "operand"], ["cd", "Count down input", "operand"], ["reset", "Reset", "operand"], ["load", "Load preset", "operand"]],
  coil: [["tag", "Tag", "operand", "Entity to switch, or #marker"], ["enforce", "Enforce (re-apply if changed by hand)", "check"]],
  PCOIL: [["tag", "Tag", "operand", "Usually a #marker"]],
  MOVE: [["src", "Source", "operand"], ["dst", "Destination", "operand", "#marker, input_number, light (brightness %), cover (position)…"]],
  MATH: [["op", "Operation", "select", ["+", "-", "*", "/", "%", "MIN", "MAX", "ABS", "ROUND"]], ["a", "A", "operand"], ["b", "B", "operand"], ["dst", "Result →", "operand"]],
  SCALE: [["src", "Input", "operand"], ["in_min", "In min", "operand"], ["in_max", "In max", "operand"], ["out_min", "Out min", "operand"], ["out_max", "Out max", "operand"], ["dst", "Result →", "operand"], ["clamp", "Clamp to output range", "check"]],
  SVC: [["service", "Action", "service"], ["entity", "Target entity (comma-separated)", "operand"], ["data", "Data (JSON, {tag} substitution)", "textarea"], ["edge", "Fire on", "select", ["rising", "falling"]]],
  NOTIFY: [["service", "Notify service", "service"], ["title", "Title", "text"], ["message", "Message ({sensor.x} substitution)", "textarea"], ["edge", "Fire on", "select", ["rising", "falling"]]],
};
function fieldsFor(type) {
  if (CONTACT_TYPES.has(type)) return FIELDS.contact;
  if (["TON", "TOF", "TP"].includes(type)) return FIELDS.timer;
  if (["COIL", "NCOIL", "SET", "RESET"].includes(type)) return FIELDS.coil;
  return FIELDS[type] || [];
}

/* ---------- entity picker metadata ---------- */
const DOMAIN_ICON = {
  light: "💡", switch: "🔌", binary_sensor: "◉", sensor: "📈", input_boolean: "☑", input_number: "🔢", number: "🔢",
  person: "👤", device_tracker: "📍", cover: "🪟", lock: "🔒", fan: "🌀", climate: "🌡", media_player: "🔊",
  scene: "🎬", script: "📜", automation: "🤖", button: "🔘", input_button: "🔘", sun: "☀", weather: "⛅",
  vacuum: "🧹", lawn_mower: "🌱", alarm_control_panel: "🛡", camera: "📷", select: "☰", input_select: "☰",
  input_text: "✎", text: "✎", timer: "⏲", counter: "#", valve: "🚰", siren: "🚨", humidifier: "💧",
  update: "⬆", zone: "🗺", schedule: "🗓", event: "⚡", calendar: "📅", water_heater: "♨", remote: "📡",
};
const READ_ONLY = new Set(["sensor", "binary_sensor", "person", "device_tracker", "sun", "weather", "zone", "update", "event", "calendar", "camera", "schedule"]);
const ROLE_PREF = {
  "bool-in": ["binary_sensor", "input_boolean", "switch", "light", "person", "device_tracker", "cover", "lock", "fan", "media_player", "sun", "alarm_control_panel", "automation", "schedule", "timer", "vacuum", "lawn_mower", "climate"],
  "bool-out": ["light", "switch", "input_boolean", "fan", "cover", "lock", "scene", "script", "button", "input_button", "siren", "valve", "vacuum", "lawn_mower", "climate", "media_player", "automation", "humidifier", "alarm_control_panel"],
  "num-in": ["sensor", "input_number", "number", "counter", "climate", "weather", "light", "cover", "media_player"],
  "num-out": ["input_number", "number", "light", "cover", "fan", "climate", "media_player", "input_text", "input_select", "select", "text"],
  "any-in": null,
  "trace": null,
  "target": null,
};
const ROLE_LABEL = { "bool-in": "on/off inputs", "bool-out": "switchable", "num-in": "values", "num-out": "settable", "any-in": "all", "target": "all", "trace": "all" };
const HIDE_ATTRS = new Set(["friendly_name", "icon", "entity_picture", "supported_features", "supported_color_modes", "attribution", "device_class", "unit_of_measurement", "state_class", "restored", "editable", "id", "user_id", "entity_id", "options", "effect_list", "hs_color", "rgb_color", "xy_color", "color_mode", "min_mireds", "max_mireds", "min_color_temp_kelvin", "max_color_temp_kelvin", "source_list", "sound_mode_list", "fan_modes", "hvac_modes", "preset_modes", "swing_modes", "preset_mode_list"]);
function roleFor(type, key) {
  if (key === "entity") return "target";
  if (key === "dst") return "num-out";
  if (key === "tag") return COIL_TYPES.has(type) ? "bool-out" : "bool-in";
  if (["reset", "load", "cd"].includes(key)) return "bool-in";
  if (type === "CMP") return "any-in";
  return "num-in";
}

const uid = () => "x" + Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function fmtDiffVal(v) {
  if (v === undefined || v === null || v === "") return "∅";
  if (Array.isArray(v)) return "[" + v.join(",") + "]";
  return typeof v === "string" ? `“${v.length > 30 ? v.slice(0, 29) + "…" : v}”` : String(v);
}
function fmtVal(v) {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "1" : "0";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  return String(v);
}

/* ---------- tree helpers ---------- */
function walk(node, fn, parent = null, path = []) {
  if (!node) return;
  fn(node, parent, path);
  const p2 = [...path, node];
  if (node.t === "series") node.items.forEach((it) => walk(it, fn, node, p2));
  if (node.t === "parallel") node.branches.forEach((b) => walk(b, fn, node, p2));
}
function sizeOf(n) {
  if (!n) return { w: 1, h: 1 };
  if (n.t === "el") return { w: 1, h: 1 };
  if (n.t === "series") {
    if (!n.items.length) return { w: 1, h: 1 };
    let w = 0, h = 1;
    for (const it of n.items) { const s = sizeOf(it); w += s.w; h = Math.max(h, s.h); }
    return { w, h };
  }
  let w = 1, h = 0;
  for (const b of n.branches) { const s = sizeOf(b); w = Math.max(w, s.w); h += s.h; }
  return { w, h: Math.max(1, h) };
}
function normalize(series) {
  // remove empty branches, unwrap single-branch parallels
  const out = [];
  for (const it of series.items) {
    if (it.t === "parallel") {
      it.branches.forEach(normalize);
      it.branches = it.branches.filter((b) => b.items.length);
      if (it.branches.length === 0) continue;
      if (it.branches.length === 1) { out.push(...it.branches[0].items); continue; }
    }
    out.push(it);
  }
  series.items = out;
}

/* ---------- the panel ---------- */
class LadderPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.programs = [];
    this.pi = 0;                 // current program index
    this.sel = null;             // {rung, ids: []}
    this.dirty = false;
    this.online = true;
    this.mon = null;
    this.undo = [];
    this.redo = [];
    this.settings = { scan_ms: 250 };
    this._lastTick = 0;
    this._zones = {};
    this.view = "ladder";
    try { this._collapsed = new Set(JSON.parse(localStorage.getItem("ha_ladder_collapsed") || "[]")); } catch (e) { this._collapsed = new Set(); }
    this.tagFilter = "all";
    this.tagQuery = "";
    this.trace = { signals: [], data: {}, hist: {}, hidden: {} };
    this.tview = { span: 300, end: Date.now() / 1000, live: true };
    this._drag = null;
    this._onDragMove = this._onDragMove.bind(this);
    this._onDragEnd = this._onDragEnd.bind(this);
    this._loaded = false;
    try { this.theme = localStorage.getItem("ha_ladder_theme") || "auto"; } catch (e) { this.theme = "auto"; }
  }

  set hass(h) {
    const first = !this._hass;
    this._hass = h;
    if (first) this._init();
    else this._tick();
  }
  get hass() { return this._hass; }
  set narrow(n) { this._narrow = n; this.toggleAttribute("narrow", !!n); }
  set panel(p) { this._panel = p; }

  connectedCallback() {
    if (this._hass && this._loaded && !this._unsub) this._subscribe();
    this._keyHandler = (e) => this._onKey(e);
    window.addEventListener("keydown", this._keyHandler);
    this._unloadGuard = (e) => { if (this.dirty) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", this._unloadGuard);
  }
  disconnectedCallback() {
    window.removeEventListener("keydown", this._keyHandler);
    window.removeEventListener("beforeunload", this._unloadGuard);
    if (this._unsub) { this._unsub.then((u) => u && u()).catch(() => {}); this._unsub = null; }
  }

  async _init() {
    this._renderShell();
    try {
      const r = await this._hass.callWS({ type: "ha_ladder/get" });
      this.programs = r.programs || [];
      this.settings = r.settings || this.settings;
      if (!this.programs.length) this.programs.push(this._newProgram("Main"));
    } catch (e) {
      this._toast("Couldn't load programs: " + (e.message || e.code || e), true);
      this.programs = [this._newProgram("Main")];
    }
    this._loaded = true;
    this._subscribe();
    this._render();
  }
  _subscribe() {
    this._unsub = this._hass.connection.subscribeMessage((m) => {
      this.mon = m;
      for (const [sig, pts] of Object.entries(m.trace || {})) {
        const arr = this.trace.data[sig] || (this.trace.data[sig] = []);
        arr.push(...pts);
        if (arr.length > 25000) arr.splice(0, arr.length - 20000);
      }
      this._tick(true);
    }, { type: "ha_ladder/monitor" });
    this._unsub.catch(() => {});
  }

  /* ---------- model access ---------- */
  get prog() { return this.programs[this.pi]; }
  _rung(id) { return this.prog.rungs.find((r) => r.id === id); }
  _locate(id) {
    for (const rung of this.prog.rungs) {
      let found = null;
      walk(rung.logic, (n, parent, path) => { if (n.id === id) found = { rung, where: "logic", node: n, parent, path }; });
      if (found) return found;
      const oi = rung.outputs.findIndex((o) => o.id === id);
      if (oi >= 0) return { rung, where: "outputs", node: rung.outputs[oi], parent: null, index: oi };
    }
    return null;
  }
  _newProgram(name) {
    return { id: uid(), name, enabled: true, rungs: [this._newRung()] };
  }
  _newRung() { return { id: uid(), comment: "", enabled: true, logic: { id: uid(), t: "series", items: [] }, outputs: [] }; }
  _newElement(type) {
    const el = { id: uid(), t: "el", type, ...clone(DEFAULTS[type] || {}) };
    if ("name" in el) el.name = this._autoName(TIMER_TYPES.has(type) ? "T" : "C");
    return el;
  }
  _autoName(prefix) {
    const used = new Set();
    for (const p of this.programs) for (const r of p.rungs) {
      walk(r.logic, (n) => { if (n.name) used.add(n.name); });
      r.outputs.forEach((o) => o.name && used.add(o.name));
    }
    let i = 1; while (used.has(prefix + i)) i++;
    return prefix + i;
  }

  _mutate(fn, structural = true) {
    this._pendingSnap = null;
    this.undo.push(JSON.stringify({ programs: this.programs, pi: this.pi }));
    if (this.undo.length > 80) this.undo.shift();
    this.redo = [];
    fn();
    this._anGen = (this._anGen || 0) + 1;
    this.prog.rungs.forEach((r) => normalize(r.logic));
    this._setDirty(true);
    if (structural) this._render(); else this._renderCanvas();
  }
  // snapshot taken on focus, only committed to the undo stack once something is typed
  _snap() { this._pendingSnap = JSON.stringify({ programs: this.programs, pi: this.pi }); }
  _commitSnap() {
    if (!this._pendingSnap) return;
    this.undo.push(this._pendingSnap); this._pendingSnap = null; this.redo = [];
    if (this.undo.length > 80) this.undo.shift();
  }
  _undo(redo = false) {
    const from = redo ? this.redo : this.undo, to = redo ? this.undo : this.redo;
    if (!from.length) return;
    to.push(JSON.stringify({ programs: this.programs, pi: this.pi }));
    const s = JSON.parse(from.pop());
    this.programs = s.programs; this.pi = Math.min(s.pi, this.programs.length - 1);
    this._anGen = (this._anGen || 0) + 1;
    this.sel = null;
    this._setDirty(true);
    this._render();
  }
  _setDirty(d) {
    this.dirty = d;
    const b = this.shadowRoot.getElementById("save");
    if (b) b.classList.toggle("hot", d);
    const w = this.shadowRoot.getElementById("dirtynote");
    if (w) w.hidden = !d;
  }

  /* ---------- editing operations ---------- */
  _insert(type) {
    const prog = this.prog;
    if (!prog.rungs.length) prog.rungs.push(this._newRung());
    const sel = this.sel;
    const el = this._newElement(type);
    this._mutate(() => {
      const rung = (sel && this._rung(sel.rung)) || prog.rungs[prog.rungs.length - 1];
      if (this._collapsed.delete(rung.id)) this._saveCollapsed();
      const loc = sel && sel.ids.length ? this._locate(sel.ids[sel.ids.length - 1]) : null;
      if (OUTPUT_TYPES.has(type)) {
        const idx = loc && loc.where === "outputs" ? loc.index + 1 : rung.outputs.length;
        rung.outputs.splice(idx, 0, el);
      } else if (loc && loc.where === "logic" && loc.parent && loc.parent.t === "series") {
        loc.parent.items.splice(loc.parent.items.indexOf(loc.node) + 1, 0, el);
      } else {
        rung.logic.items.push(el);
      }
      this.sel = { rung: rung.id, ids: [el.id] };
    });
    this._focusFirstField();
  }
  _wrapOr() {
    const sel = this.sel; if (!sel || !sel.ids.length) return;
    const locs = sel.ids.map((id) => this._locate(id)).filter(Boolean);
    if (!locs.length || locs.some((l) => l.where !== "logic")) { this._toast("Select contacts/blocks in the logic part of a rung to OR them"); return; }
    const series = locs[0].parent;
    if (locs.some((l) => l.parent !== series)) { this._toast("Selected items must be side by side in the same branch"); return; }
    const idxs = locs.map((l) => series.items.indexOf(l.node)).sort((a, b) => a - b);
    const newEl = this._newElement("NO");
    this._mutate(() => {
      const path = locs[0].path; // ancestors: [..., grandparent, series]
      const gp = path.length >= 2 ? path[path.length - 2] : null;
      if (gp && gp.t === "parallel" && idxs.length === series.items.length) {
        gp.branches.push({ id: uid(), t: "series", items: [newEl] });
      } else {
        const first = idxs[0], count = idxs[idxs.length - 1] - first + 1;
        const taken = series.items.splice(first, count);
        series.items.splice(first, 0, { id: uid(), t: "parallel", branches: [
          { id: uid(), t: "series", items: taken },
          { id: uid(), t: "series", items: [newEl] },
        ]});
      }
      this.sel = { rung: locs[0].rung.id, ids: [newEl.id] };
    });
    this._focusFirstField();
  }
  _delete() {
    const sel = this.sel; if (!sel) return;
    if (!sel.ids.length) { this._deleteRung(sel.rung); return; }
    this._mutate(() => {
      for (const id of sel.ids) {
        const loc = this._locate(id); if (!loc) continue;
        if (loc.where === "outputs") loc.rung.outputs.splice(loc.rung.outputs.indexOf(loc.node), 1);
        else if (loc.parent) {
          const arr = loc.parent.t === "series" ? loc.parent.items : loc.parent.branches;
          arr.splice(arr.indexOf(loc.node), 1);
        }
      }
      this.sel = { rung: sel.rung, ids: [] };
    });
  }
  _move(dir) {
    const sel = this.sel; if (!sel || sel.ids.length !== 1) return;
    const loc = this._locate(sel.ids[0]); if (!loc) return;
    const arr = loc.where === "outputs" ? loc.rung.outputs : loc.parent && loc.parent.t === "series" ? loc.parent.items : null;
    if (!arr) return;
    const i = arr.indexOf(loc.node), j = i + dir;
    if (j < 0 || j >= arr.length) return;
    this._mutate(() => { [arr[i], arr[j]] = [arr[j], arr[i]]; });
  }
  _addRung(after) {
    const r = this._newRung();
    this._mutate(() => {
      const i = after ? this.prog.rungs.findIndex((x) => x.id === after) : -1;
      this.prog.rungs.splice(i >= 0 ? i + 1 : this.prog.rungs.length, 0, r);
      this.sel = { rung: r.id, ids: [] };
    });
  }
  _deleteRung(id) {
    const r = this._rung(id); if (!r) return;
    if ((r.logic.items.length || r.outputs.length) && !confirm("Delete this rung?")) return;
    this._mutate(() => { this.prog.rungs = this.prog.rungs.filter((x) => x.id !== id); this.sel = null; });
  }
  _moveRung(id, dir) {
    const rs = this.prog.rungs, i = rs.findIndex((x) => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= rs.length) return;
    this._mutate(() => { [rs[i], rs[j]] = [rs[j], rs[i]]; });
  }
  _dupRung(id) {
    const r = this._rung(id); if (!r) return;
    const c = clone(r);
    const reid = (n) => { n.id = uid(); (n.items || []).forEach(reid); (n.branches || []).forEach(reid); };
    reid(c.logic); c.outputs.forEach(reid); c.id = uid();
    walk(c.logic, (n) => { if (n.name) n.name = this._autoName(TIMER_TYPES.has(n.type) ? "T" : "C"); });
    this._mutate(() => { this.prog.rungs.splice(this.prog.rungs.indexOf(r) + 1, 0, c); this.sel = { rung: c.id, ids: [] }; });
  }

  async _save(note = "") {
    try {
      await this._hass.callWS({ type: "ha_ladder/save", programs: this.programs, note });
      this._histCache = null;
      this._setDirty(false);
      const probs = this._analyze().problems.filter((x) => x.level !== "info");
      this._toast(probs.length ? `Saved — ${probs.length} check${probs.length > 1 ? "s" : ""} to look at (⚠ in the toolbar)` : "Saved — the runtime is now using this version");
    } catch (e) {
      this._toast("Save failed: " + (e.message || e.code || e), true);
    }
  }
  async _setRun(running) {
    try { await this._hass.callWS({ type: "ha_ladder/run", running }); }
    catch (e) { this._toast("Error: " + (e.message || e), true); }
  }

  /* ---------- keyboard ---------- */
  _onKey(e) {
    if (!this.isConnected || !this.offsetParent) return;
    const tag = (e.composedPath()[0] || {}).tagName || "";
    const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(tag);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); this._save(); return; }
    if (typing || this.view !== "ladder") return;
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); this._undo(e.shiftKey); return; }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") { e.preventDefault(); this._undo(true); return; }
    if (e.key === "Delete" || e.key === "Backspace") { if (this.sel) { e.preventDefault(); this._delete(); } }
    else if (e.key === "Escape") { this.sel = null; this._render(); }
    else if (e.key === "ArrowLeft" && e.altKey) this._move(-1);
    else if (e.key === "ArrowRight" && e.altKey) this._move(1);
  }

  /* ---------- rendering ---------- */
  _renderShell() {
    this.shadowRoot.innerHTML = `<style>${STYLE}</style>
      <div class="app">
        <header>
          <button class="icon menu" id="menu" title="Menu">☰</button>
          <div class="title">Ladder Logic</div>
          <div class="views" id="views">
            <button data-view="ladder" class="on">Ladder</button><button data-view="tags">Tags</button><button data-view="trace">Trace</button><button data-view="history">History</button>
          </div>
          <button class="forcepill" id="forcepill" hidden title="Forced tags are active — click to see them">F</button>
          <div class="tabs" id="tabs"></div>
          <span class="dirty" id="dirtynote" hidden>unsaved</span>
          <button class="tb" id="undo" title="Undo (Ctrl+Z)">↶</button>
          <button class="tb" id="redo" title="Redo (Ctrl+Y)">↷</button>
          <button class="tb" id="theme" title="Theme: auto / dark / light">◐<span class="wide" id="themelbl"> Auto</span></button>
          <button class="tb" id="online" title="Show live power flow">◉<span class="wide"> Monitor</span></button>
          <button class="tb" id="checks" title="Program checks" hidden></button>
          <button class="tb" id="testmode" title="Test mode: run the program without switching anything">🧪<span class="wide"> Test</span></button>
          <button class="tb run" id="run">…</button>
          <button class="tb primary" id="save" title="Save & download to runtime (Ctrl+S)">Save</button>
        </header>
        <div class="body">
          <aside class="palette" id="palette"></aside>
          <main id="canvas"><div class="loading">Loading…</div></main>
          <main id="page" hidden></main>
          <aside class="props" id="props"></aside>
        </div>
        <div class="toast" id="toast"></div>
        <input type="file" id="file" accept=".json,application/json" hidden>
      </div>`;
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("menu").onclick = () => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
    $("views").onclick = (e) => { const b = e.target.closest("[data-view]"); if (b) this._setView(b.dataset.view); };
    $("forcepill").onclick = () => { this.tagFilter = "forced"; this._setView("tags"); };
    const page = $("page");
    page.addEventListener("click", (e) => this._pageClick(e));
    page.addEventListener("input", (e) => this._pageInput(e));
    page.addEventListener("change", (e) => this._pageInput(e));
    page.addEventListener("keydown", (e) => { if (e.target.dataset.pick) this._pickKey(e); else if (e.key === "Enter" && e.target.dataset.fval !== undefined) { e.preventDefault(); this._pageClick({ target: e.target.closest("tr").querySelector("[data-tact=force]") }); } });
    page.addEventListener("focusin", (e) => { if (e.target.dataset.pick) this._pickOpen(e.target); });
    page.addEventListener("focusout", (e) => { if (e.target.dataset.pick) setTimeout(() => { if (this._pick && this._pick.input === e.target && this.shadowRoot.activeElement !== e.target) this._pickClose(); }, 120); });
    $("testmode").onclick = () => this._toggleTest();
    $("checks").onclick = () => { this.sel = null; this._showChecks = true; if (this.view !== "ladder") this._setView("ladder"); this._renderProps(); this._updateSvgs(); };
    $("undo").onclick = () => this._undo();
    $("redo").onclick = () => this._undo(true);
    $("save").onclick = (e) => {
      if (e.shiftKey) { const n = prompt("Note for this version (shown in History):", ""); if (n === null) return; this._save(n); }
      else this._save();
    };
    $("save").title = "Save & download to runtime (Ctrl+S). Shift-click to add a note for the version history.";
    $("theme").onclick = () => {
      this.theme = { auto: "dark", dark: "light", light: "auto" }[this.theme] || "auto";
      try { localStorage.setItem("ha_ladder_theme", this.theme); } catch (e) { /* private mode */ }
      this._applyTheme();
    };
    this._mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
    if (this._mq && this._mq.addEventListener) this._mq.addEventListener("change", () => this._applyTheme());
    this._applyTheme();
    $("online").onclick = () => { this.online = !this.online; this._renderToolbar(); this._updateSvgs(); };
    $("run").onclick = () => this._setRun(!(this.mon && this.mon.running));
    $("file").onchange = (e) => this._import(e.target.files[0]);
    $("palette").innerHTML = PALETTE.map((g) => `
      <div class="pgroup"><div class="pgtitle">${g.group}</div>
      ${g.items.map(([t, sym, d]) => `<button class="pitem" data-type="${t}" title="${esc(d)}"><span class="sym">${esc(sym)}</span><span class="pname">${SHORT[t] || t}</span></button>`).join("")}
      </div>`).join("");
    $("palette").addEventListener("click", (e) => {
      if (this._suppressClick) return;
      const b = e.target.closest("[data-type]"); if (b) this._insert(b.dataset.type);
    });
    $("palette").addEventListener("pointerdown", (e) => {
      const b = e.target.closest("[data-type]"); if (!b || e.button > 0) return;
      if (e.pointerType === "mouse") e.preventDefault();
      this._dragStart(e, { kind: "new", type: b.dataset.type });
    });
    this.shadowRoot.addEventListener("touchmove", (e) => { if (this._drag && this._drag.active) e.preventDefault(); }, { passive: false });
    const canvas = $("canvas");
    canvas.addEventListener("pointerdown", (e) => this._canvasPointer(e));
    canvas.addEventListener("click", (e) => this._canvasClick(e));
    canvas.addEventListener("input", (e) => {
      const t = e.target;
      if (t.dataset.comment) { const r = this._rung(t.dataset.comment); if (r) { this._commitSnap(); r.comment = t.value; this._setDirty(true); } }
    });
    canvas.addEventListener("focusin", (e) => { if (e.target.dataset.comment || e.target.dataset.progname !== undefined) this._snap(); });
    const props = $("props");
    props.addEventListener("focusin", (e) => { if (e.target.dataset.field || e.target.dataset.day !== undefined) this._snap(); });
    props.addEventListener("input", (e) => this._propInput(e));
    props.addEventListener("change", (e) => this._propInput(e));
    props.addEventListener("click", (e) => this._propClick(e));
    props.addEventListener("focusin", (e) => { if (e.target.dataset.pick) this._pickOpen(e.target); });
    props.addEventListener("focusout", (e) => { if (e.target.dataset.pick) setTimeout(() => { if (this._pick && this._pick.input === e.target && this.shadowRoot.activeElement !== e.target) this._pickClose(); }, 120); });
    props.addEventListener("keydown", (e) => { if (e.target.dataset.pick) this._pickKey(e); });
  }

  _render() {
    if (!this._loaded) return;
    this._renderToolbar();
    this._renderCanvas();
    this._renderProps();
  }

  _applyTheme() {
    let mode = this.theme;
    if (mode === "auto") {
      const haDark = this._hass && this._hass.themes && this._hass.themes.darkMode;
      mode = haDark || (haDark === undefined && this._mq && this._mq.matches) ? "dark" : "";
    }
    if (mode) this.setAttribute("data-theme", mode); else this.removeAttribute("data-theme");
    const l = this.shadowRoot.getElementById("themelbl");
    if (l) l.textContent = " " + this.theme[0].toUpperCase() + this.theme.slice(1);
  }

  _renderToolbar() {
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("tabs").innerHTML = this.programs.map((p, i) => `
      <button class="tab ${i === this.pi ? "on" : ""} ${p.enabled ? "" : "off"}" data-prog="${i}" title="${p.enabled ? "" : "Disabled"}">
        <span class="dot"></span>${esc(p.name)}</button>`).join("") +
      `<button class="tab add" data-prog="new" title="New program">＋</button>`;
    $("tabs").onclick = (e) => {
      const b = e.target.closest("[data-prog]"); if (!b) return;
      if (b.dataset.prog === "new") {
        const name = prompt("Program name", "Program " + (this.programs.length + 1)); if (!name) return;
        this._mutate(() => { this.programs.push(this._newProgram(name)); this.pi = this.programs.length - 1; this.sel = null; });
      } else { this.pi = +b.dataset.prog; this.sel = null; this._render(); }
    };
    $("tabs").style.visibility = this.view === "ladder" ? "" : "hidden";
    const sim = !!(this.mon && this.mon.simulate);
    $("testmode").classList.toggle("test", sim);
    $("testmode").title = sim ? "TEST MODE is on — outputs are simulated. Click to go live." : "Test mode: run the program without switching anything";
    const probs = this._analyze().problems.filter((p) => p.level !== "info");
    const ck = $("checks");
    ck.hidden = !probs.length;
    ck.innerHTML = `⚠<span class="wide"> ${probs.length}</span>`;
    ck.classList.toggle("bad", probs.some((p) => p.level === "error"));
    const nf = Object.keys((this.mon && this.mon.forces) || {}).length;
    $("forcepill").hidden = !nf;
    $("forcepill").textContent = `F ${nf} forced`;
    const running = !!(this.mon && this.mon.running);
    const run = $("run");
    run.innerHTML = running ? "■<span class=\"wide\"> STOP</span>" : "▶<span class=\"wide\"> RUN</span>";
    run.classList.toggle("running", running);
    run.title = running ? "PLC is running — click to stop scanning" : "PLC is stopped — click to start";
    $("online").classList.toggle("on", this.online);
    $("undo").disabled = !this.undo.length;
    $("redo").disabled = !this.redo.length;
    this._setDirty(this.dirty);
  }

  _maxCols() {
    let m = 3;
    for (const r of this.prog.rungs) m = Math.max(m, sizeOf(r.logic).w);
    return m;
  }

  _renderCanvas() {
    const c = this.shadowRoot.getElementById("canvas");
    const prog = this.prog;
    if (!prog) return;
    const status = (this.mon && this.mon.running ? "" : `<div class="banner">PLC is in STOP — outputs are not being updated.</div>`)
      + (this.mon && this.mon.simulate ? `<div class="banner test">🧪 <b>TEST MODE</b> — the program runs but outputs and actions are only simulated; nothing in the house is switched. <button class="mini" data-act="exittest">Go live</button></div>` : "");
    c.innerHTML = `
      ${status}
      <div class="proghead">
        <input class="progname" data-progname value="${esc(prog.name)}" title="Program name">
        <label class="chk"><input type="checkbox" data-progenabled ${prog.enabled ? "checked" : ""}> Enabled</label>
        <div class="spacer"></div>
        <button class="mini" data-act="collapseall" title="Collapse all rungs">⊟ Collapse</button>
        <button class="mini" data-act="expandall" title="Expand all rungs">⊞ Expand</button>
        <button class="mini" data-act="export">Export</button>
        <button class="mini" data-act="import">Import</button>
        <button class="mini danger" data-act="delprog">Delete program</button>
      </div>
      ${prog.rungs.map((r, i) => `
        <section class="rung ${this.sel && this.sel.rung === r.id ? "rsel" : ""} ${r.enabled ? "" : "disabled"} ${this._collapsed.has(r.id) ? "collapsed" : ""}" data-rung="${r.id}">
          <div class="rhead">
            <button class="chev" data-act="collapse" data-r="${r.id}" title="Collapse / expand">${this._collapsed.has(r.id) ? "▸" : "▾"}</button>
            <span class="rnum" data-rhandle="${r.id}" title="Drag to reorder">⠿ ${i + 1}</span>
            <span class="rled" data-rled="${r.id}" title="Rung result"></span>
            <input class="comment" data-comment="${r.id}" placeholder="Rung comment…" value="${esc(r.comment || "")}">
            <span class="rerr" data-rerr="${r.id}"></span>
            <label class="chk" title="Disabled rungs are skipped"><input type="checkbox" data-rungenable="${r.id}" ${r.enabled ? "checked" : ""}> on</label>
            <button class="mini" data-act="rup" data-r="${r.id}" title="Move up">▲</button>
            <button class="mini" data-act="rdown" data-r="${r.id}" title="Move down">▼</button>
            <button class="mini" data-act="rdup" data-r="${r.id}" title="Duplicate">⧉</button>
            <button class="mini danger" data-act="rdel" data-r="${r.id}" title="Delete rung">✕</button>
          </div>
          <div class="rsummary" data-rsum="${r.id}">${this._collapsed.has(r.id) ? this._rungSummary(r) : ""}</div>
          <div class="svgwrap" data-svg="${r.id}"></div>
        </section>`).join("")}
      <button class="addrung" data-act="addrung">＋ Add rung</button>
      <div class="foot">Ladder Logic v${VERSION}</div>`;
    c.querySelector("[data-progname]").oninput = (e) => { this._commitSnap(); prog.name = e.target.value; this._setDirty(true); };
    c.querySelector("[data-progname]").onchange = () => this._renderToolbar();
    c.querySelector("[data-progenabled]").onchange = (e) => this._mutate(() => { prog.enabled = e.target.checked; });
    c.querySelectorAll("[data-rungenable]").forEach((cb) => cb.onchange = (e) => {
      const r = this._rung(cb.dataset.rungenable); this._mutate(() => { r.enabled = e.target.checked; });
    });
    this._updateSvgs();
  }

  _canvasPointer(e) {
    if (e.button > 0) return;
    const hit = e.target.closest("[data-id]");
    const rungEl = e.target.closest("[data-rung]");
    const handle = e.target.closest("[data-rhandle]");
    if (handle) { e.preventDefault(); this._dragStart(e, { kind: "rung", id: handle.dataset.rhandle }); return; }
    if (e.target.closest("input,button,label,select,textarea")) return;
    if (hit && !e.shiftKey) this._dragStart(e, { kind: "move", id: hit.dataset.id });
    else if (e.pointerType !== "mouse" && e.target.closest(".svgwrap")) this._dragStart(e, null);
    if (hit && e.pointerType !== "mouse") return; // touch: select on release, so swiping to scroll doesn't select
    if (hit) {
      const id = hit.dataset.id, rung = hit.closest("[data-rung]").dataset.rung;
      if (e.shiftKey && this.sel && this.sel.rung === rung) {
        const ids = this.sel.ids.includes(id) ? this.sel.ids.filter((x) => x !== id) : [...this.sel.ids, id];
        this.sel = { rung, ids };
      } else this.sel = { rung, ids: [id] };
      e.preventDefault();
    } else if (e.target.closest("[data-addout]")) {
      this.sel = { rung: e.target.closest("[data-addout]").dataset.addout, ids: [] };
      this._insert("COIL"); return;
    } else if (rungEl) {
      this.sel = { rung: rungEl.dataset.rung, ids: [] };
    } else return;
    this.shadowRoot.querySelectorAll(".rung").forEach((r) => r.classList.toggle("rsel", this.sel && r.dataset.rung === this.sel.rung));
    if (this.sel && this.sel.ids.length) this._showChecks = false;
    this._updateSvgs();
    this._renderProps();
  }
  _selectId(id) {
    const loc = this._locate(id); if (!loc) return;
    this.sel = { rung: loc.rung.id, ids: [id] };
    this.shadowRoot.querySelectorAll(".rung").forEach((r) => r.classList.toggle("rsel", r.dataset.rung === loc.rung.id));
    this._updateSvgs();
    this._renderProps();
  }
  _canvasClick(e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const r = b.dataset.r;
    switch (b.dataset.act) {
      case "addrung": this._addRung(this.sel && this.sel.rung); break;
      case "exittest": this._toggleTest(); break;
      case "collapse": this._toggleCollapse(r); break;
      case "collapseall": this._collapseAll(true); break;
      case "expandall": this._collapseAll(false); break;
      case "rup": this._moveRung(r, -1); break;
      case "rdown": this._moveRung(r, 1); break;
      case "rdup": this._dupRung(r); break;
      case "rdel": this._deleteRung(r); break;
      case "export": this._export(); break;
      case "import": this.shadowRoot.getElementById("file").click(); break;
      case "delprog":
        if (this.programs.length < 2) { this._toast("Keep at least one program"); return; }
        if (!confirm(`Delete program "${this.prog.name}"?`)) return;
        this._mutate(() => { this.programs.splice(this.pi, 1); this.pi = Math.max(0, this.pi - 1); this.sel = null; });
        break;
    }
  }

  _export() {
    const blob = new Blob([JSON.stringify(this.prog, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = (this.prog.name || "program").replace(/[^\w-]+/g, "_") + ".ladder.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  async _import(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const list = Array.isArray(data) ? data : data.programs || [data];
      const ids = new Set(this.programs.map((p) => p.id));
      this._mutate(() => {
        for (const p of list) {
          if (!p || !Array.isArray(p.rungs)) throw new Error("not a ladder program");
          if (ids.has(p.id)) p.id = uid();
          // fresh element ids so an imported copy never collides with existing rungs
          const reid = (n) => { if (!n || typeof n !== "object") return; n.id = uid(); (n.items || []).forEach(reid); (n.branches || []).forEach(reid); };
          p.rungs.forEach((r) => { r.id = uid(); reid(r.logic); (r.outputs || []).forEach(reid); });
          this.programs.push(p);
        }
        this.pi = this.programs.length - 1;
      });
      this._toast(`Imported ${list.length} program(s) — Save to run`);
    } catch (e) { this._toast("Import failed: " + e.message, true); }
    this.shadowRoot.getElementById("file").value = "";
  }

  /* ---------- drag & drop ---------- */
  _dragStart(e, payload) {
    this._dragCleanup();
    const d = { payload, x0: e.clientX, y0: e.clientY, lx: e.clientX, ly: e.clientY, id: e.pointerId, touch: e.pointerType !== "mouse", active: false };
    // touch-action is "none" on draggable areas, so on touch we scroll these ourselves until a long-press starts a drag
    const wrap = e.target.closest && e.target.closest(".svgwrap");
    d.scrollEls = e.target.closest && e.target.closest(".palette")
      ? [this.shadowRoot.getElementById("palette")]
      : [wrap, this.shadowRoot.getElementById("canvas")].filter(Boolean);
    this._drag = d;
    if (d.touch && payload) d.timer = setTimeout(() => { if (this._drag === d && !d.moved) this._dragActivate(e.clientX, e.clientY); }, 260);
    window.addEventListener("pointermove", this._onDragMove);
    window.addEventListener("pointerup", this._onDragEnd);
    window.addEventListener("pointercancel", this._onDragEnd);
  }
  _dragActivate(cx, cy) {
    const d = this._drag; if (!d || !d.payload) return;
    d.active = true;
    if (navigator.vibrate && d.touch) try { navigator.vibrate(15); } catch (e) { /* ignore */ }
    const p = d.payload;
    let label = "";
    if (p.kind === "new") label = (PALETTE.flatMap((g) => g.items).find((i) => i[0] === p.type) || [p.type, p.type])[1];
    else if (p.kind === "move") { const loc = this._locate(p.id); label = loc ? (loc.node.t === "parallel" ? "OR branch" : loc.node.type) : "?"; }
    else label = "Rung " + (this.prog.rungs.findIndex((r) => r.id === p.id) + 1);
    const g = document.createElement("div");
    g.className = "ghost";
    g.textContent = label;
    this.shadowRoot.querySelector(".app").appendChild(g);
    d.ghost = g;
    this.toggleAttribute("dragging", true);
    if (p.kind === "move") this.shadowRoot.getElementById("palette").classList.add("trash");
    if (p.kind === "move") this._updateSvgs();
    d.scroller = setInterval(() => { if (d.vscroll) this.shadowRoot.getElementById("canvas").scrollTop += d.vscroll; }, 16);
    this._dragMoveTo(cx, cy);
  }
  _onDragMove(e) {
    const d = this._drag; if (!d || e.pointerId !== d.id) return;
    const dist = Math.hypot(e.clientX - d.x0, e.clientY - d.y0);
    if (!d.active) {
      if (d.touch) {
        if (dist > 8 || d.moved) {
          d.moved = true; clearTimeout(d.timer);
          const dx = e.clientX - d.lx, dy = e.clientY - d.ly;
          for (const el of d.scrollEls) { el.scrollLeft -= dx; el.scrollTop -= dy; }
          this._suppressClick = true;
        }
        d.lx = e.clientX; d.ly = e.clientY;
        return;
      }
      if (dist > 6) this._dragActivate(e.clientX, e.clientY);
      return;
    }
    e.preventDefault();
    this._dragMoveTo(e.clientX, e.clientY);
  }
  _dragMoveTo(cx, cy) {
    const d = this._drag;
    d.ghost.style.transform = `translate(${cx + 14}px, ${cy + 10}px)`;
    const main = this.shadowRoot.getElementById("canvas").getBoundingClientRect();
    d.vscroll = cy < main.top + 50 ? -12 : cy > main.bottom - 50 ? 12 : 0;
    this.shadowRoot.querySelectorAll(".dropind").forEach((n) => n.remove());
    this.shadowRoot.querySelectorAll(".rdrop-before,.rdrop-after").forEach((n) => n.classList.remove("rdrop-before", "rdrop-after"));
    const pal = this.shadowRoot.getElementById("palette");
    const pr = pal.getBoundingClientRect();
    d.overTrash = d.payload.kind === "move" && cx >= pr.left && cx <= pr.right && cy >= pr.top && cy <= pr.bottom;
    pal.classList.toggle("trashhot", d.overTrash);
    d.target = null;
    if (d.overTrash) return;
    if (d.payload.kind === "rung") { this._rungDropTarget(cx, cy); return; }
    let best = null;
    for (const host of this.shadowRoot.querySelectorAll("[data-svg]")) {
      const svg = host.querySelector("svg"); if (!svg) continue;
      const r = svg.getBoundingClientRect();
      if (cy < r.top - 20 || cy > r.bottom + 20 || cx < r.left - 20 || cx > r.right + 20) continue;
      const lx = cx - r.left, ly = cy - r.top, rid = host.dataset.svg;
      for (const z of this._zones[rid] || []) {
        if (!this._zoneOk(z, d.payload)) continue;
        const dist = Math.hypot((lx - z.x) * 0.8, ly - z.y);
        if (dist < 70 && (!best || dist < best.dist)) best = { z, dist, rid, svg };
      }
    }
    if (!best) return;
    d.target = { z: best.z, rung: best.rid };
    best.svg.insertAdjacentHTML("beforeend", this._dropIndicator(best.z));
  }
  _rungDropTarget(cx, cy) {
    const secs = [...this.shadowRoot.querySelectorAll("section.rung")];
    if (!secs.length) return;
    let idx = secs.length;
    for (let i = 0; i < secs.length; i++) {
      const r = secs[i].getBoundingClientRect();
      if (cy < r.top + r.height / 2) { idx = i; break; }
    }
    if (idx < secs.length) secs[idx].classList.add("rdrop-before");
    else secs[secs.length - 1].classList.add("rdrop-after");
    this._drag.target = { rungIndex: idx };
  }
  _dropIndicator(z) {
    // svg markup appended to the hovered rung
    if (z.kind === "ins") return `<g class="dropind"><line x1="${z.x}" y1="${z.y - 26}" x2="${z.x}" y2="${z.y + 26}"/><circle cx="${z.x}" cy="${z.y}" r="6"/></g>`;
    if (z.kind === "out") return `<g class="dropind"><rect x="${z.x - CW / 2 + 10}" y="${z.y - 3}" width="${CW - 20}" height="6" rx="3"/><circle cx="${z.x - CW / 2 + 10}" cy="${z.y}" r="5"/></g>`;
    return `<g class="dropind box"><rect x="${z.x - CW / 2 + 8}" y="${z.y - 12}" width="${CW - 16}" height="30" rx="8"/><text x="${z.x}" y="${z.y + 7}" text-anchor="middle">${z.kind === "or" ? "OR ⤵" : "+ branch"}</text></g>`;
  }
  _zoneOk(z, p) {
    let type = p.type, node = null;
    if (p.kind === "move") {
      const loc = this._locate(p.id); if (!loc) return false;
      node = loc.node; type = node.t === "el" ? node.type : "__par";
    }
    const isOut = OUTPUT_TYPES.has(type);
    if (z.kind === "out" && !isOut) return false;
    if ((z.kind === "or" || z.kind === "branch") && isOut) return false;
    if (node) {
      if (z.kind === "or" && z.node === node) return false;
      // can't drop a parallel inside itself
      let inside = false;
      const target = z.series || z.par || z.node;
      if (target) walk(node, (n) => { if (n === target) inside = true; });
      if (inside) return false;
    }
    return true;
  }
  _onDragEnd(e) {
    const d = this._drag; if (!d || (e && e.pointerId !== d.id)) return;
    if (d.moved) setTimeout(() => { this._suppressClick = false; }, 0);
    const wasActive = d.active, target = e && e.type === "pointercancel" ? null : d.target, trash = d.overTrash && e && e.type !== "pointercancel";
    this._dragCleanup();
    if (!wasActive) {
      if (d.touch && !d.moved && e && e.type === "pointerup" && d.payload && d.payload.kind === "move") this._selectId(d.payload.id);
      return;
    }
    this._suppressClick = true;
    setTimeout(() => { this._suppressClick = false; }, 0);
    const p = d.payload;
    if (trash && p.kind === "move") { this.sel = { rung: (this._locate(p.id) || {}).rung?.id, ids: [p.id] }; this._delete(); this._toast("Deleted — Ctrl+Z to undo"); return; }
    if (!target) { this._render(); return; }
    if (p.kind === "rung") {
      const rs = this.prog.rungs, from = rs.findIndex((r) => r.id === p.id);
      let to = target.rungIndex; if (to > from) to--;
      if (from < 0 || to === from) { this._render(); return; }
      this._mutate(() => { const [r] = rs.splice(from, 1); rs.splice(to, 0, r); this.sel = { rung: r.id, ids: [] }; });
      return;
    }
    this._applyDrop(target.z, target.rung, p);
  }
  _applyDrop(z, rungId, p) {
    let node = null;
    this._mutate(() => {
      const GONE = { t: "__gone", id: "__gone" };
      if (p.kind === "new") node = this._newElement(p.type);
      else {
        const loc = this._locate(p.id); if (!loc) return;
        node = loc.node;
        const arr = loc.where === "outputs" ? loc.rung.outputs : loc.parent.items;
        arr[arr.indexOf(node)] = GONE;
      }
      const rung = this._rung(rungId);
      if (z.kind === "ins") z.series.items.splice(z.index, 0, node);
      else if (z.kind === "out") rung.outputs.splice(z.index, 0, node);
      else if (z.kind === "or") {
        const i = z.series.items.indexOf(z.node);
        z.series.items.splice(i, 1, { id: uid(), t: "parallel", branches: [
          { id: uid(), t: "series", items: [z.node] },
          { id: uid(), t: "series", items: [node] },
        ]});
      } else if (z.kind === "branch") z.par.branches.push({ id: uid(), t: "series", items: [node] });
      for (const r of this.prog.rungs) {
        r.outputs = r.outputs.filter((o) => o !== GONE);
        walk(r.logic, (n) => { if (n.t === "series") n.items = n.items.filter((it) => it !== GONE); });
      }
      this.sel = { rung: rungId, ids: [node.id] };
    });
    if (p.kind === "new") this._focusFirstField();
  }
  _dragCleanup() {
    const d = this._drag; if (!d) return;
    clearTimeout(d.timer);
    clearInterval(d.scroller);
    if (d.ghost) d.ghost.remove();
    window.removeEventListener("pointermove", this._onDragMove);
    window.removeEventListener("pointerup", this._onDragEnd);
    window.removeEventListener("pointercancel", this._onDragEnd);
    this._drag = null;
    this.removeAttribute("dragging");
    const pal = this.shadowRoot.getElementById("palette");
    if (pal) pal.classList.remove("trash", "trashhot");
    this.shadowRoot.querySelectorAll(".dropind").forEach((n) => n.remove());
    this.shadowRoot.querySelectorAll(".rdrop-before,.rdrop-after").forEach((n) => n.classList.remove("rdrop-before", "rdrop-after"));
    if (d.active && d.payload.kind === "move") this._updateSvgs();
  }

  /* ---------- SVG ---------- */
  _updateSvgs() {
    const prog = this.prog; if (!prog) return;
    const cols = this._maxCols();
    const live = this._live();
    for (const r of prog.rungs) {
      const led = this.shadowRoot.querySelector(`[data-rled="${r.id}"]`);
      if (led) {
        const md = live && r.enabled && prog.enabled && this.mon.m[r.logic.id];
        led.className = "rled" + (md ? (md[1] ? " on" : " off") : "");
      }
      const host = this.shadowRoot.querySelector(`[data-svg="${r.id}"]`);
      if (this._collapsed.has(r.id)) { if (host) host.innerHTML = ""; this._zones[r.id] = []; continue; }
      if (host) host.innerHTML = this._rungSvg(r, cols);
      const err = this.shadowRoot.querySelector(`[data-rerr="${r.id}"]`);
      if (err) {
        const e = this.mon && this.mon.e && this.mon.e[r.id];
        err.textContent = e ? "⚠ " + e : "";
      }
    }
  }

  _live() { return this.online && this.mon && this.mon.running && !!this.mon.m; }

  _rungSvg(rung, cols) {
    const L = sizeOf(rung.logic);
    const nOut = Math.max(1, rung.outputs.length);
    const rows = Math.max(L.h, nOut);
    const W = RAIL * 2 + (cols + 1) * CW + 20;
    const H = rows * CH + 28;
    const ctx = { zones: [], out: [], live: this._live() && rung.enabled && this.prog.enabled, m: (this.mon && this.mon.m) || {} };
    const x = (c) => RAIL + c * CW, y = (r) => r * CH + WY;
    const rightRail = x(cols + 1) + 20;
    const railCls = ctx.live ? "rail on" : "rail";
    ctx.out.push(`<line class="${railCls}" x1="${RAIL}" y1="4" x2="${RAIL}" y2="${H - 2}"/>`);
    ctx.out.push(`<line class="${railCls}" x1="${rightRail}" y1="4" x2="${rightRail}" y2="${H - 2}"/>`);

    this._drawNode(rung.logic, 0, 0, cols, ctx, true);
    const md = ctx.m[rung.logic.id];
    const rp = md ? md[1] : undefined;
    // outputs column
    const oc = cols;
    if (rung.outputs.length > 1) ctx.out.push(`<line class="${this._wc(ctx, rp)}" x1="${x(oc)}" y1="${y(0)}" x2="${x(oc)}" y2="${y(rung.outputs.length - 1)}"/>`);
    if (!rung.outputs.length) {
      ctx.out.push(`<line class="${this._wc(ctx, rp)}" x1="${x(oc)}" y1="${y(0)}" x2="${x(oc) + 18}" y2="${y(0)}"/>`);
      ctx.out.push(`<g class="addout" data-addout="${rung.id}"><rect x="${x(oc) + 18}" y="${y(0) - 16}" width="${CW - 36}" height="32" rx="6"/><text x="${x(oc) + CW / 2}" y="${y(0) + 5}" text-anchor="middle">+ coil</text></g>`);
      ctx.out.push(`<line class="wire" x1="${x(oc) + CW - 18}" y1="${y(0)}" x2="${rightRail}" y2="${y(0)}"/>`);
    }
    rung.outputs.forEach((o, k) => {
      this._drawEl(o, oc, k, ctx, rp);
      ctx.out.push(`<line class="${this._wc(ctx, ctx.m[o.id] ? ctx.m[o.id][1] : undefined)}" x1="${x(oc + 1)}" y1="${y(k)}" x2="${rightRail}" y2="${y(k)}"/>`);
    });
    // output column drop zones
    const ox = x(oc) + CW / 2;
    if (!rung.outputs.length) ctx.zones.push({ kind: "out", index: 0, x: ox, y: y(0) });
    else for (let k = 0; k <= rung.outputs.length; k++) {
      ctx.zones.push({ kind: "out", index: k, x: ox, y: k === 0 ? y(0) - 34 : k === rung.outputs.length ? y(k - 1) + 40 : (y(k - 1) + y(k)) / 2 });
    }
    if (!rung.logic.items.length) {
      ctx.out.push(`<text class="hint" x="${x(0) + 14}" y="${y(0) - 10}">drag an instruction here, or select the rung and click one in the palette</text>`);
    }
    this._zones[rung.id] = ctx.zones;
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${ctx.out.join("")}</svg>`;
  }
  _wc(ctx, p) { return !ctx.live || p === undefined ? "wire" : p ? "wire on" : "wire off"; }

  _drawNode(n, c, r, W, ctx, inBranch = false) {
    const x = (cc) => RAIL + cc * CW, y = (rr) => rr * CH + WY;
    const md = ctx.m[n.id];
    if (n.t === "el") return this._drawEl(n, c, r, ctx, md ? md[0] : undefined);
    if (n.t === "series") {
      const pin = md ? md[0] : undefined, pout = md ? md[1] : undefined;
      const Z = ctx.zones, inset = inBranch ? 16 : 0;
      if (!n.items.length) {
        ctx.out.push(`<line class="${this._wc(ctx, pin)}" x1="${x(c)}" y1="${y(r)}" x2="${x(c + W)}" y2="${y(r)}"/>`);
        Z.push({ kind: "ins", series: n, index: 0, x: x(c) + (W * CW) / 2, y: y(r) });
        return;
      }
      let cc = c;
      n.items.forEach((it, i) => {
        Z.push({ kind: "ins", series: n, index: i, x: x(cc) + (i === 0 ? inset : 0), y: y(r) });
        const s = sizeOf(it);
        this._drawNode(it, cc, r, s.w, ctx);
        if (it.t === "el") Z.push({ kind: "or", node: it, series: n, x: x(cc) + CW / 2, y: y(r) + 56 });
        cc += s.w;
      });
      Z.push({ kind: "ins", series: n, index: n.items.length, x: x(cc) - inset, y: y(r) });
      if (cc < c + W) {
        ctx.out.push(`<line class="${this._wc(ctx, pout)}" x1="${x(cc)}" y1="${y(r)}" x2="${x(c + W)}" y2="${y(r)}"/>`);
        if (!inBranch && c + W - cc >= 1) Z.push({ kind: "ins", series: n, index: n.items.length, x: (x(cc) + x(c + W)) / 2, y: y(r) });
      }
      return;
    }
    // parallel
    let rr = r; const rowsAt = [];
    for (const b of n.branches) {
      rowsAt.push(rr);
      this._drawNode(b, c, rr, W, ctx, true);
      // branch filler is handled inside series; each branch end goes to right bus
      rr += sizeOf(b).h;
    }
    const last = rowsAt[rowsAt.length - 1];
    ctx.zones.push({ kind: "branch", par: n, x: x(c) + CW / 2, y: y(rr - 1) + 44 + (sizeOf(n.branches[n.branches.length - 1]).h > 1 ? 0 : 0), by: rr });
    const pin = md ? md[0] : undefined, pout = md ? md[1] : undefined;
    ctx.out.push(`<line class="${this._wc(ctx, pin)}" x1="${x(c)}" y1="${y(r)}" x2="${x(c)}" y2="${y(last)}"/>`);
    // right bus: colour each segment by whether any branch at/below feeds it
    n.branches.forEach((b, i) => {
      if (i === 0) return;
      const bm = ctx.m[b.id];
      ctx.out.push(`<line class="${this._wc(ctx, bm ? bm[1] || pout && i < n.branches.length : undefined)}" x1="${x(c + W)}" y1="${y(rowsAt[i - 1])}" x2="${x(c + W)}" y2="${y(rowsAt[i])}"/>`);
    });
    const selected = this.sel && this.sel.ids.includes(n.id);
    ctx.out.push(`<rect class="bushit ${selected ? "selbox" : ""}" data-id="${n.id}" x="${x(c + W) - 7}" y="${y(r) - 12}" width="14" height="${y(last) - y(r) + 24}" rx="5"><title>OR branch — select to insert after it, Delete removes all branches</title></rect>`);
    if (selected) ctx.out.push(`<rect class="selpar" x="${x(c) + 2}" y="${y(r) - 44}" width="${W * CW - 4}" height="${(last - r + 1) * CH - 6}" rx="8"/>`);
  }

  _label(tag) {
    const t = String(tag || "").trim();
    if (!t) return { main: "???", sub: "", warn: true };
    if (t.startsWith("#")) return { main: t, sub: "", warn: false };
    const base = t.replace(/\[.*$/, "");
    const st = this._hass.states[base];
    if (/^[a-z_0-9]+\.[a-z0-9_]+(\[.*\])?$/.test(t)) {
      return { main: st ? st.attributes.friendly_name || t : t, sub: st ? t : "not found", warn: !st };
    }
    return { main: t, sub: "", warn: false };
  }
  _liveVal(tag) {
    const t = String(tag || "").trim();
    if (!t) return "";
    if (this.mon && this.mon.forces && t in this.mon.forces) return fmtVal(this.mon.forces[t]) + " (F)";
    if (this.mon && this.mon.simulate && this.mon.sim && t in this.mon.sim) return fmtVal(this.mon.sim[t]) + " (sim)";
    if (t.startsWith("#")) {
      const n = t.slice(1), mon = this.mon || {};
      const m = /^(.*)\.(Q|ET|CV)$/i.exec(n);
      if (m) {
        const f = m[2].toUpperCase();
        if (mon.tmr && mon.tmr[m[1]]) return fmtVal(f === "Q" ? mon.tmr[m[1]].q : mon.tmr[m[1]].et);
        if (mon.ctr && mon.ctr[m[1]]) return fmtVal(f === "Q" ? mon.ctr[m[1]].q : mon.ctr[m[1]].cv);
      }
      return mon.mem && n in mon.mem ? fmtVal(mon.mem[n]) : "—";
    }
    const am = /^([a-z_0-9]+\.[a-z0-9_]+)\[(.+)\]$/.exec(t);
    if (am) { const st = this._hass.states[am[1]]; return st ? fmtVal(st.attributes[am[2]]) : ""; }
    const st = this._hass.states[t];
    if (!st) return "";
    const u = st.attributes.unit_of_measurement;
    return st.state + (u ? " " + u : "");
  }

  _drawEl(el, c, r, ctx, pin) {
    const x0 = RAIL + c * CW, x1 = x0 + CW, yy = r * CH + WY, cx = x0 + CW / 2;
    const md = ctx.m[el.id];
    const po = md ? md[1] : undefined;
    const val = md ? md[2] : undefined;
    const sel = this.sel && this.sel.ids.includes(el.id);
    const err = this.mon && this.mon.e && this.mon.e[el.id];
    const o = ctx.out;
    const wcIn = this._wc(ctx, pin), wcOut = this._wc(ctx, po);
    const t = el.type;
    const dragging = this._drag && this._drag.active && this._drag.payload.id === el.id;
    const warn = !err && this._analyze().elWarn.get(el.id);
    o.push(`<g class="el ${sel ? "sel" : ""} ${err ? "err" : ""} ${warn ? "warn-" + warn.level : ""} ${dragging ? "dragging" : ""}" data-id="${el.id}">`);
    o.push(`<rect class="hit" x="${x0 + 3}" y="${yy - 46}" width="${CW - 6}" height="${CH - 4}" rx="8"/>`);
    if (err) o.push(`<title>${esc(err)}</title>`);
    else if (warn) o.push(`<title>${esc(warn.msg)}</title>`);
    const label = (tag, yOff = 36) => {
      const L = this._label(tag);
      o.push(`<text class="lbl ${L.warn ? "warn" : ""}" x="${cx}" y="${yy - yOff}" text-anchor="middle">${esc(trunc(L.main, 19))}</text>`);
      if (L.sub) o.push(`<text class="tag" x="${cx}" y="${yy - yOff + 11}" text-anchor="middle">${esc(trunc(L.sub, 20))}</text>`);
    };
    const valueText = (s) => { if (s !== "" && s !== undefined && s !== null) o.push(`<text class="val ${/\(F\)$/.test(s) ? "fval" : /\(sim\)$/.test(s) ? "sval" : ""}" x="${cx}" y="${yy + 34}" text-anchor="middle">${esc(trunc(s, 20))}</text>`); };

    if (CONTACT_TYPES.has(t)) {
      const v = md ? md[2] : undefined;
      const conducting = ctx.live && md ? (t === "NO" ? v : t === "NC" ? !v : po) : false;
      o.push(`<line class="${wcIn}" x1="${x0}" y1="${yy}" x2="${cx - 10}" y2="${yy}"/>`);
      o.push(`<line class="${wcOut}" x1="${cx + 10}" y1="${yy}" x2="${x1}" y2="${yy}"/>`);
      if (conducting) o.push(`<rect class="fillon" x="${cx - 10}" y="${yy - 14}" width="20" height="28"/>`);
      o.push(`<line class="sym" x1="${cx - 10}" y1="${yy - 15}" x2="${cx - 10}" y2="${yy + 15}"/><line class="sym" x1="${cx + 10}" y1="${yy - 15}" x2="${cx + 10}" y2="${yy + 15}"/>`);
      if (t === "NC") o.push(`<line class="sym thin" x1="${cx - 7}" y1="${yy + 12}" x2="${cx + 7}" y2="${yy - 12}"/>`);
      if (t === "P" || t === "N") o.push(`<text class="symt" x="${cx}" y="${yy + 5}" text-anchor="middle">${t}</text>`);
      if (this._forced(el.tag)) o.push(`<rect class="fbadge" x="${cx - 30}" y="${yy - 22}" width="13" height="13" rx="3"/><text class="fbadget" x="${cx - 23.5}" y="${yy - 12}" text-anchor="middle">F</text>`);
      label(el.tag);
      valueText(this._liveVal(el.tag));
    } else if (COIL_TYPES.has(t)) {
      const on = ctx.live && md ? !!pin : false;
      o.push(`<line class="${wcIn}" x1="${x0}" y1="${yy}" x2="${cx - 13}" y2="${yy}"/>`);
      o.push(`<line class="${wcOut}" x1="${cx + 13}" y1="${yy}" x2="${x1}" y2="${yy}"/>`);
      if (on) o.push(`<circle class="fillon" cx="${cx}" cy="${yy}" r="12"/>`);
      o.push(`<path class="sym" d="M${cx - 7} ${yy - 15} Q${cx - 18} ${yy} ${cx - 7} ${yy + 15}"/><path class="sym" d="M${cx + 7} ${yy - 15} Q${cx + 18} ${yy} ${cx + 7} ${yy + 15}"/>`);
      const inner = { NCOIL: "/", SET: "S", RESET: "R", PCOIL: "P", NECOIL: "N" }[t];
      if (inner === "/") o.push(`<line class="sym thin" x1="${cx - 5}" y1="${yy + 10}" x2="${cx + 5}" y2="${yy - 10}"/>`);
      else if (inner) o.push(`<text class="symt" x="${cx}" y="${yy + 5}" text-anchor="middle">${inner}</text>`);
      if (el.enforce) o.push(`<text class="badge" x="${cx + 20}" y="${yy - 14}">E</text>`);
      if (this._forced(el.tag)) o.push(`<rect class="fbadge" x="${cx - 32}" y="${yy - 22}" width="13" height="13" rx="3"/><text class="fbadget" x="${cx - 25.5}" y="${yy - 12}" text-anchor="middle">F</text>`);
      label(el.tag);
      valueText(this._liveVal(el.tag));
    } else if (t === "NOT" || t === "PTRIG" || t === "NTRIG") {
      const txt = { NOT: "NOT", PTRIG: "P_TRIG", NTRIG: "N_TRIG" }[t], hw = t === "NOT" ? 18 : 30;
      const on = ctx.live && md ? !!po : false;
      o.push(`<line class="${wcIn}" x1="${x0}" y1="${yy}" x2="${cx - hw}" y2="${yy}"/><line class="${wcOut}" x1="${cx + hw}" y1="${yy}" x2="${x1}" y2="${yy}"/>`);
      o.push(`<rect class="box ${on ? "on" : ""}" x="${cx - hw}" y="${yy - 12}" width="${hw * 2}" height="24" rx="4"/><text class="boxt" x="${cx}" y="${yy + 4}" text-anchor="middle">${txt}</text>`);
    } else {
      // box instruction
      const spec = this._boxSpec(el);
      const on = ctx.live && md ? !!po : false;
      o.push(`<line class="${wcIn}" x1="${x0}" y1="${yy}" x2="${cx - 46}" y2="${yy}"/>`);
      o.push(`<line class="${wcOut}" x1="${cx + 46}" y1="${yy}" x2="${x1}" y2="${yy}"/>`);
      o.push(`<rect class="box ${on ? "on" : ""}" x="${cx - 46}" y="${yy - 20}" width="92" height="44" rx="5"/>`);
      o.push(`<text class="boxt" x="${cx}" y="${yy - 5}" text-anchor="middle">${esc(spec.title)}</text>`);
      o.push(`<text class="boxs" x="${cx}" y="${yy + 12}" text-anchor="middle">${esc(trunc(spec.sub, 14))}</text>`);
      if (spec.label !== undefined) {
        const L = spec.labelIsTag ? this._label(spec.label) : { main: spec.label, warn: !spec.label && spec.required };
        o.push(`<text class="lbl ${L.warn ? "warn" : ""}" x="${cx}" y="${yy - 28}" text-anchor="middle">${esc(trunc(L.main || "???", 19))}</text>`);
      }
      const v = ctx.live && val !== undefined && val !== null ? fmtVal(val) : spec.idle || "";
      valueText(v);
    }
    o.push(`</g>`);
  }

  _boxSpec(el) {
    const t = el.type;
    switch (t) {
      case "CMP": return { title: `CMP ${el.op === "!=" ? "<>" : el.op}`, sub: `${el.b === "" ? "?" : this._short(el.b)}`, label: el.a, labelIsTag: true };
      case "RANGE": return { title: el.invert ? "OUT_RANGE" : "IN_RANGE", sub: `${el.min} … ${el.max}`, label: el.a, labelIsTag: true };
      case "TIME": return { title: "TIME", sub: `${el.from}–${el.to}`, label: el.days && el.days.length ? el.days.map((d) => DAYS[d][0] + DAYS[d][1]).join(" ") : "every day" };
      case "SUN": return { title: "SUN", sub: `${el.mode} ${el.elevation || 0}°` };
      case "TON": case "TOF": case "TP": case "TONR":
        return { title: t, sub: `PT ${this._short(el.pt)}s`, label: el.name, required: true, idle: `PT ${el.pt}s` };
      case "CTU": case "CTD": case "CTUD":
        return { title: t, sub: `PV ${this._short(el.pv)}`, label: el.name, required: true, idle: this._liveVal("#" + el.name + ".CV") };
      case "MOVE": return { title: "MOVE", sub: `← ${this._short(el.src)}`, label: el.dst, labelIsTag: true };
      case "MATH": return { title: el.op, sub: `${this._short(el.a)} ${el.op} ${this._short(el.b)}`, label: el.dst, labelIsTag: true };
      case "SCALE": return { title: "SCALE", sub: this._short(el.src), label: el.dst, labelIsTag: true };
      case "SVC": return { title: "SERVICE", sub: el.service || "?", label: el.entity ? el.entity.split(",")[0] : el.service, labelIsTag: !!el.entity };
      case "NOTIFY": return { title: "NOTIFY", sub: el.message || "", label: (el.service || "").replace(/^notify\./, "") };
      default: return { title: t, sub: "" };
    }
  }
  _short(op) {
    const s = String(op ?? "");
    const st = this._hass.states[s];
    if (st) return st.attributes.friendly_name || s;
    return s;
  }

  /* ---------- properties / watch panel ---------- */
  _renderProps() {
    this._pickClose();
    const p = this.shadowRoot.getElementById("props");
    const sel = this.sel;
    this.toggleAttribute("sheet", !!(sel && sel.ids.length));
    if (sel && sel.ids.length === 1) {
      const loc = this._locate(sel.ids[0]);
      if (loc && loc.node.t === "el") { p.innerHTML = this._elementForm(loc.node, loc); return; }
      if (loc && loc.node.t === "parallel") { p.innerHTML = this._selActions("OR branch", "Insert after it by picking from the palette.", loc); return; }
    }
    if (sel && sel.ids.length > 1) { p.innerHTML = this._selActions(`${sel.ids.length} selected`, "Wrap them in an OR branch or delete them.", null); return; }
    p.innerHTML = this._showChecks ? this._checksHtml() : this._watch();
  }
  _selActions(title, hint) {
    return `<div class="phead"><b>${esc(title)}</b><button class="mini" data-pact="close">✕</button></div>
      <p class="muted">${esc(hint)}</p>
      <div class="acts">
        <button class="mini" data-pact="or">OR branch</button>
        <button class="mini danger" data-pact="del">Delete</button>
      </div>`;
  }
  _elementForm(el, loc) {
    const fields = fieldsFor(el.type);
    const rows = fields.map(([key, label, kind, extra]) => {
      const v = el[key];
      let input;
      if (kind === "operand" || kind === "service") {
        const role = kind === "service" ? (el.type === "NOTIFY" ? "notify" : "service") : roleFor(el.type, key);
        const help = typeof extra === "string" ? `<div class="help">${esc(extra)}</div>` : "";
        return `<div class="field picker-field"><span>${esc(label)}</span>
          <div class="pickwrap"><input data-field="${key}" data-pick="${role}" value="${esc(v ?? "")}" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="${kind === "service" ? "Search actions…" : "Search entities, or #marker, or a value…"}"><button class="pickbtn" data-pickopen="${key}" tabindex="-1" title="Browse">▾</button></div>
          ${kind === "operand" ? `<div class="live" data-live="${esc(key)}">${this._operandChip(v)}</div>` : ""}${help}</div>`;
      }
      else if (kind === "text") input = `<input data-field="${key}" value="${esc(v ?? "")}" spellcheck="false">`;
      else if (kind === "time") input = `<input type="time" data-field="${key}" value="${esc(v ?? "")}">`;
      else if (kind === "textarea") input = `<textarea data-field="${key}" rows="3" spellcheck="false">${esc(v ?? "")}</textarea>`;
      else if (kind === "check") return `<label class="chk row"><input type="checkbox" data-field="${key}" ${v ? "checked" : ""}> ${esc(label)}</label>`;
      else if (kind === "select") input = `<select data-field="${key}">${extra.map((o) => `<option ${o === v ? "selected" : ""} value="${esc(o)}">${esc(o === "!=" ? "<> (not equal)" : o)}</option>`).join("")}</select>`;
      else if (kind === "days") input = `<div class="days">${DAYS.map((d, i) => `<label><input type="checkbox" data-day="${i}" ${(v || []).includes(i) ? "checked" : ""}>${d}</label>`).join("")}</div>`;
      const help = typeof extra === "string" ? `<div class="help">${esc(extra)}</div>` : "";
      return `<label class="field"><span>${esc(label)}</span>${input}${help}</label>`;
    }).join("");
    const err = this.mon && this.mon.e && this.mon.e[el.id];
    const inOut = loc.where === "outputs" ? "output" : "logic";
    return `<div data-elid="${el.id}">
      <div class="phead"><b>${esc(el.type)}</b> <span class="muted">${esc(DESCR[el.type] || "")}</span><button class="mini" data-pact="close">✕</button></div>
      ${err ? `<div class="errbox">⚠ ${esc(err)}</div>` : ""}
      ${(() => { const w = this._analyze().elWarn.get(el.id); return w && !err ? `<div class="errbox ${w.level}">${w.level === "error" ? "⛔" : "⚠"} ${esc(w.msg)}</div>` : ""; })()}
      ${rows || `<p class="muted">No settings.</p>`}
      <div class="acts">
        <button class="mini" data-pact="left" title="Alt+←">◀ Move</button>
        <button class="mini" data-pact="right" title="Alt+→">Move ▶</button>
        ${inOut === "logic" ? `<button class="mini" data-pact="or" title="Add a parallel branch around this">OR branch</button>` : ""}
        <button class="mini danger" data-pact="del" title="Delete">Delete</button>
      </div>
      ${this._xrefHtml([el.tag, el.a, el.b, el.src, el.dst, el.reset, el.load, el.cd, ...(el.name && (TIMER_TYPES.has(el.type) || COUNTER_TYPES.has(el.type)) ? [`#${el.name}.Q`, TIMER_TYPES.has(el.type) ? `#${el.name}.ET` : `#${el.name}.CV`] : [])])}
      <p class="help">Operands: ${esc(OPERAND_HELP)}</p></div>`;
  }
  /* ---------- entity / action picker ---------- */
  _entityIndex() {
    // rebuilt when the entity count changes
    const st = this._hass.states;
    const n = Object.keys(st).length;
    if (this._eidx && this._eidx.n === n && this._eidx.st === st) return this._eidx.list;
    const reg = this._hass.entities || {}, devs = this._hass.devices || {}, areas = this._hass.areas || {};
    const list = Object.keys(st).map((eid) => {
      const s = st[eid], r = reg[eid] || {};
      const dev = r.device_id ? devs[r.device_id] : null;
      const areaId = r.area_id || (dev && dev.area_id);
      const name = s.attributes.friendly_name || eid;
      const area = areaId && areas[areaId] ? areas[areaId].name : "";
      const device = dev ? dev.name_by_user || dev.name || "" : "";
      return { eid, domain: eid.split(".")[0], name, area, device, minor: !!(r.hidden || r.entity_category),
        hay: `${name} ${eid} ${area} ${device}`.toLowerCase() };
    });
    this._eidx = { n, st, list };
    return list;
  }
  _programTags(skipId = null) {
    const tags = new Set(), ents = new Set();
    for (const p of this.programs) for (const r of p.rungs) {
      const scan = (n) => {
        if (n.id === skipId) return;
        for (const k of ["tag", "a", "b", "dst", "src", "reset", "load", "cd", "entity", "pt", "pv", "min", "max"]) {
          const v = typeof n[k] === "string" ? n[k].trim() : "";
          if (v.startsWith("#")) tags.add(v);
          else if (/^[a-z_0-9]+\.[a-z0-9_]+/.test(v)) ents.add(v.replace(/\[.*$/, ""));
        }
        if (n.name && TIMER_TYPES.has(n.type)) { tags.add(`#${n.name}.Q`); tags.add(`#${n.name}.ET`); }
        if (n.name && COUNTER_TYPES.has(n.type)) { tags.add(`#${n.name}.Q`); tags.add(`#${n.name}.CV`); }
      };
      walk(r.logic, (n) => n.t === "el" && scan(n));
      r.outputs.forEach(scan);
    }
    for (const k of Object.keys((this.mon && this.mon.mem) || {})) tags.add("#" + k);
    return { tags: [...tags].sort(), ents };
  }
  _recents() { try { return JSON.parse(localStorage.getItem("ha_ladder_recent") || "[]"); } catch (e) { return []; } }
  _pushRecent(v) {
    try {
      const r = this._recents().filter((x) => x !== v); r.unshift(v);
      localStorage.setItem("ha_ladder_recent", JSON.stringify(r.slice(0, 12)));
    } catch (e) { /* storage unavailable */ }
  }
  _pickOpen(input, all = false) {
    if (this._pick && this._pick.input === input) return;
    this._pickClose();
    const pop = document.createElement("div");
    pop.className = "pickpop";
    pop.addEventListener("pointerdown", (e) => { if (!e.target.closest("input")) e.preventDefault(); }); // keep focus in the input
    pop.addEventListener("click", (e) => this._pickClick(e));
    input.closest(".pickwrap").after(pop);
    this._pick = { input, pop, role: input.dataset.pick, filter: "suggested", hi: 0, items: [], showAll: true };
    this._pickFilter(input, true);
    // highlight the current value if it's in the list
    const cur = input.value.trim(), i = this._pick.items.findIndex((it) => it.v === cur);
    if (i >= 0) { this._pick.hi = i; this._pickRender(); }
  }
  _pickClose() {
    if (!this._pick) return;
    this._pick.pop.remove();
    this._pick = null;
  }
  _pickFilter(input, ignoreQuery = false) {
    const P = this._pick; if (!P || P.input !== input) { this._pickOpen(input); return; }
    const raw = input.value;
    // for comma-separated targets, search the last segment
    const q = (P.role === "target" ? raw.split(",").pop() : raw).trim().toLowerCase();
    const query = ignoreQuery || P.showAll ? "" : q;
    P.showAll = false;
    const items = [];
    const sec = (title) => items.push({ sec: title });
    if (P.role === "service" || P.role === "notify") {
      const sv = this._hass.services || {};
      const all = [];
      for (const d of Object.keys(sv)) for (const s of Object.keys(sv[d])) {
        const id = `${d}.${s}`, meta = sv[d][s] || {};
        const name = meta.name || s.replace(/_/g, " ");
        const hay = `${id} ${name} ${meta.description || ""}`.toLowerCase();
        if (P.role === "notify" && d !== "notify") continue;
        const sc = this._score(hay, id, name, query);
        if (sc >= 0) all.push({ v: id, name, sub: id, desc: meta.description || "", icon: DOMAIN_ICON[d] || "⚙", sc });
      }
      all.sort((a, b) => b.sc - a.sc || a.v.localeCompare(b.v));
      if (all.length) sec(query ? "Actions" : "All actions");
      items.push(...all.slice(0, 80));
    } else {
      const host = input.closest("[data-elid]");
      const { tags, ents: used } = this._programTags(host ? host.dataset.elid : null);
      const pref = ROLE_PREF[P.role] ? new Set(ROLE_PREF[P.role]) : null;
      const writable = P.role === "bool-out" || P.role === "num-out" || P.role === "target";
      // markers / timers / counters
      const mq = query.replace(/^#/, "");
      const mt = tags.filter((t) => !mq || t.toLowerCase().includes(mq)).filter((t) => !(writable && /\.(Q|ET|CV)$/i.test(t) && P.role !== "target"));
      // entities
      const idx = this._entityIndex();
      const recent = this._recents();
      let pool = idx.filter((x) => !(writable && READ_ONLY.has(x.domain)));
      const counts = {};
      pool.forEach((x) => { if (!query || this._score(x.hay, x.eid, x.name, query) >= 0) counts[x.domain] = (counts[x.domain] || 0) + 1; });
      if (P.filter === "suggested" && pref) pool = pool.filter((x) => pref.has(x.domain));
      else if (P.filter !== "suggested" && P.filter !== "all") pool = pool.filter((x) => x.domain === P.filter);
      const scored = [];
      for (const x of pool) {
        let sc = this._score(x.hay, x.eid, x.name, query);
        if (sc < 0) continue;
        const ri = recent.indexOf(x.eid);
        if (ri >= 0) sc += 300 - ri * 10;
        if (used.has(x.eid)) sc += 150;
        if (x.minor) sc -= 200;
        if (!query && ri < 0 && !used.has(x.eid)) sc = -1000 - (x.minor ? 1 : 0); // alphabetical below
        scored.push({ x, sc, recent: ri >= 0, used: used.has(x.eid) });
      }
      scored.sort((a, b) => b.sc - a.sc || (a.x.area || "~").localeCompare(b.x.area || "~") || a.x.name.localeCompare(b.x.name));
      // header chips
      P.chips = [["suggested", pref ? `Suggested · ${ROLE_LABEL[P.role]}` : "All"], ...(pref ? [["all", "All"]] : [])]
        .concat(Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([d, n]) => [d, `${DOMAIN_ICON[d] || ""} ${d} ${n}`]));
      const num = q !== "" && !isNaN(+q);
      if (num) { sec("Use as"); items.push({ v: q, name: `Number ${q}`, sub: "constant", icon: "#" }); }
      else if (q && !/^[a-z_0-9]+\.[a-z0-9_]+(\[.*\])?$/.test(q) && !query.startsWith("#") && !scored.length) {
        sec("Use as");
        {
          items.push({ v: `'${raw.trim()}'`, name: `Text '${raw.trim()}'`, sub: "constant (e.g. compare with a state)", icon: "❝" });
          items.push({ v: "#" + q.replace(/[^a-z0-9_.]+/g, "_"), name: `New marker #${q.replace(/[^a-z0-9_.]+/g, "_")}`, sub: "internal memory bit/value", icon: "M" });
        }
      }
      if (mt.length && (query.startsWith("#") || !query || mt.length < 12)) {
        sec("Markers, timers & counters");
        mt.slice(0, 30).forEach((t) => items.push({ v: t, name: t, sub: this._liveVal(t) ? "= " + this._liveVal(t) : "", icon: /\.(Q|ET)$/i.test(t) ? "⏲" : /\.CV$/i.test(t) ? "#" : "M", mono: true }));
      }
      if (query.startsWith("#") && mq && !tags.includes("#" + mq)) {
        sec("New");
        items.push({ v: "#" + mq.replace(/[^a-z0-9_.]+/gi, "_"), name: `Create marker #${mq.replace(/[^a-z0-9_.]+/gi, "_")}`, sub: "internal memory", icon: "＋" });
      }
      let lastSec = null;
      for (const { x, recent: rc, used: us, sc } of scored.slice(0, 120)) {
        const s = !query ? (rc ? "Recently used" : us ? "In this program" : "Entities") : "Entities";
        if (s !== lastSec) { sec(s); lastSec = s; }
        items.push({ v: x.eid, name: x.name, sub: x.eid, area: x.area || x.device, icon: DOMAIN_ICON[x.domain] || "•", state: this._liveVal(x.eid), eid: x.eid, dim: x.minor });
      }
      if (scored.length > 120) items.push({ more: scored.length - 120 });
    }
    P.items = items;
    P.hi = items.findIndex((i) => i.v !== undefined);
    this._pickRender();
  }
  _score(hay, id, name, q) {
    if (!q) return 0;
    const toks = q.split(/\s+/).filter(Boolean);
    for (const t of toks) if (!hay.includes(t)) return -1;
    let s = 0;
    const nl = name.toLowerCase();
    if (id === q) s += 1000;
    if (id.startsWith(q) || id.split(".")[1]?.startsWith(q)) s += 300;
    if (nl.startsWith(q)) s += 260;
    for (const t of toks) { if (new RegExp("(^|[\\s._-])" + t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).test(hay)) s += 60; }
    return s - Math.min(40, nl.length / 3);
  }
  _pickRender() {
    const P = this._pick; if (!P) return;
    const chips = P.role === "service" || P.role === "notify" ? "" : `<div class="pchips">${(P.chips || []).map(([k, l]) => `<button class="pchip ${P.filter === k ? "on" : ""}" data-pfilter="${esc(k)}">${esc(l)}</button>`).join("")}</div>`;
    const rows = P.items.map((it, i) => {
      if (it.sec) return `<div class="psec">${esc(it.sec)}</div>`;
      if (it.more) return `<div class="pmore">${it.more} more — keep typing to narrow down</div>`;
      return `<div class="popt ${i === P.hi ? "hi" : ""} ${it.dim ? "dim" : ""}" data-pi="${i}">
        <span class="picon">${esc(it.icon || "")}</span>
        <span class="pmain"><span class="pname ${it.mono ? "mono" : ""}">${esc(it.name)}</span><span class="psub">${esc(it.sub || "")}${it.area ? ` · ${esc(it.area)}` : ""}</span>${it.desc ? `<span class="pdesc">${esc(trunc(it.desc, 90))}</span>` : ""}</span>
        ${it.state ? `<span class="pstate">${esc(trunc(it.state, 16))}</span>` : ""}</div>`;
    }).join("");
    P.pop.innerHTML = chips + `<div class="plist">${rows || `<div class="pmore">No matches</div>`}</div>`;
    const hi = P.pop.querySelector(".popt.hi");
    if (hi) hi.scrollIntoView({ block: "nearest" });
  }
  _pickClick(e) {
    const P = this._pick; if (!P) return;
    const f = e.target.closest("[data-pfilter]");
    if (f) { P.filter = f.dataset.pfilter; P.input.focus(); this._pickFilter(P.input); return; }
    const o = e.target.closest("[data-pi]");
    if (o) this._pickChoose(+o.dataset.pi);
    const a = e.target.closest("[data-pattr]");
    if (a) this._pickSet(a.dataset.pattr, true);
  }
  _pickChoose(i) {
    const P = this._pick; const it = P && P.items[i]; if (!it || it.v === undefined) return;
    let v = it.v;
    if (P.role === "target") { const parts = P.input.value.split(","); parts[parts.length - 1] = (parts.length > 1 ? " " : "") + v; v = parts.join(","); }
    this._pickSet(v, !it.eid || P.role === "target" || P.role === "trace");
    if (it.eid) this._pushRecent(it.eid);
    if (it.eid && P.role !== "target" && P.role !== "trace") this._pickAttrs(it.eid);
  }
  _pickSet(v, close) {
    const P = this._pick; if (!P || !P.input.isConnected) { this._pickClose(); return; }
    P.input.value = v;
    P.input.dispatchEvent(new CustomEvent("input", { bubbles: true, detail: { fromPicker: true } }));
    if (close) { this._pickClose(); }
  }
  _pickAttrs(eid) {
    // after picking an entity, offer its attributes (e.g. brightness, temperature)
    const P = this._pick; const st = this._hass.states[eid]; if (!P || !st) return;
    const attrs = Object.entries(st.attributes).filter(([k, v]) => !HIDE_ATTRS.has(k) && (typeof v === "number" || typeof v === "string" || typeof v === "boolean")).slice(0, 14);
    if (!attrs.length) { this._pickClose(); return; }
    P.items = [];
    P.pop.innerHTML = `<div class="psec">Use ${esc(st.attributes.friendly_name || eid)} as…</div>
      <div class="pattrs"><button class="pattr on" data-pattr="${esc(eid)}"><b>state</b><span>${esc(trunc(this._liveVal(eid), 14))}</span></button>
      ${attrs.map(([k, v]) => `<button class="pattr" data-pattr="${esc(eid)}[${esc(k)}]"><b>${esc(k)}</b><span>${esc(trunc(fmtVal(v), 14))}</span></button>`).join("")}</div>
      <div class="pmore">Enter or click elsewhere keeps the state</div>`;
    P.attrMode = true;
  }
  _pickKey(e) {
    const P = this._pick;
    if (!P) { if (e.key === "ArrowDown") { this._pickOpen(e.target, true); e.preventDefault(); } return; }
    if (P.attrMode) { if (e.key === "Enter" || e.key === "Escape" || e.key === "Tab") { this._pickClose(); if (e.key !== "Tab") e.preventDefault(); } else this._pick.attrMode = false; return; }
    const sel = P.items.map((it, i) => (it.v !== undefined ? i : -1)).filter((i) => i >= 0);
    const pos = sel.indexOf(P.hi);
    if (e.key === "ArrowDown") { P.hi = sel[Math.min(sel.length - 1, pos + 1)] ?? P.hi; this._pickRender(); e.preventDefault(); }
    else if (e.key === "ArrowUp") { P.hi = sel[Math.max(0, pos - 1)] ?? P.hi; this._pickRender(); e.preventDefault(); }
    else if (e.key === "Enter") { if (P.hi >= 0) this._pickChoose(P.hi); else this._pickClose(); e.preventDefault(); }
    else if (e.key === "Escape") { this._pickClose(); e.preventDefault(); e.stopPropagation(); }
    else if (e.key === "Tab") this._pickClose();
  }
  _operandChip(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const base = s.replace(/\[.*$/, "");
    const st = this._hass.states[base];
    const attr = (/\[(.+)\]$/.exec(s) || [])[1];
    if (/^[a-z_0-9]+\.[a-z0-9_]+(\[.*\])?$/.test(s)) {
      if (!st) return `<span class="chip warn">⚠ entity not found</span>`;
      const reg = (this._hass.entities || {})[base] || {};
      const dev = reg.device_id && this._hass.devices ? this._hass.devices[reg.device_id] : null;
      const aid = reg.area_id || (dev && dev.area_id);
      const area = aid && this._hass.areas && this._hass.areas[aid] ? this._hass.areas[aid].name : "";
      return `<span class="chip"><span>${DOMAIN_ICON[base.split(".")[0]] || "•"}</span><b>${esc(st.attributes.friendly_name || base)}</b>${attr ? `<i>${esc(attr)}</i>` : ""}${area ? `<span class="muted">${esc(area)}</span>` : ""}<span class="cval">${esc(this._liveVal(s))}</span></span>`;
    }
    if (s.startsWith("#")) { const lv = this._liveVal(s); return `<span class="chip"><span>M</span><b class="mono">${esc(s)}</b><span class="cval">${esc(lv === "—" ? "new" : lv)}</span></span>`; }
    return `<span class="chip"><span>❝</span>constant <b class="mono">${esc(s)}</b></span>`;
  }
  _operandHint(v) {
    const s = String(v ?? "").trim();
    if (!s) return "";
    const L = this._label(s), live = this._liveVal(s);
    if (L.warn) return "⚠ entity not found";
    if (s.startsWith("#")) return live ? `= ${live}` : "internal marker";
    if (/^[a-z_0-9]+\.[a-z0-9_]+/.test(s)) return `${L.main} = ${live}`;
    return "constant";
  }
  _propInput(e) {
    const t = e.target;
    // edits belong to the element the form was built for, even if the selection has moved on
    const host = t.closest("[data-elid]"); if (!host) return;
    const loc = this._locate(host.dataset.elid); if (!loc || loc.node.t !== "el") return;
    const el = loc.node;
    if (t.dataset.day !== undefined) {
      if (e.type !== "change") return;
      const d = +t.dataset.day;
      const days = new Set(el.days || []);
      t.checked ? days.add(d) : days.delete(d);
      el.days = [...days].sort();
    } else if (t.dataset.field) {
      const key = t.dataset.field;
      if (t.type === "checkbox") { if (e.type !== "change") return; el[key] = t.checked; }
      else el[key] = t.value;
      const live = this.shadowRoot.querySelector(`[data-live="${key}"]`);
      if (live) live.innerHTML = this._operandChip(t.value);
      if (t.dataset.pick && e.type === "input" && !e.detail?.fromPicker) this._pickFilter(t);
    } else return;
    this._anGen = (this._anGen || 0) + 1;
    this._commitSnap();
    this._setDirty(true);
    this._renderToolbar();
    this._updateSvgs();
  }
  _propClick(e) {
    const gt = e.target.closest("[data-goto]");
    if (gt) { this._goto(gt.dataset.goto, +gt.dataset.gpi); return; }
    const po = e.target.closest("[data-pickopen]");
    if (po) { const inp = this.shadowRoot.querySelector(`#props [data-field="${po.dataset.pickopen}"]`); if (inp) { if (this._pick && this._pick.input === inp) this._pickClose(); else { inp.focus(); this._pickOpen(inp, true); } } return; }
    const b = e.target.closest("[data-pact]");
    if (b) {
      switch (b.dataset.pact) {
        case "close": this._showChecks = false; this.sel = this.sel ? { rung: this.sel.rung, ids: [] } : null; this._updateSvgs(); this._renderProps(); break;
        case "del": this._delete(); break;
        case "or": this._wrapOr(); break;
        case "left": this._move(-1); break;
        case "right": this._move(1); break;
        case "scan": {
          const v = +this.shadowRoot.getElementById("scanms").value;
          this._hass.callWS({ type: "ha_ladder/settings", scan_ms: v }).then((r) => { this.settings = r.settings; this._toast(`Scan cycle set to ${r.settings.scan_ms} ms`); });
          break;
        }
        case "resetmax": break;
      }
      return;
    }
    const m = e.target.closest("[data-mem]");
    if (m) {
      const name = m.dataset.mem, kind = m.dataset.kind;
      let value;
      if (kind === "bool") value = m.dataset.val !== "1";
      else { const v = prompt(`New value for #${name}`, m.dataset.val); if (v === null) return; value = isNaN(+v) || v.trim() === "" ? v : +v; }
      this._hass.callWS({ type: "ha_ladder/set_memory", name, value }).catch((err) => this._toast(String(err.message || err), true));
    }
  }
  _watch() {
    const mon = this.mon || {};
    const s = mon.stats || {};
    const mem = mon.mem || {};
    const ctr = mon.ctr || {};
    const tmr = mon.tmr || {};
    const memRows = Object.keys(mem).sort().map((k) => {
      const v = mem[k], isB = typeof v === "boolean";
      return `<tr><td class="mono">#${esc(k)}</td><td><button class="val ${isB ? (v ? "b1" : "b0") : ""}" data-mem="${esc(k)}" data-kind="${isB ? "bool" : "val"}" data-val="${isB ? (v ? "1" : "0") : esc(fmtVal(v))}" title="Click to modify">${esc(fmtVal(v))}</button></td></tr>`;
    }).join("");
    const tRows = Object.keys(tmr).filter((k) => !k.startsWith("x")).sort().map((k) => `<tr><td class="mono">#${esc(k)}</td><td>${tmr[k].q ? "Q " : ""}${fmtVal(tmr[k].et)} s</td></tr>`).join("");
    const cRows = Object.keys(ctr).sort().map((k) => `<tr><td class="mono">#${esc(k)}</td><td><button class="val" data-mem="${esc(k)}.CV" data-kind="val" data-val="${fmtVal(ctr[k].cv)}" title="Click to modify">${fmtVal(ctr[k].cv)}</button>${ctr[k].q ? " Q" : ""}</td></tr>`).join("");
    return `
      <div class="phead"><b>PLC</b><span class="pill ${mon.running ? "run" : "stop"}">${mon.running ? "RUN" : "STOP"}</span></div>
      <table class="kv">
        <tr><td>Scan time</td><td>${fmtVal(s.last_ms)} ms <span class="muted">(max ${fmtVal(s.max_ms)})</span></td></tr>
        <tr><td>Scans</td><td>${s.count ?? "—"}</td></tr>
        <tr><td>Errors</td><td>${s.errors ?? 0}</td></tr>
        <tr><td>Cycle</td><td><input id="scanms" type="number" min="50" max="10000" step="50" value="${esc(this.settings.scan_ms)}" class="num"> ms <button class="mini" data-pact="scan">Set</button></td></tr>
      </table>
      ${mon.simulate || (mon.simlog || []).length ? `<div class="wtitle">🧪 Simulated (${mon.simulate ? "test mode on" : "last test"})</div>${(mon.simlog || []).length ? `<table class="kv simlog">${[...mon.simlog].reverse().slice(0, 15).map((x) => `<tr><td class="mono">${esc(new Date(x.t * 1000).toLocaleTimeString([], { hour12: false }))}</td><td>${x.kind === "action" ? "▶ " : ""}<span class="mono">${esc(x.target)}</span> ${x.kind === "output" ? "→ <b>" + esc(fmtVal(x.value)) + "</b>" : `<span class="muted">${esc(trunc(JSON.stringify(x.value), 60))}</span>`}</td></tr>`).join("")}</table>` : `<p class="muted">No simulated outputs or actions yet.</p>`}` : ""}
      <div class="wtitle">Markers</div>
      ${memRows ? `<table class="kv">${memRows}</table>` : `<p class="muted">None yet — write to <span class="mono">#name</span> with a coil.</p>`}
      ${tRows ? `<div class="wtitle">Timers</div><table class="kv">${tRows}</table>` : ""}
      ${cRows ? `<div class="wtitle">Counters</div><table class="kv">${cRows}</table>` : ""}
      <div class="wtitle">How it works</div>
      <ul class="help">
        <li><b>Drag</b> instructions from the palette onto a rung, and drag anything already placed to move it: drop on a wire to insert in series, just below an element to make an OR branch, or onto the palette to delete. Drag ⠿ to reorder rungs. On touch, press and hold to start dragging.</li>
        <li>Or select a rung/element and click an instruction in the palette to insert it after the selection.</li>
        <li><b>OR branch</b> puts a parallel path around the selection. Shift-click to select several side-by-side elements.</li>
        <li>Outputs only call a service when the coil value <i>changes</i>, so the logbook stays quiet. Tick <b>Enforce</b> to re-apply if someone changes it by hand.</li>
        <li>Operands: ${esc(OPERAND_HELP)}</li>
        <li><b>Save</b> downloads the program to the runtime. Keys: Ctrl+S, Ctrl+Z, Delete, Alt+←/→.</li>
      </ul>`;
  }

  _focusFirstField() {
    requestAnimationFrame(() => {
      const f = this.shadowRoot.querySelector("#props [data-field]");
      if (f && !this._narrow) f.focus();
    });
  }

  async _toggleTest() {
    const on = !(this.mon && this.mon.simulate);
    if (!on && !confirm("Leave test mode?\n\nOn the next scan the program's outputs are applied to the real devices.")) return;
    try {
      await this._hass.callWS({ type: "ha_ladder/simulate", enabled: on });
      this._toast(on ? "Test mode on — nothing will be switched" : "Test mode off — outputs are live");
    } catch (e) { this._toast(String(e.message || e), true); }
  }

  /* ---------- cross-reference & checks ---------- */
  _analyze() {
    // cheap cache key: bumped on every edit, plus entity count, forces and a 5 s clock (for unavailable entities)
    const key = `${this._anGen || 0}:${this.pi}:${Object.keys(this._hass.states).length}:${Object.keys((this.mon && this.mon.forces) || {}).join(",")}:${Math.floor(Date.now() / 5000)}`;
    if (this._an && this._an.key === key) return this._an;
    const uses = new Map(); // tag -> [{pi, ri, rung, id, type, acc}]
    const timers = new Map(); // timer/counter name -> [{...}]
    const problems = [];
    const elWarn = new Map();
    const add = (tag, u) => { tag = String(tag ?? "").trim(); if (!tag || !/^(#|[a-z_0-9]+\.[a-z0-9_]+)/.test(tag)) return; if (!uses.has(tag)) uses.set(tag, []); uses.get(tag).push(u); };
    const st = this._hass.states;
    const flag = (level, msg, refs) => {
      problems.push({ level, msg, refs });
      for (const r of refs) if (!elWarn.has(r.id) || level === "error") elWarn.set(r.id, { level, msg });
    };
    this.programs.forEach((p, pi) => p.rungs.forEach((r, ri) => {
      const where = `${this.programs.length > 1 ? p.name + " · " : ""}R${ri + 1}`;
      const scan = (n) => {
        const base = { pi, ri, rung: r.id, id: n.id, type: n.type, where, active: p.enabled && r.enabled };
        for (const k of ["tag", "a", "b", "src", "dst", "reset", "load", "cd", "pt", "pv", "min", "max", "in_min", "in_max", "out_min", "out_max", "entity"]) {
          const v = n[k]; if (typeof v !== "string" || !v.trim()) continue;
          let acc = "R";
          if (k === "tag" && COIL_TYPES.has(n.type)) acc = n.type === "SET" ? "S" : n.type === "RESET" ? "R0" : "W";
          if (k === "dst") acc = "W";
          if (k === "entity") acc = "A";
          for (const part of k === "entity" ? v.split(",") : [v]) add(part, { ...base, acc, field: k });
        }
        if (n.name && (TIMER_TYPES.has(n.type) || COUNTER_TYPES.has(n.type))) {
          const nm = n.name.trim();
          if (!timers.has(nm)) timers.set(nm, []);
          timers.get(nm).push(base);
        }
        const need = CONTACT_TYPES.has(n.type) || COIL_TYPES.has(n.type) ? ["tag"] : ["MOVE", "MATH", "SCALE"].includes(n.type) ? ["dst"] : ["SVC", "NOTIFY"].includes(n.type) ? ["service"] : TIMER_TYPES.has(n.type) || COUNTER_TYPES.has(n.type) ? ["name"] : n.type === "CMP" ? ["a", "b"] : [];
        for (const k of need) if (!String(n[k] ?? "").trim()) flag("warn", `${where} ${n.type}: ${k === "tag" ? "no tag" : k + " is empty"}`, [base]);
        if (n.type === "SVC" && n.data) { try { JSON.parse(n.data); } catch (e) { flag("error", `${where} SERVICE: data is not valid JSON`, [base]); } }
      };
      walk(r.logic, (n) => n.t === "el" && scan(n));
      r.outputs.forEach((o) => scan(o));
      if (!r.outputs.length && r.logic.items.length) problems.push({ level: "info", msg: `${where}: rung has no outputs`, refs: [{ pi, rung: r.id, id: r.id, where }] });
    }));
    for (const [tag, us] of uses) {
      const act = us.filter((u) => u.active);
      const assign = act.filter((u) => u.acc === "W");
      const setres = act.filter((u) => u.acc === "S" || u.acc === "R0");
      if (assign.length > 1) flag("warn", `${tag} is written by ${assign.length} coils/moves (${assign.map((u) => u.where).join(", ")}) — the last one in the scan wins`, assign);
      else if (assign.length && setres.length) flag("warn", `${tag} is both assigned (${assign[0].where}) and set/reset (${setres.map((u) => u.where).join(", ")})`, [...assign, ...setres]);
      if (act.some((u) => u.acc === "S") && !act.some((u) => u.acc === "R0") && !assign.length) problems.push({ level: "info", msg: `${tag} is SET but never RESET (stays latched)`, refs: act.filter((u) => u.acc === "S") });
      const ent = tag.replace(/\[.*$/, "");
      if (!tag.startsWith("#")) {
        if (!st[ent]) flag("error", `${tag}: entity not found`, us);
        else {
          const d = ent.split(".")[0];
          const w = us.filter((u) => u.acc === "W" || u.acc === "S" || u.acc === "R0");
          if (w.length && READ_ONLY.has(d)) flag("error", `${tag} is read-only and can't be written`, w);
          else if (w.length && tag.includes("[")) flag("error", `${tag}: attributes can't be written`, w);
          if (["unavailable", "unknown"].includes(st[ent].state)) flag("warn", `${tag} is ${st[ent].state} right now`, us);
        }
      } else {
        const m = /^#(.*)\.(Q|ET|CV)$/i.exec(tag);
        if (m) {
          if (!timers.has(m[1]) && us.some((u) => u.acc === "R")) flag("warn", `${tag}: no timer or counter named ${m[1]}`, us.filter((u) => u.acc === "R"));
        } else if (!us.some((u) => u.acc !== "R") && !(this.mon && this.mon.forces && tag in this.mon.forces)) {
          problems.push({ level: "info", msg: `${tag} is read but never written by the program`, refs: us });
        }
      }
    }
    for (const [nm, defs] of timers) if (defs.length > 1) flag("error", `Timer/counter name ${nm} is used by ${defs.length} blocks (${defs.map((d) => d.where).join(", ")}) — each needs its own name`, defs);
    const order = { error: 0, warn: 1, info: 2 };
    problems.sort((a, b) => order[a.level] - order[b.level]);
    this._an = { key, uses, timers, problems, elWarn };
    return this._an;
  }
  _xrefHtml(tags) {
    const an = this._analyze();
    const acc = { R: "read", W: "write", S: "set", R0: "reset", A: "target" };
    const seen = new Set();
    const blocks = tags.map((t) => {
      t = String(t ?? "").trim(); if (!t || seen.has(t)) return ""; seen.add(t);
      const us = an.uses.get(t) || [];
      const m = /^#(.*)\.(Q|ET|CV)$/i.exec(t);
      const defs = m ? an.timers.get(m[1]) || [] : [];
      if (!us.length && !defs.length) return "";
      return `<div class="xref"><div class="xtag mono">${esc(t)} <span class="muted">· ${us.length} use${us.length === 1 ? "" : "s"}</span></div>
        ${[...defs.map((d) => ({ ...d, acc: "D" })), ...us].map((u) => `<button class="xrow" data-goto="${esc(u.id)}" data-gpi="${u.pi}"><span class="acc a${u.acc}">${u.acc === "D" ? "def" : acc[u.acc]}</span><span class="mono">${esc(u.where)}</span> ${esc(u.type)}${u.active ? "" : ` <span class="muted">(disabled)</span>`}</button>`).join("")}</div>`;
    }).join("");
    return blocks ? `<div class="wtitle">Cross-reference</div>${blocks}` : "";
  }
  _checksHtml() {
    const an = this._analyze();
    const icon = { error: "⛔", warn: "⚠", info: "ℹ" };
    return `<div class="phead"><b>Checks</b><span class="muted">${an.problems.filter((p) => p.level !== "info").length} to look at</span><button class="mini" data-pact="close">✕</button></div>
      ${an.problems.length ? an.problems.map((p) => `<div class="prob ${p.level}"><span>${icon[p.level]}</span><div>${esc(p.msg)}<div>${p.refs.slice(0, 6).map((r) => `<button class="uchip" data-goto="${esc(r.id)}" data-gpi="${r.pi}">${esc(r.where || "rung")}</button>`).join("")}</div></div></div>`).join("") : `<p class="muted">✓ No problems found.</p>`}
      <p class="help">Checks: double coils, assign + set/reset on the same tag, duplicate timer/counter names, references to missing timers/counters, missing, unavailable or read-only entities, empty operands, invalid JSON.</p>`;
  }
  _goto(id, pi) {
    if (pi !== undefined && !isNaN(pi)) this.pi = pi;
    const loc = this._locate(id);
    const rung = loc ? loc.rung : this.prog.rungs.find((r) => r.id === id);
    if (!rung) return;
    if (this._collapsed.delete(rung.id)) this._saveCollapsed();
    this.sel = { rung: rung.id, ids: loc ? [id] : [] };
    this._showChecks = false;
    if (this.view !== "ladder") this._setView("ladder"); else this._render();
    requestAnimationFrame(() => { const g = this.shadowRoot.querySelector(`[data-id="${id}"]`) || this.shadowRoot.querySelector(`[data-rung="${rung.id}"]`); if (g) g.scrollIntoView({ block: "center", behavior: "smooth" }); });
  }

  _rungSummary(r) {
    const names = (n) => {
      const out = [];
      walk(n, (x) => { if (x.t === "el") out.push(x); });
      return out;
    };
    const conds = names(r.logic);
    const lbl = (el) => {
      const t = el.tag || el.dst || el.name || el.service || el.a || "";
      const L = t ? this._label(t) : { main: el.type };
      return `${el.type}${t ? " " + trunc(L.main, 22) : ""}`;
    };
    const left = conds.length ? conds.slice(0, 4).map(lbl).join(" · ") + (conds.length > 4 ? ` · +${conds.length - 4}` : "") : "always";
    const right = r.outputs.length ? r.outputs.map(lbl).join(", ") : "no outputs";
    return `<span class="muted">${esc(left)}</span> <b>→</b> ${esc(right)}`;
  }
  _toggleCollapse(id) {
    this._collapsed.has(id) ? this._collapsed.delete(id) : this._collapsed.add(id);
    this._saveCollapsed();
    this._renderCanvas();
  }
  _collapseAll(on) {
    for (const r of this.prog.rungs) on ? this._collapsed.add(r.id) : this._collapsed.delete(r.id);
    this._saveCollapsed();
    this._renderCanvas();
  }
  _saveCollapsed() { try { localStorage.setItem("ha_ladder_collapsed", JSON.stringify([...this._collapsed].slice(-500))); } catch (e) { /* ignore */ } }

  /* ---------- views ---------- */
  _setView(v) {
    this.view = v;
    this.setAttribute("view", v);
    this._pickClose();
    const $ = (id) => this.shadowRoot.getElementById(id);
    this.shadowRoot.querySelectorAll("#views [data-view]").forEach((b) => b.classList.toggle("on", b.dataset.view === v));
    $("canvas").hidden = v !== "ladder";
    $("page").hidden = v === "ladder";
    if (v === "tags") this._renderTags();
    else if (v === "trace") this._renderTrace();
    else if (v === "history") this._renderHistory();
    else this._render();
    this._renderToolbar();
  }
  _forced(tag) {
    const k = String(tag ?? "").trim();
    return !!(k && this.mon && this.mon.forces && k in this.mon.forces);
  }
  _pageClick(e) {
    if (this.view === "tags") return this._tagsClick(e);
    if (this.view === "trace") return this._traceClick(e);
    if (this.view === "history") return this._histClick(e);
  }
  _pageInput(e) {
    const t = e.target;
    if (t.dataset.pick && e.type === "input" && !(e.detail && e.detail.fromPicker)) { this._pickFilter(t); return; }
    if (this.view === "history" && t.id === "hnote" && e.type === "change") { this._histNote(t.value); return; }
    if (this.view === "history" && t.id === "hfile" && e.type === "change") { this._histFile(t.files[0]); t.value = ""; return; }
    if (this.view === "tags" && t.id === "tagq") { this.tagQuery = t.value; this._tagsBody(); return; }
    if (this.view === "tags" && t.dataset.pick && e.detail && e.detail.fromPicker) {
      const v = t.value.trim(); t.value = "";
      if (v) { const w = this._watchList(); if (!w.includes(v)) { w.push(v); this._saveWatch(w); } this._tagsBody(); }
      return;
    }
    if (this.view === "trace" && t.dataset.pick && e.detail && e.detail.fromPicker) {
      const v = t.value.trim(); t.value = "";
      if (v) this._traceAdd(v);
    }
  }

  /* ---------- tags / force table ---------- */
  _watchList() { try { return JSON.parse(localStorage.getItem("ha_ladder_watch") || "[]"); } catch (e) { return []; } }
  _saveWatch(w) { try { localStorage.setItem("ha_ladder_watch", JSON.stringify(w)); } catch (e) { /* ignore */ } }
  _collectTags() {
    // tag -> {tag, kind, uses:[{pi, rung, id, label}]}
    const map = new Map();
    const add = (tag, kind, use) => {
      tag = String(tag ?? "").trim();
      if (!tag) return;
      const op = /^#/.test(tag) ? "mem" : /^[a-z_0-9]+\.[a-z0-9_]+(\[.+\])?$/.test(tag) ? "ent" : null;
      if (!op) return;
      let t = map.get(tag);
      if (!t) map.set(tag, (t = { tag, kinds: new Set(), uses: [] }));
      if (kind) t.kinds.add(kind);
      if (use) t.uses.push(use);
    };
    const OUTK = { tag: 1, dst: 1 };
    this.programs.forEach((p, pi) => p.rungs.forEach((r, ri) => {
      const scan = (n) => {
        const use = { pi, rung: r.id, id: n.id, label: `${this.programs.length > 1 ? p.name + " · " : ""}R${ri + 1} ${n.type}` };
        const ulabel = (k) => ({ ...use, label: ((k === "tag" && COIL_TYPES.has(n.type)) || k === "dst" ? "✎ " : "") + use.label });
        for (const k of ["tag", "a", "b", "src", "dst", "reset", "load", "cd", "pt", "pv", "min", "max", "in_min", "in_max", "out_min", "out_max"]) {
          const v = n[k]; if (typeof v !== "string" || !v.trim()) continue;
          const isOut = (k === "tag" && COIL_TYPES.has(n.type)) || k === "dst";
          const tag = v.trim();
          const kind = tag.startsWith("#") ? (/\.(Q|ET)$/i.test(tag) ? "timer" : /\.CV$/i.test(tag) ? "counter" : "marker") : isOut ? "output" : "input";
          add(tag, kind, ulabel(k));
        }
        if (n.name && TIMER_TYPES.has(n.type)) { add(`#${n.name}.Q`, "timer", use); add(`#${n.name}.ET`, "timer", use); }
        if (n.name && COUNTER_TYPES.has(n.type)) { add(`#${n.name}.CV`, "counter", use); add(`#${n.name}.Q`, "counter", use); }
      };
      walk(r.logic, (n) => n.t === "el" && scan(n));
      r.outputs.forEach(scan);
    }));
    const mon = this.mon || {};
    for (const k of Object.keys(mon.mem || {})) add("#" + k, "marker");
    for (const k of Object.keys(mon.forces || {})) add(k, k.startsWith("#") ? "marker" : "input");
    for (const w of this._watchList()) add(w, w.startsWith("#") ? "marker" : "watch");
    return [...map.values()].map((t) => {
      const kinds = t.kinds;
      let kind = kinds.has("timer") ? "timer" : kinds.has("counter") ? "counter" : kinds.has("marker") ? "marker"
        : kinds.has("output") && kinds.has("input") ? "in/out" : kinds.has("output") ? "output" : kinds.has("input") ? "input" : "watch";
      return { ...t, kind };
    }).sort((a, b) => a.tag.localeCompare(b.tag));
  }
  _rawValue(tag) {
    // typed value for a tag: bool / number / string / null
    const mon = this.mon || {};
    if (mon.forces && tag in mon.forces) return mon.forces[tag];
    if (mon.simulate && mon.sim && tag in mon.sim) return mon.sim[tag];
    if (tag.startsWith("#")) {
      const n = tag.slice(1), m = /^(.*)\.(Q|ET|CV)$/i.exec(n);
      if (m) {
        const f = m[2].toUpperCase();
        if (mon.tmr && mon.tmr[m[1]]) return f === "Q" ? mon.tmr[m[1]].q : mon.tmr[m[1]].et;
        if (mon.ctr && mon.ctr[m[1]]) return f === "Q" ? !!mon.ctr[m[1]].q : mon.ctr[m[1]].cv;
      }
      return mon.mem ? mon.mem[n] : undefined;
    }
    const am = /^([a-z_0-9]+\.[a-z0-9_]+)\[(.+)\]$/.exec(tag);
    const st = this._hass.states[am ? am[1] : tag];
    if (!st) return undefined;
    if (am) return st.attributes[am[2]];
    const n = Number(st.state);
    return st.state !== "" && !isNaN(n) ? n : st.state;
  }
  _typeOf(tag, v) {
    if (typeof v === "boolean" || /\.Q$/i.test(tag)) return "BOOL";
    if (typeof v === "number" || /\.(ET|CV)$/i.test(tag)) return "NUM";
    if (typeof v === "string") {
      const d = tag.split(".")[0];
      if (["binary_sensor", "input_boolean", "switch", "light", "fan", "lock", "cover", "person", "device_tracker", "automation", "siren"].includes(d) && !tag.includes("[")) return "BOOL";
      return "TEXT";
    }
    return "—";
  }
  _renderTags() {
    const page = this.shadowRoot.getElementById("page");
    const chips = [["all", "All"], ["marker", "Markers"], ["timer", "Timers"], ["counter", "Counters"], ["input", "Inputs"], ["output", "Outputs"], ["watch", "Watched"], ["forced", "Forced"]];
    page.innerHTML = `
      <div class="pagehead">
        <h2>Tags</h2>
        <input id="tagq" class="search" placeholder="Filter tags…" value="${esc(this.tagQuery)}">
        <div class="chiprow">${chips.map(([k, l]) => `<button class="pchip ${this.tagFilter === k ? "on" : ""}" data-tfilter="${k}">${l}</button>`).join("")}</div>
        <div class="spacer"></div>
        <div class="pickwrap addwatch"><input data-pick="any-in" placeholder="＋ Watch an entity or marker…" autocomplete="off" spellcheck="false"></div>
        <button class="mini danger" data-tact="unforceall" id="unforceall">Release all forces</button>
      </div>
      <p class="muted small">Modify writes a value once. <b>Force</b> holds the tag at a value until released — the program can't change it and forced outputs are driven to it. Forces survive restarts, like a PLC force table.</p>
      <div class="tablewrap"><table class="tags">
        <thead><tr><th></th><th>Tag</th><th>Type</th><th>Kind</th><th class="r">Value</th><th>Modify</th><th>Force</th><th>Used in</th><th></th></tr></thead>
        <tbody id="tagbody"></tbody>
      </table></div>`;
    this._tagsBody();
  }
  _tagsBody() {
    const body = this.shadowRoot.getElementById("tagbody"); if (!body) return;
    const forces = (this.mon && this.mon.forces) || {};
    const q = this.tagQuery.trim().toLowerCase();
    const all = this._collectTags();
    const rows = all.filter((t) => {
      const f = this.tagFilter;
      if (f === "forced" && !(t.tag in forces)) return false;
      if (f === "input" && !["input", "in/out"].includes(t.kind)) return false;
      if (f === "output" && !["output", "in/out"].includes(t.kind)) return false;
      if (!["all", "forced", "input", "output"].includes(f) && t.kind !== f) return false;
      if (q) { const st = this._hass.states[t.tag.replace(/\[.*$/, "")]; const hay = (t.tag + " " + (st ? st.attributes.friendly_name || "" : "")).toLowerCase(); if (!q.split(/\s+/).every((w) => hay.includes(w))) return false; }
      return true;
    });
    const ub = this.shadowRoot.getElementById("unforceall"); if (ub) ub.hidden = !Object.keys(forces).length;
    if (!rows.length) { body.innerHTML = `<tr><td colspan="9" class="muted empty">No tags${this.tagFilter !== "all" || q ? " match" : " yet — tags appear as you use them in rungs"}.</td></tr>`; return; }
    body.innerHTML = rows.map((t) => {
      const v = this._rawValue(t.tag), type = this._typeOf(t.tag, v), forced = t.tag in forces;
      const base = t.tag.replace(/\[.*$/, ""), st = this._hass.states[base];
      const name = t.tag.startsWith("#") ? "" : st ? st.attributes.friendly_name || "" : "⚠ not found";
      const canModify = t.tag.startsWith("#") && !/\.(Q|ET)$/i.test(t.tag) && !(/\.Q$/i.test(t.tag));
      const tracing = this.trace.signals.includes(t.tag);
      const modify = !canModify ? `<span class="muted">—</span>`
        : type === "BOOL" ? `<button class="mini" data-tact="toggle" data-tag="${esc(t.tag)}">Toggle</button>`
        : `<input class="num tagin" data-mval value="" placeholder="${esc(fmtVal(v))}"><button class="mini" data-tact="write" data-tag="${esc(t.tag)}">Write</button>`;
      const force = type === "BOOL"
        ? `<button class="mini ${forced && forces[t.tag] === true ? "fon" : ""}" data-tact="f1" data-tag="${esc(t.tag)}">Force 1</button><button class="mini ${forced && forces[t.tag] === false ? "fon" : ""}" data-tact="f0" data-tag="${esc(t.tag)}">Force 0</button>`
        : `<input class="num tagin" data-fval value="${forced ? esc(fmtVal(forces[t.tag])) : ""}" placeholder="value"><button class="mini ${forced ? "fon" : ""}" data-tact="force" data-tag="${esc(t.tag)}">Force</button>`;
      return `<tr class="${forced ? "forced" : ""}" data-row="${esc(t.tag)}">
        <td>${forced ? `<span class="fmark" title="Forced">F</span>` : ""}</td>
        <td><div class="mono tagname">${esc(t.tag)}</div>${name ? `<div class="muted small">${esc(name)}</div>` : ""}</td>
        <td><span class="type">${type}</span></td>
        <td class="muted">${t.kind}</td>
        <td class="r" data-tval="${esc(t.tag)}">${this._valCell(v, type, forced)}</td>
        <td class="nowrap">${modify}</td>
        <td class="nowrap">${force}${forced ? `<button class="mini" data-tact="release" data-tag="${esc(t.tag)}">Release</button>` : ""}</td>
        <td>${t.uses.slice(0, 4).map((u) => `<button class="uchip" data-tact="goto" data-pi="${u.pi}" data-id="${esc(u.id)}">${esc(u.label)}</button>`).join("")}${t.uses.length > 4 ? `<span class="muted small">+${t.uses.length - 4}</span>` : ""}</td>
        <td class="nowrap"><button class="mini ${tracing ? "fon2" : ""}" data-tact="trace" data-tag="${esc(t.tag)}" title="Add to trace">📈</button>${t.kind === "watch" || this._watchList().includes(t.tag) ? `<button class="mini" data-tact="unwatch" data-tag="${esc(t.tag)}" title="Remove from watch">✕</button>` : ""}</td>
      </tr>`;
    }).join("");
  }
  _valCell(v, type, forced) {
    if (v === undefined) return `<span class="muted">—</span>`;
    if (type === "BOOL") { const b = typeof v === "boolean" ? v : ["on", "true", "home", "open", "playing", "detected", "locked"].includes(String(v).toLowerCase()); return `<span class="bpill ${b ? "b1" : ""} ${forced ? "bf" : ""}">${typeof v === "boolean" ? (v ? "1" : "0") : esc(String(v))}</span>`; }
    const st = typeof v === "number" ? fmtVal(v) : String(v);
    return `<span class="mono ${forced ? "ftext" : ""}">${esc(st)}</span>`;
  }
  _tagsUpdate() {
    const forces = (this.mon && this.mon.forces) || {};
    const body = this.shadowRoot.getElementById("tagbody"); if (!body) return;
    const sig = Object.keys(forces).sort().join("|") + "#" + this._collectTags().length;
    const focused = this.shadowRoot.activeElement;
    if (sig !== this._tagSig && !(focused && body.contains(focused))) { this._tagSig = sig; this._tagsBody(); return; }
    this._tagSig = sig;
    body.querySelectorAll("[data-tval]").forEach((td) => {
      const tag = td.dataset.tval, v = this._rawValue(tag);
      td.innerHTML = this._valCell(v, this._typeOf(tag, v), tag in forces);
    });
    this._renderToolbar();
  }
  _parseVal(s) {
    s = String(s).trim();
    if (/^(true|on)$/i.test(s)) return true;
    if (/^(false|off)$/i.test(s)) return false;
    if (s !== "" && !isNaN(+s)) return +s;
    return s.replace(/^'(.*)'$/, "$1");
  }
  async _tagsClick(e) {
    const f = e.target.closest("[data-tfilter]");
    if (f) { this.tagFilter = f.dataset.tfilter; this._renderTags(); return; }
    const b = e.target.closest("[data-tact]"); if (!b) return;
    const tag = b.dataset.tag, row = b.closest("tr");
    const ws = (msg) => this._hass.callWS(msg).catch((err) => this._toast(String(err.message || err), true));
    switch (b.dataset.tact) {
      case "toggle": { const v = this._rawValue(tag); await ws({ type: "ha_ladder/set_memory", name: tag, value: !v }); break; }
      case "write": { const inp = row.querySelector("[data-mval]"); if (inp.value.trim() === "") return; await ws({ type: "ha_ladder/set_memory", name: tag, value: this._parseVal(inp.value) }); inp.value = ""; break; }
      case "f1": await ws({ type: "ha_ladder/force", name: tag, value: true }); break;
      case "f0": await ws({ type: "ha_ladder/force", name: tag, value: false }); break;
      case "force": { const inp = row.querySelector("[data-fval]"); if (inp.value.trim() === "") { inp.focus(); return; } await ws({ type: "ha_ladder/force", name: tag, value: this._parseVal(inp.value) }); break; }
      case "release": await ws({ type: "ha_ladder/unforce", name: tag }); break;
      case "unforceall": if (confirm("Release all forced tags?")) await ws({ type: "ha_ladder/unforce" }); break;
      case "trace": this._traceAdd(tag, true); return;
      case "unwatch": this._saveWatch(this._watchList().filter((x) => x !== tag)); this._tagsBody(); return;
      case "goto": {
        this.pi = +b.dataset.pi; const loc = this._locate(b.dataset.id);
        this.sel = loc ? { rung: loc.rung.id, ids: [b.dataset.id] } : null;
        this._setView("ladder");
        const g = this.shadowRoot.querySelector(`[data-id="${b.dataset.id}"]`); if (g) g.scrollIntoView({ block: "center" });
        return;
      }
    }
    this._tagSig = null;
  }

  /* ---------- history & backups ---------- */
  async _renderHistory() {
    const page = this.shadowRoot.getElementById("page");
    page.innerHTML = `<div class="pagehead"><h2>History</h2><span class="muted small">Every Save is kept as a version — the newest 50, plus any you pin ★ (kept forever).</span></div>
      <div class="histwrap"><div class="hlist" id="hlist"><div class="muted pad">Loading…</div></div><div class="hdetail" id="hdetail"></div></div>
      <div class="pagehead backups"><h3>File backups</h3><span class="muted small" id="bfolder"></span><div class="spacer"></div>
        <button class="mini" data-hact="backupnow">Back up now</button>
        <button class="mini" data-hact="downloadall">Download full backup</button>
        <label class="mini filebtn">Restore from file…<input type="file" id="hfile" accept=".json,application/json" hidden></label></div>
      <div class="tablewrap"><table class="tags"><thead><tr><th>File</th><th>Created</th><th class="r">Size</th><th></th></tr></thead><tbody id="blist"><tr><td colspan="4" class="muted empty">Loading…</td></tr></tbody></table></div>
      <p class="muted small">Backups are JSON files in your config folder (included in Home Assistant backups). Automate them with the <span class="mono">ha_ladder.backup</span> action, e.g. nightly with <span class="mono">keep: 30</span>.</p>`;
    await this._histLoad();
    this._backupsLoad();
  }
  async _histLoad() {
    try {
      const r = await this._hass.callWS({ type: "ha_ladder/history/list" });
      this._hist = r.versions;
    } catch (e) { this._toast("History: " + (e.message || e), true); this._hist = []; }
    if (!this._histSel || (this._histSel !== "file" && !this._hist.some((v) => v.id === this._histSel))) this._histSel = this._hist[1] ? this._hist[1].id : this._hist[0] && this._hist[0].id;
    this._histList();
    this._histDetail();
  }
  _fmtWhen(ts) {
    const d = new Date(ts * 1000), now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const y = new Date(now); y.setDate(now.getDate() - 1);
    const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
    const day = sameDay ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { day: "numeric", month: "short", year: d.getFullYear() === now.getFullYear() ? undefined : "numeric" });
    const ago = (Date.now() / 1000 - ts);
    const rel = ago < 60 ? "just now" : ago < 3600 ? `${Math.floor(ago / 60)} min ago` : ago < 86400 ? `${Math.floor(ago / 3600)} h ago` : `${Math.floor(ago / 86400)} d ago`;
    return { label: `${day} ${t}`, rel };
  }
  _histList() {
    const el = this.shadowRoot.getElementById("hlist"); if (!el) return;
    const vs = this._hist || [];
    const src = { initial: "first", save: "", restore: "restore", import: "import" };
    el.innerHTML = vs.map((v, i) => {
      const w = this._fmtWhen(v.ts);
      return `<div class="hrow ${this._histSel === v.id ? "on" : ""}" data-hv="${v.id}">
        <button class="star ${v.pinned ? "on" : ""}" data-hpin="${v.id}" title="${v.pinned ? "Pinned — kept forever" : "Pin to keep forever"}">${v.pinned ? "★" : "☆"}</button>
        <div class="hmain"><div><b>${esc(w.label)}</b> <span class="muted small">${esc(w.rel)}</span>${i === 0 ? ` <span class="badge run">running</span>` : ""}${src[v.source] ? ` <span class="badge">${src[v.source]}</span>` : ""}</div>
        <div class="muted small">${v.note ? `<span class="hnote">${esc(v.note)}</span> · ` : ""}${v.summary.programs} program${v.summary.programs === 1 ? "" : "s"} · ${v.summary.rungs} rungs</div></div></div>`;
    }).join("") || `<div class="muted pad">No versions yet.</div>`;
  }
  async _histGet(id) {
    this._histCache = this._histCache || {};
    if (this._histCache[id]) return this._histCache[id];
    const v = await this._hass.callWS({ type: "ha_ladder/history/get", version: id });
    this._histCache[id] = v;
    return v;
  }
  async _histDetail() {
    const el = this.shadowRoot.getElementById("hdetail"); if (!el) return;
    const vs = this._hist || [];
    if (!this._histSel || !vs.length) { el.innerHTML = ""; return; }
    let v, isFile = this._histSel === "file";
    try {
      v = isFile ? this._histFileData : await this._histGet(this._histSel);
      var running = await this._histGet(vs[0].id);
    } catch (e) { el.innerHTML = `<div class="errbox">${esc(e.message || e)}</div>`; return; }
    if (!v) { el.innerHTML = ""; return; }
    const isRunning = !isFile && v.id === vs[0].id;
    const w = isFile ? null : this._fmtWhen(v.ts);
    const diff = this._diff(running.programs, v.programs);
    const nchg = diff.reduce((a, p) => a + (p.status !== "same" ? 1 : 0) + p.changes.length, 0);
    el.innerHTML = `
      <div class="hhead">
        <div><h3>${isFile ? `📄 ${esc(v.fileName || "Backup file")}` : esc(w.label)}${isRunning ? ` <span class="badge run">running</span>` : ""}</h3>
          <div class="muted small">${isFile ? `Backup created ${esc(v.created || "?")}${v.version ? " · Ladder Logic " + esc(v.version) : ""}` : esc(w.rel)} · ${v.programs.length} program${v.programs.length === 1 ? "" : "s"} · ${v.programs.reduce((a, p) => a + p.rungs.length, 0)} rungs</div></div>
        ${isFile ? "" : `<input id="hnote" class="search" placeholder="Add a note…" value="${esc(v.note || "")}" maxlength="200">`}
      </div>
      <div class="acts">
        ${isRunning ? "" : `<button class="mini primary" data-hact="restore">⟲ Restore this version</button>`}
        <button class="mini" data-hact="load" title="Open it in the editor without saving, to look around or pick bits">Open in editor</button>
        <button class="mini" data-hact="download">Download JSON</button>
        ${isFile ? "" : `<button class="mini" data-hact="pin">${v.pinned ? "★ Unpin" : "☆ Pin"}</button>`}
        ${isFile || isRunning ? "" : `<button class="mini danger" data-hact="delete">Delete</button>`}
      </div>
      <div class="wtitle">${isRunning ? "This is the running version" : `Restoring would change ${nchg ? nchg + " thing" + (nchg === 1 ? "" : "s") : "nothing"} compared with the running version`}</div>
      ${isRunning ? (this.dirty ? `<p class="muted">The editor has unsaved changes that aren't in any version yet.</p>` : `<p class="muted">Pick an older version on the left to see what changed.</p>`) : this._diffHtml(diff)}`;
  }
  _diff(cur, old) {
    // what restoring `old` would do to `cur`, per program and rung
    const out = [];
    const cm = new Map(cur.map((p) => [p.id, p])), om = new Map(old.map((p) => [p.id, p]));
    const els = (r) => { const m = new Map(); walk(r.logic, (n) => n.t === "el" && m.set(n.id, n)); (r.outputs || []).forEach((o) => m.set(o.id, o)); return m; };
    const shape = (n) => !n ? "" : n.t === "el" ? n.id : n.t === "series" ? "S(" + n.items.map(shape).join(",") + ")" : "P(" + n.branches.map(shape).join("|") + ")";
    const strip = (o) => { const c = { ...o }; delete c.id; delete c.t; return JSON.stringify(c); };
    for (const p of old) {
      const c = cm.get(p.id);
      if (!c) { out.push({ name: p.name, status: "added", changes: p.rungs.map((r, i) => ({ kind: "added", idx: i, rung: r })) }); continue; }
      const entry = { name: p.name, status: "same", changes: [], meta: [] };
      if (c.name !== p.name) entry.meta.push(`renamed from “${c.name}”`);
      if (!!c.enabled !== !!p.enabled) entry.meta.push(p.enabled ? "would be enabled" : "would be disabled");
      const crm = new Map(c.rungs.map((r, i) => [r.id, { r, i }]));
      const orm = new Map(p.rungs.map((r, i) => [r.id, { r, i }]));
      p.rungs.forEach((r, i) => {
        const cr = crm.get(r.id);
        if (!cr) { entry.changes.push({ kind: "added", idx: i, rung: r }); return; }
        const details = [];
        if ((cr.r.comment || "") !== (r.comment || "")) details.push(`comment: “${cr.r.comment || ""}” → “${r.comment || ""}”`);
        if (!!cr.r.enabled !== !!r.enabled) details.push(r.enabled ? "rung enabled" : "rung disabled");
        const ce = els(cr.r), oe = els(r);
        for (const [id, e] of oe) {
          const x = ce.get(id);
          if (!x) details.push(`+ ${this._elLabel(e)}`);
          else if (strip(x) !== strip(e)) {
            const keys = new Set([...Object.keys(x), ...Object.keys(e)]);
            const ch = [...keys].filter((k) => k !== "id" && k !== "t" && JSON.stringify(x[k]) !== JSON.stringify(e[k])).map((k) => `${k}: ${fmtDiffVal(x[k])} → ${fmtDiffVal(e[k])}`);
            details.push(`${this._elLabel(e)}: ${ch.join(", ")}`);
          }
        }
        for (const [id, e] of ce) if (!oe.has(id)) details.push(`− ${this._elLabel(e)}`);
        if (!details.some((d) => /^[+−]/.test(d)) && shape(cr.r.logic) !== shape(r.logic)) details.push("wiring changed");
        if (details.length) entry.changes.push({ kind: "changed", idx: i, rung: r, details });
        else if (cr.i !== i) entry.changes.push({ kind: "moved", idx: i, rung: r, from: cr.i });
      });
      c.rungs.forEach((r, i) => { if (!orm.has(r.id)) entry.changes.push({ kind: "removed", idx: i, rung: r }); });
      if (entry.changes.length || entry.meta.length) entry.status = "changed";
      out.push(entry);
    }
    for (const c of cur) if (!om.has(c.id)) out.push({ name: c.name, status: "removed", changes: [] });
    return out;
  }
  _elLabel(e) {
    const t = e.tag || e.dst || e.name || e.service || e.a || "";
    return `${e.type}${t ? " " + trunc(t, 40) : ""}`;
  }
  _diffHtml(diff) {
    const changed = diff.filter((p) => p.status !== "same");
    if (!changed.length) return `<p class="muted">✓ Identical to the running version.</p>`;
    const kindTxt = { added: "would be added", removed: "would be removed", changed: "would change", moved: "would move" };
    return changed.map((p) => `<div class="dprog ${p.status}"><div class="dpname">${p.status === "added" ? "＋ " : p.status === "removed" ? "− " : ""}<b>${esc(p.name)}</b>
        <span class="muted small">${p.status === "added" ? "program would be added" : p.status === "removed" ? "program would be removed" : (p.meta || []).join(" · ")}</span></div>
      ${p.changes.map((c) => `<div class="drung ${c.kind}"><span class="dk ${c.kind}">${c.kind}</span><div><b>Rung ${c.idx + 1}${c.kind === "removed" ? " (current)" : ""}</b>${c.rung.comment ? ` — ${esc(c.rung.comment)}` : ""}${c.kind === "moved" ? ` <span class="muted">(now rung ${c.from + 1})</span>` : ""}
        <div class="muted small">${this._rungSummary(c.rung)}</div>
        ${c.details ? `<ul class="dlist">${c.details.map((d) => `<li class="${d.startsWith("+") ? "plus" : d.startsWith("−") ? "minus" : ""}">${esc(d)}</li>`).join("")}</ul>` : ""}</div></div>`).join("")}</div>`).join("");
  }
  async _histClick(e) {
    const t = e.target;
    const pin = t.closest("[data-hpin]");
    if (pin) { const v = this._hist.find((x) => x.id === pin.dataset.hpin); await this._hass.callWS({ type: "ha_ladder/history/update", version: v.id, pinned: !v.pinned }); this._histCache = null; await this._histLoad(); return; }
    const row = t.closest("[data-hv]");
    if (row) { this._histSel = row.dataset.hv; this._histList(); this._histDetail(); return; }
    const bf = t.closest("[data-bfile]");
    const act = t.closest("[data-hact]"); if (!act && !bf) return;
    const a = bf ? bf.dataset.bact : act.dataset.hact;
    const isFile = this._histSel === "file";
    const getSel = async () => (isFile ? this._histFileData : await this._histGet(this._histSel));
    try {
      if (a === "restore") {
        const v = await getSel();
        const when = isFile ? `backup ${v.fileName || ""}` : this._fmtWhen(v.ts).label;
        if (!confirm(`Restore the version from ${when}?\n\nIt replaces the running programs right away (the current version stays in History, so you can go back).${this.dirty ? "\n\nYour unsaved editor changes will be discarded." : ""}`)) return;
        await this._hass.callWS({ type: "ha_ladder/save", programs: v.programs, note: `Restored from ${when}`, source: "restore" });
        this.programs = clone(v.programs); this.pi = 0; this.sel = null; this.undo = []; this.redo = []; this._setDirty(false); this._anGen = (this._anGen || 0) + 1;
        this._histCache = null; this._histSel = null; this._histFileData = null;
        this._toast("Restored — the runtime is using it now");
        await this._histLoad();
      } else if (a === "load") {
        const v = await getSel();
        if (this.dirty && !confirm("Replace the editor contents? Your unsaved changes can be undone with Ctrl+Z.")) return;
        this.undo.push(JSON.stringify({ programs: this.programs, pi: this.pi }));
        this.programs = clone(v.programs); this.pi = 0; this.sel = null; this._setDirty(true); this._anGen = (this._anGen || 0) + 1;
        this._setView("ladder");
        this._toast("Opened in the editor (not running) — Save to run it, Ctrl+Z to go back");
      } else if (a === "download") {
        const v = await getSel();
        this._downloadJson({ type: "ha_ladder_backup", version: VERSION, created: new Date((v.ts || Date.now() / 1000) * 1000).toISOString(), note: v.note || "", programs: v.programs }, `ladder-version-${new Date((v.ts || Date.now() / 1000) * 1000).toISOString().slice(0, 16).replace(/[:T]/g, "")}.json`);
      } else if (a === "pin") {
        const v = this._hist.find((x) => x.id === this._histSel);
        await this._hass.callWS({ type: "ha_ladder/history/update", version: v.id, pinned: !v.pinned }); this._histCache = null; await this._histLoad();
      } else if (a === "delete") {
        if (!confirm("Delete this version from History?")) return;
        await this._hass.callWS({ type: "ha_ladder/history/delete", version: this._histSel }); this._histCache = null; this._histSel = null; await this._histLoad();
      } else if (a === "backupnow") {
        const r = await this._hass.callWS({ type: "ha_ladder/backup/create" });
        this._toast(`Backed up to ${r.name}`); this._backupsLoad();
      } else if (a === "downloadall") {
        const v = await this._histGet(this._hist[0].id);
        this._downloadJson({ type: "ha_ladder_backup", version: VERSION, created: new Date().toISOString(), programs: v.programs, settings: this.settings }, `ladder-backup-${new Date().toISOString().slice(0, 10)}.json`);
      } else if (a === "bdownload" || a === "brestore") {
        const doc = await this._hass.callWS({ type: "ha_ladder/backup/get", name: bf.dataset.bfile });
        if (a === "bdownload") this._downloadJson(doc, bf.dataset.bfile);
        else this._histShowFile({ ...doc, fileName: bf.dataset.bfile });
      }
    } catch (err) { this._toast(String(err.message || err), true); }
  }
  async _histNote(note) {
    if (!this._histSel || this._histSel === "file") return;
    await this._hass.callWS({ type: "ha_ladder/history/update", version: this._histSel, note });
    this._histCache = null;
    const v = this._hist.find((x) => x.id === this._histSel); if (v) v.note = note;
    this._histList();
    this._toast("Note saved");
  }
  async _histFile(file) {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      const programs = Array.isArray(data) ? data : data.programs;
      if (!Array.isArray(programs) || programs.some((p) => !p || !Array.isArray(p.rungs))) throw new Error("this file doesn't contain ladder programs");
      this._histShowFile({ ...(Array.isArray(data) ? {} : data), programs, fileName: file.name });
    } catch (e) { this._toast("Can't read backup: " + e.message, true); }
  }
  _histShowFile(doc) {
    this._histFileData = doc;
    this._histSel = "file";
    this._histList();
    this._histDetail();
    this.shadowRoot.getElementById("hdetail").scrollIntoView({ block: "start", behavior: "smooth" });
  }
  async _backupsLoad() {
    const body = this.shadowRoot.getElementById("blist"); if (!body) return;
    try {
      const r = await this._hass.callWS({ type: "ha_ladder/backup/list" });
      const f = this.shadowRoot.getElementById("bfolder"); if (f) f.textContent = r.folder;
      body.innerHTML = r.backups.length ? r.backups.map((b) => `<tr><td class="mono">${esc(b.name)}</td><td>${esc(this._fmtWhen(b.mtime).label)}</td><td class="r">${(b.size / 1024).toFixed(1)} KB</td>
        <td class="nowrap"><button class="mini" data-bfile="${esc(b.name)}" data-bact="brestore">Preview / restore</button><button class="mini" data-bfile="${esc(b.name)}" data-bact="bdownload">Download</button></td></tr>`).join("")
        : `<tr><td colspan="4" class="muted empty">No backup files yet — “Back up now” writes one.</td></tr>`;
    } catch (e) { body.innerHTML = `<tr><td colspan="4" class="errbox">${esc(e.message || e)}</td></tr>`; }
  }
  _downloadJson(obj, name) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(obj, null, 2)], { type: "application/json" }));
    a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- trace ---------- */
  async _traceLoad() {
    try {
      const r = await this._hass.callWS({ type: "ha_ladder/trace/get" });
      this.trace.signals = r.signals || [];
      this.trace.data = {};
      for (const [k, v] of Object.entries(r.data || {})) this.trace.data[k] = v;
      this._clockSkew = Date.now() / 1000 - (r.now || Date.now() / 1000);
    } catch (e) { this._toast("Trace: " + (e.message || e), true); }
    await Promise.all(this.trace.signals.map((s) => this._traceHistory(s)));
  }
  async _traceHistory(sig) {
    // prefill entity signals from HA's recorder (last 24 h)
    if (sig.startsWith("#") || sig.includes("[") || this.trace.hist[sig]) return;
    try {
      const end = new Date(), start = new Date(end - 24 * 3600 * 1000);
      const r = await this._hass.callWS({ type: "history/history_during_period", start_time: start.toISOString(), end_time: end.toISOString(), entity_ids: [sig], minimal_response: true, no_attributes: true, significant_changes_only: false });
      const pts = (r[sig] || []).map((h) => [h.lu ?? (h.last_updated ? Date.parse(h.last_updated) / 1000 : 0), this._histVal(h.s ?? h.state)]);
      this.trace.hist[sig] = pts;
      this._traceDraw();
    } catch (e) { this.trace.hist[sig] = []; }
  }
  _histVal(s) {
    if (s === "unavailable" || s === "unknown" || s == null) return null;
    const n = Number(s);
    return s !== "" && !isNaN(n) ? n : s;
  }
  async _traceAdd(sig, toast = false) {
    if (this.trace.signals.includes(sig)) { if (toast) this._toast(`${sig} is already in the trace`); return; }
    if (this.trace.signals.length >= 16) { this._toast("A trace can hold up to 16 signals", true); return; }
    const signals = [...this.trace.signals, sig];
    try {
      const r = await this._hass.callWS({ type: "ha_ladder/trace/set", signals });
      this.trace.signals = r.signals;
      if (!this.trace.data[sig]) this.trace.data[sig] = [];
      if (toast) this._toast(`Tracing ${sig}`);
    } catch (e) { this._toast("Trace: " + (e.message || e), true); return; }
    if (this.view === "trace") this._renderTrace(false);
    else if (this.view === "tags") this._tagsBody();
    this._traceHistory(sig);
  }
  async _traceRemove(sig) {
    const signals = this.trace.signals.filter((s) => s !== sig);
    const r = await this._hass.callWS({ type: "ha_ladder/trace/set", signals });
    this.trace.signals = r.signals;
    delete this.trace.data[sig]; delete this.trace.hist[sig];
    this._renderTrace(false);
  }
  _series(sig) {
    // merged history + live points, sorted by time
    const live = this.trace.data[sig] || [], hist = this.trace.hist[sig] || [];
    if (!hist.length) return live;
    const first = live.length ? live[0][0] : Infinity;
    return hist.filter((p) => p[0] < first).concat(live);
  }
  _renderTrace(load = true) {
    const page = this.shadowRoot.getElementById("page");
    const presets = [["10s", 10], ["1m", 60], ["5m", 300], ["15m", 900], ["1h", 3600], ["6h", 21600], ["24h", 86400]];
    page.innerHTML = `
      <div class="pagehead">
        <h2>Trace</h2>
        <div class="chiprow">${presets.map(([l, sp]) => `<button class="pchip ${Math.abs(this.tview.span - sp) < 0.5 ? "on" : ""}" data-span="${sp}">${l}</button>`).join("")}</div>
        <button class="mini" data-zoom="0.5" title="Zoom in">＋</button><button class="mini" data-zoom="2" title="Zoom out">－</button>
        <button class="mini ${this.tview.live ? "fon2" : ""}" data-live="1" title="Follow the current time">● Live</button>
        <button class="mini" data-csv="1" title="Download the visible data as CSV">CSV</button>
        <span class="muted small hidenarrow">Wheel/pinch to zoom · drag to pan · double-click for live</span>
        <div class="spacer"></div>
        <div class="pickwrap addwatch"><input data-pick="trace" placeholder="＋ Add signal: entity or #tag…" autocomplete="off" spellcheck="false"></div>
      </div>
      <div class="tracewrap">
        <div class="legend" id="legend"></div>
        <div class="chartbox" id="chartbox"><canvas id="chart"></canvas></div>
      </div>`;
    this._traceLegend();
    this._traceBindChart();
    this._traceDraw();
    if (load) this._traceLoad().then(() => { this._traceLegend(); this._traceDraw(); });
  }
  _colors() {
    return ["#2fb5ff", "#ff8a3d", "#2fd36b", "#e05bff", "#ffd23d", "#ff5f7e", "#5ef2e0", "#a78bfa", "#f472b6", "#84cc16", "#fb923c", "#38bdf8", "#facc15", "#34d399", "#c084fc", "#f87171"];
  }
  _traceLegend() {
    const lg = this.shadowRoot.getElementById("legend"); if (!lg) return;
    const C = this._colors();
    if (!this.trace.signals.length) { lg.innerHTML = `<div class="muted small pad">No signals yet. Add entities or #tags above, or use 📈 on the Tags page.</div>`; return; }
    lg.innerHTML = this.trace.signals.map((s, i) => {
      const st = this._hass.states[s.replace(/\[.*$/, "")];
      const name = s.startsWith("#") ? s : st ? st.attributes.friendly_name || s : s;
      return `<div class="lrow ${this.trace.hidden[s] ? "off" : ""}" data-sig="${esc(s)}">
        <button class="sw" data-vis="${esc(s)}" style="background:${C[i % C.length]}" title="Show/hide"></button>
        <div class="lname"><div>${esc(name)}</div><div class="muted mono small">${esc(s)}</div></div>
        <div class="lval mono" data-lval="${esc(s)}"></div>
        <button class="mini x" data-rm="${esc(s)}" title="Remove">✕</button></div>`;
    }).join("");
    this._traceLegendUpdate();
  }
  _traceLegendUpdate() {
    for (const el of this.shadowRoot.querySelectorAll("[data-lval]")) {
      const s = el.dataset.lval;
      const v = this._cursorT != null ? this._valueAt(this._series(s), this._cursorT) : this._rawValue(s);
      el.textContent = fmtVal(v === undefined ? null : v);
      el.classList.toggle("atcursor", this._cursorT != null);
    }
  }
  _valueAt(pts, t) {
    let lo = 0, hi = pts.length - 1, ans = -1;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (pts[m][0] <= t) { ans = m; lo = m + 1; } else hi = m - 1; }
    return ans >= 0 ? pts[ans][1] : undefined;
  }
  _traceClick(e) {
    const t = e.target;
    const sp = t.closest("[data-span]");
    if (sp) { this.tview.span = +sp.dataset.span; if (this.tview.live) this.tview.end = this._nowS(); this._renderTraceHead(); this._traceDraw(); return; }
    const z = t.closest("[data-zoom]");
    if (z) { this._zoomAt(+z.dataset.zoom, null); return; }
    if (t.closest("[data-live]")) { this.tview.live = !this.tview.live; if (this.tview.live) this.tview.end = this._nowS(); this._renderTraceHead(); this._traceDraw(); return; }
    if (t.closest("[data-csv]")) { this._traceCsv(); return; }
    const rm = t.closest("[data-rm]"); if (rm) { this._traceRemove(rm.dataset.rm); return; }
    const vis = t.closest("[data-vis]"); if (vis) { const s = vis.dataset.vis; this.trace.hidden[s] = !this.trace.hidden[s]; this._traceLegend(); this._traceDraw(); }
  }
  _renderTraceHead() {
    const page = this.shadowRoot.getElementById("page");
    page.querySelectorAll("[data-span]").forEach((b) => b.classList.toggle("on", Math.abs(this.tview.span - +b.dataset.span) < 0.5));
    const l = page.querySelector("[data-live]"); if (l) l.classList.toggle("fon2", this.tview.live);
  }
  _nowS() { return Date.now() / 1000 - (this._clockSkew || 0); }
  _zoomAt(f, tAnchor) {
    const v = this.tview;
    const span = Math.min(7 * 86400, Math.max(1, v.span * f));
    if (v.live || tAnchor == null) { const a = tAnchor == null ? v.end : tAnchor; const start = v.end - v.span; const ns = a - (a - start) * (span / v.span); v.end = v.live ? v.end : ns + span; }
    else { const start = v.end - v.span; const ns = tAnchor - (tAnchor - start) * (span / v.span); v.end = ns + span; }
    v.span = span;
    this._renderTraceHead();
    this._traceDraw();
  }
  _traceBindChart() {
    const cv = this.shadowRoot.getElementById("chart"); if (!cv) return;
    const pts = new Map();
    let pan = null, pinch = null;
    const tAt = (clientX) => { const r = cv.getBoundingClientRect(); const L = this._chartL || 60; const w = r.width - L - 12; const v = this.tview; return v.end - v.span + ((clientX - r.left - L) / w) * v.span; };
    cv.addEventListener("wheel", (e) => { e.preventDefault(); const f = e.deltaY > 0 ? 1.25 : 0.8; this._zoomAt(f, tAt(e.clientX)); }, { passive: false });
    cv.addEventListener("pointerdown", (e) => {
      cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, e.clientX);
      if (pts.size === 1) pan = { x: e.clientX, end: this.tview.end };
      if (pts.size === 2) { const xs = [...pts.values()]; pinch = { d: Math.abs(xs[0] - xs[1]), span: this.tview.span, mid: tAt((xs[0] + xs[1]) / 2) }; pan = null; }
    });
    cv.addEventListener("pointermove", (e) => {
      if (pts.has(e.pointerId)) pts.set(e.pointerId, e.clientX);
      if (pinch && pts.size === 2) {
        const xs = [...pts.values()], d = Math.max(10, Math.abs(xs[0] - xs[1]));
        const f = pinch.d / d; this.tview.live = false;
        const span = Math.min(7 * 86400, Math.max(1, pinch.span * f));
        const r = cv.getBoundingClientRect(), L = this._chartL || 60, w = r.width - L - 12, frac = (((xs[0] + xs[1]) / 2) - r.left - L) / w;
        this.tview.span = span; this.tview.end = pinch.mid + (1 - frac) * span;
        this._renderTraceHead(); this._traceDraw(); return;
      }
      if (pan && pts.size === 1) {
        const r = cv.getBoundingClientRect(), w = r.width - (this._chartL || 60) - 12;
        const dt = ((e.clientX - pan.x) / w) * this.tview.span;
        if (Math.abs(e.clientX - pan.x) > 3) { this.tview.live = false; this.tview.end = pan.end - dt; this._renderTraceHead(); }
      }
      this._cursorT = e.pointerType === "mouse" || pts.size ? tAt(e.clientX) : null;
      this._traceLegendUpdate();
      this._traceDraw();
    });
    const up = (e) => { pts.delete(e.pointerId); if (pts.size < 2) pinch = null; if (!pts.size) pan = null; };
    cv.addEventListener("pointerup", up);
    cv.addEventListener("pointercancel", up);
    cv.addEventListener("pointerleave", () => { if (!pts.size) { this._cursorT = null; this._traceLegendUpdate(); this._traceDraw(); } });
    cv.addEventListener("dblclick", () => { this.tview.live = true; this.tview.end = this._nowS(); this._renderTraceHead(); this._traceDraw(); });
    if (this._ro) this._ro.disconnect();
    // redraw only when the box itself changes size; the canvas never sizes the box (no feedback loop)
    this._ro = new ResizeObserver((ents) => {
      const r = ents[0].contentRect, k = Math.round(r.width) + "x" + Math.round(r.height);
      if (k !== this._roKey) { this._roKey = k; this._traceDraw(); }
    });
    this._ro.observe(this.shadowRoot.getElementById("chartbox"));
  }
  _traceDraw() {
    const cv = this.shadowRoot.getElementById("chart"); if (!cv || this.view !== "trace") return;
    const host = cv.parentElement;
    const box = { width: host.clientWidth, height: host.clientHeight };
    const sigs = this.trace.signals.filter((s) => !this.trace.hidden[s]);
    const C = this._colors();
    const css = getComputedStyle(this);
    const fg = css.getPropertyValue("--fg").trim() || "#222", muted = css.getPropertyValue("--muted").trim() || "#888", line = css.getPropertyValue("--line").trim() || "rgba(0,0,0,.1)";
    // lane layout
    const kinds = sigs.map((s) => this._laneKind(s));
    const laneH = kinds.map((k) => (k === "analog" ? 120 : k === "text" ? 46 : 40));
    const L = 60, R = 12, T = 8, AX = 26;
    this._chartL = L;
    const H = Math.max(box.height, T + laneH.reduce((a, b) => a + b + 6, 0) + AX);
    const W = Math.max(200, box.width);
    const dpr = window.devicePixelRatio || 1;
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const v = this.tview;
    if (v.live) v.end = this._nowS();
    const t0 = v.end - v.span, t1 = v.end, pw = W - L - R;
    const X = (t) => L + ((t - t0) / (t1 - t0)) * pw;
    // time grid
    const step = this._niceStep(v.span / Math.max(2, pw / 110));
    g.font = "11px system-ui, sans-serif"; g.textAlign = "center"; g.textBaseline = "top";
    for (let t = Math.ceil(t0 / step) * step; t <= t1; t += step) {
      const x = X(t);
      g.strokeStyle = line; g.lineWidth = 1; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - AX); g.stroke();
      g.fillStyle = muted; g.fillText(this._tlabel(t, step), x, H - AX + 6);
    }
    if (!sigs.length) { g.fillStyle = muted; g.textAlign = "center"; g.fillText("Add signals to start tracing", W / 2, H / 2 - 20); return; }
    let y = T;
    const now = this._nowS();
    sigs.forEach((s, i) => {
      const h = laneH[i], col = C[this.trace.signals.indexOf(s) % C.length], kind = kinds[i];
      g.fillStyle = line; g.fillRect(L, y + h + 2, pw, 1);
      g.fillStyle = muted; g.textAlign = "right"; g.textBaseline = "middle"; g.font = "10px ui-monospace, monospace";
      const pts = this._series(s);
      // visible slice incl. the point before t0
      let a = 0, b = pts.length - 1, first = 0;
      while (a <= b) { const m = (a + b) >> 1; if (pts[m][0] < t0) { first = m; a = m + 1; } else b = m - 1; }
      const vis = [];
      for (let k = first; k < pts.length && pts[k][0] <= t1; k++) vis.push(pts[k]);
      const lastT = Math.min(t1, now);
      g.save(); g.beginPath(); g.rect(L, y, pw, h); g.clip();
      g.strokeStyle = col; g.fillStyle = col; g.lineWidth = 1.8;
      if (kind === "digital") {
        const yy = (b) => (b ? y + 6 : y + h - 6);
        g.fillStyle = muted; g.textAlign = "right";
        g.beginPath();
        let started = false, prevY = null;
        for (let k = 0; k < vis.length; k++) {
          const [t, val] = vis[k]; const tn = k + 1 < vis.length ? vis[k + 1][0] : lastT;
          if (val === null || val === undefined) { started = false; continue; }
          const on = this._truthy(val); const x1 = X(Math.max(t, t0)), x2 = X(Math.min(tn, t1)), yy1 = yy(on);
          if (!started) { g.moveTo(x1, yy1); started = true; } else g.lineTo(x1, prevY), g.lineTo(x1, yy1);
          g.lineTo(x2, yy1); prevY = yy1;
          if (on) { g.save(); g.globalAlpha = 0.18; g.fillStyle = col; g.fillRect(x1, yy1, x2 - x1, y + h - 6 - yy1); g.restore(); }
        }
        g.strokeStyle = col; g.stroke();
      } else if (kind === "analog") {
        let mn = Infinity, mx = -Infinity;
        for (const [, val] of vis) if (typeof val === "number") { mn = Math.min(mn, val); mx = Math.max(mx, val); }
        if (mn === Infinity) { mn = 0; mx = 1; }
        if (mn === mx) { mn -= 1; mx += 1; }
        const pad = (mx - mn) * 0.1; mn -= pad; mx += pad;
        const Y = (val) => y + h - 4 - ((val - mn) / (mx - mn)) * (h - 8);
        g.beginPath(); let started = false, prevY = null;
        for (let k = 0; k < vis.length; k++) {
          const [t, val] = vis[k]; const tn = k + 1 < vis.length ? vis[k + 1][0] : lastT;
          if (typeof val !== "number") { started = false; continue; }
          const x1 = X(Math.max(t, t0)), x2 = X(Math.min(tn, t1)), yv = Y(val);
          if (!started) { g.moveTo(x1, yv); started = true; } else { g.lineTo(x1, prevY); g.lineTo(x1, yv); }
          g.lineTo(x2, yv); prevY = yv;
        }
        g.stroke();
        g.restore(); g.save();
        g.fillStyle = muted; g.textAlign = "right"; g.font = "10px ui-monospace, monospace";
        g.fillText(fmtVal(+(mx - pad).toPrecision(4)), L - 6, y + 10); g.fillText(fmtVal(+(mn + pad).toPrecision(4)), L - 6, y + h - 10);
      } else {
        // text / enum lane: bands with labels
        for (let k = 0; k < vis.length; k++) {
          const [t, val] = vis[k]; const tn = k + 1 < vis.length ? vis[k + 1][0] : lastT;
          if (val === null || val === undefined) continue;
          const x1 = X(Math.max(t, t0)), x2 = X(Math.min(tn, t1));
          g.globalAlpha = 0.16; g.fillRect(x1, y + 8, Math.max(1, x2 - x1), h - 16); g.globalAlpha = 1;
          g.fillRect(x1, y + 8, 1.5, h - 16);
          if (x2 - x1 > 30) { g.fillStyle = fg; g.textAlign = "left"; g.font = "11px system-ui"; g.fillText(trunc(String(val), Math.floor((x2 - x1) / 7)), x1 + 5, y + h / 2); g.fillStyle = col; }
        }
      }
      g.restore();
      // lane label
      g.fillStyle = col; g.textAlign = "right"; g.textBaseline = "middle"; g.font = "600 10px system-ui";
      const short = s.startsWith("#") ? s : (this._hass.states[s.replace(/\[.*$/, "")] || { attributes: {} }).attributes.friendly_name || s;
      g.fillText(trunc(short, 9), L - 6, y + h / 2);
      // value at cursor
      if (this._cursorT != null) {
        const cvv = this._valueAt(pts, this._cursorT);
        const tx = fmtVal(cvv === undefined ? null : cvv);
        const cx = X(this._cursorT);
        g.font = "600 11px ui-monospace, monospace"; const tw = g.measureText(tx).width + 10;
        const bx = cx + 6 + tw > W - R ? cx - 6 - tw : cx + 6;
        g.fillStyle = col; g.globalAlpha = 0.9; g.fillRect(bx, y + 3, tw, 17); g.globalAlpha = 1;
        g.fillStyle = "#fff"; g.textAlign = "left"; g.fillText(tx, bx + 5, y + 12);
      }
      y += h + 6;
    });
    // cursor + now line
    if (now >= t0 && now <= t1) { g.strokeStyle = muted; g.setLineDash([3, 4]); g.beginPath(); g.moveTo(X(now), T); g.lineTo(X(now), H - AX); g.stroke(); g.setLineDash([]); }
    if (this._cursorT != null && this._cursorT >= t0 && this._cursorT <= t1) {
      const x = X(this._cursorT);
      g.strokeStyle = fg; g.lineWidth = 1; g.beginPath(); g.moveTo(x, T); g.lineTo(x, H - AX); g.stroke();
      g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "top"; g.font = "600 11px system-ui";
      const lab = new Date(this._cursorT * 1000).toLocaleTimeString([], { hour12: false }) + (v.span < 60 ? "." + String(Math.floor((this._cursorT % 1) * 1000)).padStart(3, "0") : "");
      const tw = g.measureText(lab).width + 10;
      g.fillStyle = css.getPropertyValue("--card").trim() || "#fff"; g.fillRect(x - tw / 2, H - AX + 2, tw, 18);
      g.fillStyle = fg; g.fillText(lab, x, H - AX + 5);
    }
  }
  _laneKind(sig) {
    const pts = this._series(sig);
    let num = 0, bool = 0, text = 0;
    for (let i = Math.max(0, pts.length - 200); i < pts.length; i++) {
      const v = pts[i][1];
      if (typeof v === "boolean") bool++;
      else if (typeof v === "number") num++;
      else if (typeof v === "string") (["on", "off", "true", "false", "home", "not_home", "open", "closed", "detected", "clear"].includes(v.toLowerCase()) ? bool++ : text++);
    }
    if (/\.Q$/i.test(sig)) return "digital";
    if (num >= bool && num >= text && num > 0) return "analog";
    if (text > bool) return "text";
    if (bool) return "digital";
    const cur = this._rawValue(sig);
    return typeof cur === "number" ? "analog" : typeof cur === "string" && !["on", "off"].includes(cur) ? "text" : "digital";
  }
  _truthy(v) { return typeof v === "boolean" ? v : typeof v === "number" ? v !== 0 : ["on", "true", "home", "open", "detected", "playing", "locked"].includes(String(v).toLowerCase()); }
  _niceStep(raw) {
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400];
    return steps.find((s) => s >= raw) || 86400;
  }
  _tlabel(t, step) {
    const d = new Date(t * 1000);
    const hh = String(d.getHours()).padStart(2, "0"), mm = String(d.getMinutes()).padStart(2, "0"), ss = String(d.getSeconds()).padStart(2, "0");
    if (step < 1) return `${mm}:${ss}.${String(d.getMilliseconds()).padStart(3, "0").slice(0, 1)}`;
    if (step < 60) return `${hh}:${mm}:${ss}`;
    if (step >= 86400) return d.toLocaleDateString([], { day: "numeric", month: "short" });
    return `${hh}:${mm}`;
  }
  _traceCsv() {
    const v = this.tview, t0 = v.end - v.span;
    const rows = [["time", ...this.trace.signals]];
    const times = new Set();
    for (const s of this.trace.signals) for (const p of this._series(s)) if (p[0] >= t0 && p[0] <= v.end) times.add(p[0]);
    for (const t of [...times].sort((a, b) => a - b)) rows.push([new Date(t * 1000).toISOString(), ...this.trace.signals.map((s) => { const x = this._valueAt(this._series(s), t); return x == null ? "" : String(x); })]);
    const blob = new Blob([rows.map((r) => r.map((c) => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(",")).join("\n")], { type: "text/csv" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "ladder-trace.csv"; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  /* ---------- live refresh ---------- */
  _tick(fromMonitor = false) {
    if (!this._loaded || (this._drag && this._drag.active)) return;
    const now = performance.now();
    if (!fromMonitor && now - this._lastTick < 1000) return; // hass updates: at most 1/s
    this._lastTick = now;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._renderToolbar();
      if (this.view === "tags") { this._tagsUpdate(); return; }
      if (this.view === "trace") { this._traceLegendUpdate(); this._traceDraw(); return; }
      if (this.view === "history") return;
      const modeKey = `${!!(this.mon && this.mon.running)}/${!!(this.mon && this.mon.simulate)}`;
      if (this._wasRunning !== modeKey) {
        this._wasRunning = modeKey;
        this._renderCanvas();
      } else this._updateSvgs();
      const props = this.shadowRoot.getElementById("props");
      const focused = this.shadowRoot.activeElement;
      if (!(this.sel && this.sel.ids.length)) {
        if (!(focused && props.contains(focused))) props.innerHTML = this._showChecks ? this._checksHtml() : this._watch();
      } else {
        props.querySelectorAll("[data-live]").forEach((d) => {
          const inp = props.querySelector(`[data-field="${d.dataset.live}"]`);
          if (inp) d.innerHTML = this._operandChip(inp.value);
        });
      }
    });
  }

  _toast(msg, bad = false) {
    const t = this.shadowRoot.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.className = "toast show" + (bad ? " bad" : "");
    clearTimeout(this._tt);
    this._tt = setTimeout(() => (t.className = "toast"), bad ? 6000 : 2600);
  }
}

const STYLE = `
:host {
  --bg: var(--primary-background-color, #f5f6f8);
  --card: var(--card-background-color, #fff);
  --fg: var(--primary-text-color, #1d2330);
  --muted: var(--secondary-text-color, #6b7280);
  --line: var(--divider-color, rgba(0,0,0,.12));
  --accent: var(--primary-color, #03a9f4);
  --on: #16a34a;
  --on-soft: rgba(22,163,74,.18);
  --off: #9aa3b2;
  --err: var(--error-color, #db4437);
  --wire: var(--primary-text-color, #1d2330);
  display: block; height: 100%; background: var(--bg); color: var(--fg);
  transition: background-color .2s;
  font-family: var(--paper-font-body1_-_font-family, Roboto, system-ui, sans-serif); font-size: 14px;
}
:host([data-theme="dark"]) {
  --bg: #0e131a; --card: #151c26; --fg: #e4eaf1; --muted: #8a97a8;
  --line: rgba(255,255,255,.09); --accent: #4fb3ff;
  --on: #2fd36b; --on-soft: rgba(47,211,107,.20); --off: #3d4757;
  --err: #ff6b6b; --wire: #b9c6d6; color-scheme: dark;
}
:host([data-theme="light"]) {
  --bg: #f5f6f8; --card: #ffffff; --fg: #1d2330; --muted: #6b7280;
  --line: rgba(0,0,0,.12); --accent: #0288d1;
  --on: #16a34a; --on-soft: rgba(22,163,74,.18); --off: #9aa3b2;
  --err: #db4437; --wire: #1d2330; color-scheme: light;
}
:host([data-theme]) header { background: var(--card); color: var(--fg); }
:host([data-theme="dark"]) .tb.run:not(.running) { background: #3a4352; }
:host([data-theme="dark"]) .wire.on { filter: drop-shadow(0 0 3px rgba(47,211,107,.55)); }
:host([data-theme="dark"]) .rail.on { filter: drop-shadow(0 0 4px rgba(47,211,107,.5)); }
:host([data-theme="dark"]) .toast { background: #26303d; }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
.app { display: flex; flex-direction: column; height: 100%; }
header { display: flex; align-items: center; gap: 8px; padding: 0 12px; height: 56px; flex: none;
  background: var(--app-header-background-color, var(--card)); color: var(--app-header-text-color, var(--fg));
  border-bottom: 1px solid var(--line); }
.title { font-size: 20px; font-weight: 400; white-space: nowrap; margin-right: 8px; }
.menu { display: none; }
:host([narrow]) .menu { display: inline-block; }
:host([narrow]) .title { display: none; }
.icon { background: none; border: 0; font-size: 20px; padding: 6px; }
.views { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; flex: none; }
.views button { border: 0; background: transparent; padding: 6px 12px; font-size: 13px; }
.views button.on { background: var(--accent); color: #fff; }
.forcepill { border: 0; background: #f59e0b; color: #1b1300; font-weight: 700; border-radius: 12px; padding: 4px 10px; font-size: 12px; white-space: nowrap; animation: fpulse 2s infinite; }
@keyframes fpulse { 50% { opacity: .65; } }
:host(:not([view])) #page, :host([view="ladder"]) #page { display: none; }
:host([view="tags"]) .body, :host([view="trace"]) .body, :host([view="history"]) .body { grid-template-columns: 1fr !important; grid-template-rows: 1fr !important; }
:host([view="tags"]) .palette, :host([view="tags"]) .props, :host([view="trace"]) .palette, :host([view="trace"]) .props, :host([view="history"]) .palette, :host([view="history"]) .props { display: none !important; }
#page { overflow: auto; padding: 14px 18px 40px; min-width: 0; }
.pagehead { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
.pagehead h2 { margin: 0 8px 0 0; font-size: 20px; font-weight: 500; }
.search { padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--fg); min-width: 180px; font: inherit; }
.chiprow { display: flex; gap: 4px; flex-wrap: wrap; }
.addwatch { position: relative; min-width: 260px; }
.addwatch input { width: 100%; padding: 6px 10px; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--fg); font: 13px system-ui; }
.addwatch .pickpop { min-width: 340px; right: 0; left: auto; }
.small { font-size: 11.5px; }
.pad { padding: 12px; }
.tablewrap { overflow-x: auto; background: var(--card); border: 1px solid var(--line); border-radius: 12px; }
table.tags { width: 100%; border-collapse: collapse; font-size: 13px; }
table.tags th { text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); font-weight: 600; padding: 9px 10px; border-bottom: 1px solid var(--line); position: sticky; top: 0; background: var(--card); }
table.tags td { padding: 7px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
table.tags tr:last-child td { border-bottom: 0; }
table.tags tr.forced { background: color-mix(in srgb, #f59e0b 10%, transparent); }
table.tags .r { text-align: right; }
table.tags .empty { text-align: center; padding: 30px; }
.nowrap { white-space: nowrap; }
.nowrap .mini { margin-left: 3px; }
.tagname { font-weight: 600; }
.type { font: 600 10.5px ui-monospace, monospace; border: 1px solid var(--line); border-radius: 5px; padding: 1px 5px; color: var(--muted); }
.tagin { width: 76px !important; padding: 3px 6px !important; }
.fmark { display: inline-block; background: #f59e0b; color: #1b1300; font: 700 10px system-ui; border-radius: 4px; padding: 1px 5px; }
.mini.fon { background: #f59e0b; border-color: #f59e0b; color: #1b1300; font-weight: 700; }
.mini.fon2 { background: var(--accent); border-color: var(--accent); color: #fff; }
.bpill { display: inline-block; min-width: 26px; text-align: center; border-radius: 10px; padding: 1px 8px; font: 600 12px ui-monospace, monospace; background: var(--bg); border: 1px solid var(--line); }
.bpill.b1 { background: var(--on); border-color: var(--on); color: #fff; }
.bpill.bf { outline: 2px solid #f59e0b; outline-offset: 1px; }
.ftext { color: #f59e0b; font-weight: 700; }
.uchip { border: 1px solid var(--line); background: var(--bg); border-radius: 6px; padding: 1px 6px; font: 11px ui-monospace, monospace; margin: 1px 3px 1px 0; color: var(--accent); }
.uchip:hover { border-color: var(--accent); }
.fbadge { fill: #f59e0b; }
.fbadget { fill: #1b1300; font: 800 9px system-ui; }
.tracewrap { display: grid; grid-template-columns: 250px 1fr; gap: 12px; height: max(360px, calc(100vh - 150px)); }
.legend { background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow-y: auto; }
.lrow { display: flex; align-items: center; gap: 8px; padding: 7px 8px; border-bottom: 1px solid var(--line); }
.lrow.off { opacity: .45; }
.sw { width: 14px; height: 14px; border-radius: 4px; border: 0; flex: none; padding: 0; }
.lname { flex: 1; min-width: 0; font-size: 12.5px; }
.lname div { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.lval { font-size: 12px; font-weight: 600; color: var(--accent); max-width: 70px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.lval.atcursor { color: var(--fg); }
.mini.x { padding: 1px 6px; }
.chartbox { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 12px; overflow-x: hidden; overflow-y: auto; min-height: 0; height: 100%; }
.val.fval { fill: #f59e0b; }
:host([narrow]) .hidenarrow, :host([narrow]) #theme { display: none; }
:host([narrow]:not([view="ladder"])) #undo, :host([narrow]:not([view="ladder"])) #online { display: none; }
:host([narrow]) table.tags thead { display: none; }
:host([narrow]) table.tags tr { display: grid; grid-template-columns: 22px 1fr auto; gap: 6px 8px; padding: 9px 10px; border-bottom: 1px solid var(--line); }
:host([narrow]) table.tags td { display: block; padding: 0; border: 0; }
:host([narrow]) table.tags td:nth-child(1) { grid-column: 1; grid-row: 1; }
:host([narrow]) table.tags td:nth-child(2) { grid-column: 2; grid-row: 1; min-width: 0; overflow: hidden; }
:host([narrow]) table.tags td:nth-child(5) { grid-column: 3; grid-row: 1; }
:host([narrow]) table.tags td:nth-child(3), :host([narrow]) table.tags td:nth-child(4), :host([narrow]) table.tags td:nth-child(8) { display: none; }
:host([narrow]) table.tags td:nth-child(6) { grid-column: 2 / 4; grid-row: 2; }
:host([narrow]) table.tags td:nth-child(7) { grid-column: 2 / 3; grid-row: 3; }
:host([narrow]) table.tags td:nth-child(9) { grid-column: 3; grid-row: 3; text-align: right; }
:host([narrow]) table.tags td:nth-child(6):has(> .muted:only-child) { display: none; }
:host([narrow]) .addwatch { min-width: 0; width: 100%; }
.tb.test { background: #8b5cf6; border-color: #8b5cf6; color: #fff; font-weight: 700; }
.tb#checks { color: #d97706; border-color: #f59e0b; font-weight: 700; }
.tb#checks.bad { color: #fff; background: var(--err); border-color: var(--err); }
.banner.test { background: rgba(139,92,246,.14); border-color: rgba(139,92,246,.5); }
.banner .mini { margin-left: 8px; }
.val.sval { fill: #8b5cf6; }
.simlog td { font-size: 11.5px; }
.chev { border: 0; background: transparent; color: var(--muted); font-size: 13px; width: 20px; padding: 0; }
.chev:hover { color: var(--accent); }
.rled { width: 9px; height: 9px; border-radius: 50%; background: var(--line); flex: none; }
.rled.on { background: var(--on); box-shadow: 0 0 6px var(--on); }
.rled.off { background: var(--off); }
.rsummary { display: none; padding: 6px 14px 8px 46px; font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.rung.collapsed .rsummary { display: block; }
.rung.collapsed .svgwrap { display: none; }
.rung.collapsed .rhead { border-bottom: 0; }
.el.warn-warn .hit { stroke: #f59e0b; stroke-width: 1.5; stroke-dasharray: 4 3; }
.el.warn-error .hit { stroke: var(--err); stroke-width: 1.8; stroke-dasharray: 2 2; }
.errbox.warn { background: rgba(245,158,11,.12); color: #b45309; }
:host([data-theme="dark"]) .errbox.warn { color: #fbbf24; }
.xref { border: 1px solid var(--line); border-radius: 8px; margin-bottom: 6px; overflow: hidden; }
.xtag { padding: 5px 8px; font-size: 12px; font-weight: 600; background: var(--bg); border-bottom: 1px solid var(--line); }
.xrow { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; border: 0; background: transparent; padding: 4px 8px; font-size: 12px; }
.xrow:hover { background: color-mix(in srgb, var(--accent) 10%, transparent); }
.acc { font: 700 9.5px system-ui; text-transform: uppercase; border-radius: 4px; padding: 1px 5px; min-width: 38px; text-align: center; background: var(--bg); border: 1px solid var(--line); color: var(--muted); }
.acc.aW, .acc.aS, .acc.aR0 { background: #f59e0b; border-color: #f59e0b; color: #1b1300; }
.acc.aD { background: var(--accent); border-color: var(--accent); color: #fff; }
.acc.aA { background: #8b5cf6; border-color: #8b5cf6; color: #fff; }
.prob { display: flex; gap: 8px; padding: 8px; border-radius: 8px; margin-bottom: 6px; font-size: 12.5px; background: var(--bg); border: 1px solid var(--line); }
.prob.error { border-color: var(--err); }
.prob.warn { border-color: #f59e0b; }
.prob .uchip { margin-top: 4px; }
.histwrap { display: grid; grid-template-columns: 340px 1fr; gap: 12px; align-items: start; margin-bottom: 22px; }
.hlist { background: var(--card); border: 1px solid var(--line); border-radius: 12px; max-height: 62vh; overflow-y: auto; }
.hrow { display: flex; gap: 8px; align-items: flex-start; padding: 8px 10px; border-bottom: 1px solid var(--line); cursor: pointer; }
.hrow:hover { background: color-mix(in srgb, var(--accent) 6%, transparent); }
.hrow.on { background: color-mix(in srgb, var(--accent) 14%, transparent); }
.hmain { min-width: 0; flex: 1; font-size: 13px; }
.hnote { color: var(--fg); }
.star { border: 0; background: transparent; font-size: 16px; color: var(--muted); padding: 0 2px; line-height: 1.2; }
.star.on { color: #f59e0b; }
.badge { font: 700 9.5px system-ui; text-transform: uppercase; border-radius: 4px; padding: 1px 5px; background: var(--bg); border: 1px solid var(--line); color: var(--muted); vertical-align: 1px; }
.badge.run { background: var(--on); border-color: var(--on); color: #fff; }
.hdetail { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 12px 14px; min-height: 200px; }
.hhead { display: flex; gap: 10px; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; }
.hhead h3 { margin: 0 0 2px; font-size: 16px; }
.hhead .search { min-width: 240px; }
.mini.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
.dprog { border: 1px solid var(--line); border-radius: 10px; margin-bottom: 10px; overflow: hidden; }
.dpname { padding: 7px 10px; background: var(--bg); border-bottom: 1px solid var(--line); }
.drung { display: flex; gap: 10px; padding: 8px 10px; border-bottom: 1px solid var(--line); font-size: 13px; }
.drung:last-child { border-bottom: 0; }
.dk { font: 700 9.5px system-ui; text-transform: uppercase; border-radius: 4px; padding: 2px 6px; height: fit-content; min-width: 60px; text-align: center; color: #fff; }
.dk.added { background: var(--on); } .dk.removed { background: var(--err); } .dk.changed { background: #f59e0b; color: #1b1300; } .dk.moved { background: var(--off); }
.dlist { margin: 4px 0 0; padding-left: 16px; font: 12px ui-monospace, Menlo, monospace; }
.dlist li.plus { color: var(--on); } .dlist li.minus { color: var(--err); }
.backups h3 { margin: 0 8px 0 0; font-size: 16px; font-weight: 500; }
.filebtn { cursor: pointer; display: inline-block; }
:host([narrow]) .histwrap { grid-template-columns: 1fr; }
:host([narrow]) .hlist { max-height: 40vh; }
.chartbox canvas { position: absolute; left: 0; top: 0; display: block; touch-action: none; cursor: crosshair; }
.charthint { position: absolute; right: 10px; top: 6px; font-size: 10.5px; color: var(--muted); pointer-events: none; }
:host([narrow]) .tracewrap { grid-template-columns: 1fr; grid-template-rows: auto 60vh; height: auto; }
:host([narrow]) .legend { max-height: 180px; }
:host([narrow]) .chartbox { min-height: 320px; }
:host([narrow]) .views button { padding: 6px 8px; }
:host([narrow]) .forcepill { display: none; }
.tabs { display: flex; gap: 4px; flex: 1; min-width: 0; overflow-x: auto; scrollbar-width: none; }
.tab { border: 1px solid var(--line); background: transparent; border-radius: 16px; padding: 4px 12px; white-space: nowrap; display: flex; align-items: center; gap: 6px; }
.tab .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--on); }
.tab.off .dot { background: var(--off); }
.tab.on { background: var(--accent); color: var(--text-primary-color, #fff); border-color: var(--accent); }
.tab.add { padding: 4px 10px; }
.spacer { flex: 1; }
.dirty { color: var(--warning-color, #f59e0b); font-size: 12px; white-space: nowrap; }
.tb { border: 1px solid var(--line); background: var(--card); border-radius: 8px; padding: 6px 10px; white-space: nowrap; }
.tb:disabled { opacity: .4; cursor: default; }
.tb.on { border-color: var(--on); color: var(--on); }
.tb.run { background: #6b7280; color: #fff; border-color: transparent; font-weight: 600; min-width: 82px; }
.tb.run.running { background: var(--on); }
.tb.primary { background: var(--card); }
.tb.primary.hot { background: var(--accent); color: var(--text-primary-color, #fff); border-color: var(--accent); }
.body { flex: 1; display: grid; grid-template-columns: 168px 1fr 300px; min-height: 0; }
.palette { overflow-y: auto; border-right: 1px solid var(--line); background: var(--card); padding: 8px; }
.pgroup { margin-bottom: 10px; }
.pgtitle { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 4px 4px 6px; }
.pitem { display: flex; width: 100%; align-items: center; gap: 8px; border: 1px solid transparent; background: transparent; border-radius: 8px; padding: 5px 6px; text-align: left; }
.pitem:hover { background: var(--bg); border-color: var(--line); }
.pitem .sym { white-space: pre; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; min-width: 62px; color: var(--accent); }
.pitem .pname { white-space: nowrap; font-size: 12px; color: var(--muted); }
main { overflow: auto; padding: 12px 16px 40px; min-width: 0; }
.loading { color: var(--muted); padding: 40px; }
.banner { background: rgba(245,158,11,.15); border: 1px solid rgba(245,158,11,.4); border-radius: 8px; padding: 8px 12px; margin-bottom: 10px; }
.proghead { display: flex; gap: 10px; align-items: center; margin-bottom: 10px; flex-wrap: wrap; }
.progname { font-size: 18px; border: 0; border-bottom: 1px dashed var(--line); background: transparent; color: var(--fg); padding: 4px 2px; min-width: 120px; }
.rung { background: var(--card); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 10px; overflow: hidden; }
.rung.rsel { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
.rung.disabled { opacity: .55; }
.rhead { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-bottom: 1px solid var(--line); }
.rnum { cursor: grab; touch-action: none; padding: 0 6px; font-weight: 600; min-width: 26px; height: 22px; border-radius: 6px; background: var(--bg); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.comment { flex: 1; border: 0; background: transparent; color: var(--fg); font: inherit; padding: 4px; min-width: 60px; }
.comment:focus, .progname:focus { outline: none; border-bottom: 1px solid var(--accent); }
.rerr { color: var(--err); font-size: 12px; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svgwrap { overflow-x: auto; padding: 4px 0; touch-action: none; }
svg { display: block; user-select: none; }
.el { cursor: grab; }
.el.dragging { opacity: .3; }
:host([dragging]) .el, :host([dragging]) .bushit { cursor: grabbing; }
:host([dragging]) { user-select: none; -webkit-user-select: none; }
.pitem { cursor: grab; touch-action: none; }
.ghost { position: fixed; left: 0; top: 0; z-index: 20; pointer-events: none; padding: 6px 10px; border-radius: 8px;
  background: var(--accent); color: #fff; font: 600 12px ui-monospace, Menlo, monospace; white-space: pre;
  box-shadow: 0 6px 18px rgba(0,0,0,.25); }
.dropind line { stroke: var(--accent); stroke-width: 4; stroke-linecap: round; }
.dropind circle, .dropind rect { fill: var(--accent); }
.dropind.box rect { fill: color-mix(in srgb, var(--accent) 15%, transparent); stroke: var(--accent); stroke-width: 2; stroke-dasharray: 5 4; }
.dropind.box text { fill: var(--accent); font: 700 11px system-ui; }
.dropind { pointer-events: none; }
section.rung.rdrop-before { box-shadow: 0 -4px 0 0 var(--accent); }
section.rung.rdrop-after { box-shadow: 0 4px 0 0 var(--accent); }
.palette { position: relative; }
.palette.trash::after { content: "Drop here to delete"; position: absolute; inset: 8px; display: flex; align-items: center; justify-content: center;
  border: 2px dashed var(--err); border-radius: 10px; color: var(--err); background: color-mix(in srgb, var(--card) 85%, transparent); font-weight: 600; text-align: center; }
.palette.trashhot::after { background: color-mix(in srgb, var(--err) 18%, var(--card)); }
.mini { border: 1px solid var(--line); background: var(--card); border-radius: 6px; padding: 3px 8px; font-size: 12px; }
.mini:hover { border-color: var(--accent); }
.mini.danger:hover { border-color: var(--err); color: var(--err); }
.chk { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--muted); white-space: nowrap; }
.addrung { width: 100%; border: 1px dashed var(--line); background: transparent; border-radius: 12px; padding: 12px; color: var(--muted); }
.addrung:hover { border-color: var(--accent); color: var(--accent); }
.foot { color: var(--muted); font-size: 11px; text-align: center; margin-top: 20px; }
/* svg */
.wire, .rail { stroke: var(--wire); stroke-width: 2; opacity: .75; }
.rail { stroke-width: 4; opacity: .9; }
.rail.on { stroke: var(--on); opacity: 1; }
.wire.on { stroke: var(--on); stroke-width: 3.5; opacity: 1; }
.wire.off { stroke: var(--off); opacity: .7; }
.sym { stroke: var(--fg); stroke-width: 2.2; fill: none; }
.sym.thin { stroke-width: 1.8; }
.symt { fill: var(--fg); font: 600 12px ui-monospace, Menlo, monospace; }
.fillon { fill: var(--on-soft); stroke: none; }
.box { fill: var(--card); stroke: var(--fg); stroke-width: 1.6; }
.box.on { stroke: var(--on); stroke-width: 2.5; fill: var(--on-soft); }
.boxt { fill: var(--fg); font: 700 12px ui-monospace, Menlo, monospace; }
.boxs { fill: var(--muted); font: 11px system-ui, sans-serif; }
.lbl { fill: var(--fg); font: 500 11.5px system-ui, sans-serif; }
.lbl.warn { fill: var(--err); }
.tag { fill: var(--muted); font: 9.5px ui-monospace, Menlo, monospace; }
.val { fill: var(--accent); font: 600 10.5px ui-monospace, Menlo, monospace; }
.badge { fill: var(--accent); font: 700 9px system-ui; }
.hint { fill: var(--muted); font: italic 11px system-ui; }
.hit { fill: transparent; stroke: none; cursor: pointer; }
.el:hover .hit { fill: rgba(127,127,127,.08); }
.el.sel .hit { fill: color-mix(in srgb, var(--accent) 12%, transparent); stroke: var(--accent); stroke-width: 1.5; }
.el.err .hit { stroke: var(--err); stroke-width: 1.5; stroke-dasharray: 4 3; }
.bushit { fill: transparent; cursor: pointer; }
.bushit:hover, .bushit.selbox { fill: color-mix(in srgb, var(--accent) 30%, transparent); }
.selpar { fill: none; stroke: var(--accent); stroke-dasharray: 5 4; stroke-width: 1.5; pointer-events: none; }
.addout { cursor: pointer; }
.addout rect { fill: transparent; stroke: var(--muted); stroke-dasharray: 4 3; }
.addout text { fill: var(--muted); font: 12px system-ui; }
.addout:hover rect { stroke: var(--accent); }
/* props */
.props { overflow-y: auto; border-left: 1px solid var(--line); background: var(--card); padding: 12px; }
.phead { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
.phead .mini { margin-left: auto; }
.phead .muted { font-size: 12px; }
.muted { color: var(--muted); }
.field { display: block; margin-bottom: 10px; }
.field > span { display: block; font-size: 12px; color: var(--muted); margin-bottom: 3px; }
.field input, .field select, .field textarea, .num { width: 100%; padding: 7px 8px; border: 1px solid var(--line); border-radius: 6px; background: var(--bg); color: var(--fg); font: 13px ui-monospace, Menlo, Consolas, monospace; }
.num { width: 80px; padding: 3px 6px; }
.field input:focus, .field select:focus, .field textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.chk.row { display: flex; margin-bottom: 10px; color: var(--fg); font-size: 13px; }
.live { font-size: 11px; margin-top: 4px; min-height: 13px; }
.chip { display: inline-flex; align-items: center; gap: 6px; max-width: 100%; padding: 3px 8px; border-radius: 12px; background: var(--bg); border: 1px solid var(--line); font-size: 11.5px; overflow: hidden; white-space: nowrap; }
.chip b { font-weight: 600; overflow: hidden; text-overflow: ellipsis; }
.chip i { color: var(--accent); font-style: normal; font-family: ui-monospace, monospace; }
.chip .cval { color: var(--accent); font-family: ui-monospace, monospace; font-weight: 600; margin-left: auto; }
.chip.warn { color: var(--err); border-color: var(--err); }
.picker-field { position: relative; }
.pickwrap { display: flex; position: relative; }
.pickwrap input { padding-right: 30px !important; }
.pickbtn { position: absolute; right: 2px; top: 2px; bottom: 2px; width: 26px; border: 0; background: transparent; color: var(--muted); border-radius: 4px; }
.pickbtn:hover { color: var(--accent); }
.pickpop { position: absolute; left: 0; right: 0; z-index: 30; margin-top: 4px; background: var(--card); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.25); overflow: hidden; }
.pchips { display: flex; gap: 4px; padding: 6px; overflow-x: auto; border-bottom: 1px solid var(--line); scrollbar-width: none; }
.pchip { white-space: nowrap; border: 1px solid var(--line); background: transparent; border-radius: 12px; padding: 2px 8px; font-size: 11px; color: var(--muted); }
.pchip.on { background: var(--accent); border-color: var(--accent); color: #fff; }
.plist { max-height: 320px; overflow-y: auto; overscroll-behavior: contain; }
.psec { font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); padding: 8px 10px 3px; }
.popt { display: flex; align-items: center; gap: 8px; padding: 6px 10px; cursor: pointer; }
.popt:hover { background: color-mix(in srgb, var(--accent) 8%, transparent); }
.popt.hi { background: color-mix(in srgb, var(--accent) 16%, transparent); }
.popt.dim { opacity: .6; }
.picon { width: 22px; text-align: center; flex: none; font-size: 14px; }
.pmain { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pname { font-size: 13px; line-height: 1.35; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.psub { font: 10.5px/1.5 ui-monospace, Menlo, monospace; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pdesc { font-size: 11px; color: var(--muted); }
.pstate { font: 600 11px ui-monospace, monospace; color: var(--accent); flex: none; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pmore { padding: 8px 10px; font-size: 11px; color: var(--muted); }
.pattrs { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px 10px; }
.pattr { display: flex; flex-direction: column; align-items: flex-start; border: 1px solid var(--line); background: var(--bg); border-radius: 8px; padding: 4px 8px; font-size: 11px; }
.pattr b { font-family: ui-monospace, monospace; }
.pattr span { color: var(--accent); font-family: ui-monospace, monospace; }
.pattr.on, .pattr:hover { border-color: var(--accent); }
.help { font-size: 11px; color: var(--muted); margin-top: 3px; line-height: 1.45; }
ul.help { padding-left: 16px; }
ul.help li { margin-bottom: 5px; }
.days { display: flex; flex-wrap: wrap; gap: 4px; }
.days label { font-size: 12px; display: inline-flex; gap: 2px; align-items: center; border: 1px solid var(--line); border-radius: 6px; padding: 2px 5px; }
.acts { display: flex; gap: 6px; flex-wrap: wrap; margin: 12px 0; }
.errbox { background: rgba(219,68,55,.1); color: var(--err); border-radius: 6px; padding: 6px 8px; margin-bottom: 8px; font-size: 12px; }
.pill { font-size: 11px; font-weight: 700; border-radius: 10px; padding: 2px 8px; color: #fff; background: #6b7280; }
.pill.run { background: var(--on); }
.kv { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.kv td { padding: 4px 2px; border-bottom: 1px solid var(--line); }
.kv td:first-child { color: var(--muted); }
.mono { font-family: ui-monospace, Menlo, monospace; }
.kv .mono { color: var(--fg) !important; }
button.val { border: 1px solid var(--line); background: var(--bg); border-radius: 5px; padding: 1px 8px; font: 600 12px ui-monospace, monospace; min-width: 34px; }
button.val.b1 { background: var(--on); color: #fff; border-color: var(--on); }
.wtitle { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--muted); margin: 16px 0 6px; }
.toast { position: fixed; left: 50%; bottom: 24px; transform: translate(-50%, 30px); background: #323232; color: #fff; padding: 10px 16px; border-radius: 8px; opacity: 0; transition: .2s; pointer-events: none; max-width: 90vw; z-index: 10; }
.toast.show { opacity: 1; transform: translate(-50%, 0); }
.toast.bad { background: var(--err); }
/* narrow / mobile */
:host([narrow]) .body { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
:host([narrow]) .palette { border-right: 0; border-bottom: 1px solid var(--line); display: flex; overflow-x: auto; overflow-y: hidden; padding: 6px; gap: 2px; }
:host([narrow]) .pgroup { display: flex; margin: 0; gap: 2px; }
:host([narrow]) .pgtitle { display: none; }
:host([narrow]) .pitem { width: auto; flex-direction: column; gap: 0; padding: 4px 6px; }
:host([narrow]) .pitem .sym { min-width: 0; }
:host([narrow]) .pitem .pname { font-size: 10px; }
:host([narrow]) .props { display: none; }
:host([narrow][sheet]) .props { display: block; position: fixed; left: 0; right: 0; bottom: 0; max-height: 58vh; border-left: 0; border-top: 1px solid var(--line); border-radius: 16px 16px 0 0; box-shadow: 0 -8px 24px rgba(0,0,0,.2); z-index: 5; }
:host([narrow]) main { padding: 10px 8px 40vh; }
:host([narrow]) .tb { padding: 6px 7px; }
:host([narrow]) header { gap: 5px; padding: 0 6px; }
:host([narrow]) .wide, :host([narrow]) .dirty, :host([narrow]) #redo { display: none; }
:host([narrow]) .tb.run { min-width: 0; }
`;

if (!customElements.get("ha-ladder-panel")) customElements.define("ha-ladder-panel", LadderPanel);
