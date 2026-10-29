/* Ladder Logic panel for Home Assistant — vanilla web component, no build step. */

const CW = 124;        // cell width
const CH = 92;         // cell height
const WY = 50;         // wire y inside a cell
const RAIL = 14;       // rail inset
const VERSION = "0.1.1";

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

const uid = () => "x" + Math.random().toString(36).slice(2, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const trunc = (s, n) => { s = String(s ?? ""); return s.length > n ? s.slice(0, n - 1) + "…" : s; };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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
    this._unsub = this._hass.connection.subscribeMessage((m) => { this.mon = m; this._tick(true); }, { type: "ha_ladder/monitor" });
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

  async _save() {
    try {
      await this._hass.callWS({ type: "ha_ladder/save", programs: this.programs });
      this._setDirty(false);
      this._toast("Saved — the runtime is now using this version");
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
    if (typing) return;
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
          <div class="tabs" id="tabs"></div>
          <span class="dirty" id="dirtynote" hidden>unsaved</span>
          <button class="tb" id="undo" title="Undo (Ctrl+Z)">↶</button>
          <button class="tb" id="redo" title="Redo (Ctrl+Y)">↷</button>
          <button class="tb" id="theme" title="Theme: auto / dark / light">◐<span class="wide" id="themelbl"> Auto</span></button>
          <button class="tb" id="online" title="Show live power flow">◉<span class="wide"> Monitor</span></button>
          <button class="tb run" id="run">…</button>
          <button class="tb primary" id="save" title="Save & download to runtime (Ctrl+S)">Save</button>
        </header>
        <div class="body">
          <aside class="palette" id="palette"></aside>
          <main id="canvas"><div class="loading">Loading…</div></main>
          <aside class="props" id="props"></aside>
        </div>
        <div class="toast" id="toast"></div>
        <input type="file" id="file" accept=".json,application/json" hidden>
      </div>`;
    const $ = (id) => this.shadowRoot.getElementById(id);
    $("menu").onclick = () => this.dispatchEvent(new Event("hass-toggle-menu", { bubbles: true, composed: true }));
    $("undo").onclick = () => this._undo();
    $("redo").onclick = () => this._undo(true);
    $("save").onclick = () => this._save();
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
      const b = e.target.closest("[data-type]"); if (b) this._insert(b.dataset.type);
    });
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
    const running = !!(this.mon && this.mon.running);
    const run = $("run");
    run.textContent = running ? "■ STOP" : "▶ RUN";
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
    const status = this.mon && this.mon.running ? "" : `<div class="banner">PLC is in STOP — outputs are not being updated.</div>`;
    c.innerHTML = `
      ${status}
      <div class="proghead">
        <input class="progname" data-progname value="${esc(prog.name)}" title="Program name">
        <label class="chk"><input type="checkbox" data-progenabled ${prog.enabled ? "checked" : ""}> Enabled</label>
        <div class="spacer"></div>
        <button class="mini" data-act="export">Export</button>
        <button class="mini" data-act="import">Import</button>
        <button class="mini danger" data-act="delprog">Delete program</button>
      </div>
      ${prog.rungs.map((r, i) => `
        <section class="rung ${this.sel && this.sel.rung === r.id ? "rsel" : ""} ${r.enabled ? "" : "disabled"}" data-rung="${r.id}">
          <div class="rhead">
            <span class="rnum">${i + 1}</span>
            <input class="comment" data-comment="${r.id}" placeholder="Rung comment…" value="${esc(r.comment || "")}">
            <span class="rerr" data-rerr="${r.id}"></span>
            <label class="chk" title="Disabled rungs are skipped"><input type="checkbox" data-rungenable="${r.id}" ${r.enabled ? "checked" : ""}> on</label>
            <button class="mini" data-act="rup" data-r="${r.id}" title="Move up">▲</button>
            <button class="mini" data-act="rdown" data-r="${r.id}" title="Move down">▼</button>
            <button class="mini" data-act="rdup" data-r="${r.id}" title="Duplicate">⧉</button>
            <button class="mini danger" data-act="rdel" data-r="${r.id}" title="Delete rung">✕</button>
          </div>
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
    const hit = e.target.closest("[data-id]");
    const rungEl = e.target.closest("[data-rung]");
    if (e.target.closest("input,button,label,select,textarea")) return;
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
    this._updateSvgs();
    this._renderProps();
  }
  _canvasClick(e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const r = b.dataset.r;
    switch (b.dataset.act) {
      case "addrung": this._addRung(this.sel && this.sel.rung); break;
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
          this.programs.push(p);
        }
        this.pi = this.programs.length - 1;
      });
      this._toast(`Imported ${list.length} program(s) — Save to run`);
    } catch (e) { this._toast("Import failed: " + e.message, true); }
    this.shadowRoot.getElementById("file").value = "";
  }

  /* ---------- SVG ---------- */
  _updateSvgs() {
    const prog = this.prog; if (!prog) return;
    const cols = this._maxCols();
    for (const r of prog.rungs) {
      const host = this.shadowRoot.querySelector(`[data-svg="${r.id}"]`);
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
    const H = rows * CH + 6;
    const ctx = { out: [], live: this._live() && rung.enabled && this.prog.enabled, m: (this.mon && this.mon.m) || {} };
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
    if (!rung.logic.items.length) {
      ctx.out.push(`<text class="hint" x="${x(0) + 14}" y="${y(0) - 10}">select this rung, then pick a contact from the palette</text>`);
    }
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${ctx.out.join("")}</svg>`;
  }
  _wc(ctx, p) { return !ctx.live || p === undefined ? "wire" : p ? "wire on" : "wire off"; }

  _drawNode(n, c, r, W, ctx, top = false) {
    const x = (cc) => RAIL + cc * CW, y = (rr) => rr * CH + WY;
    const md = ctx.m[n.id];
    if (n.t === "el") return this._drawEl(n, c, r, ctx, md ? md[0] : undefined);
    if (n.t === "series") {
      const pin = md ? md[0] : undefined, pout = md ? md[1] : undefined;
      if (!n.items.length) {
        ctx.out.push(`<line class="${this._wc(ctx, pin)}" x1="${x(c)}" y1="${y(r)}" x2="${x(c + W)}" y2="${y(r)}"/>`);
        return;
      }
      let cc = c;
      for (const it of n.items) { const s = sizeOf(it); this._drawNode(it, cc, r, s.w, ctx); cc += s.w; }
      if (cc < c + W) ctx.out.push(`<line class="${this._wc(ctx, pout)}" x1="${x(cc)}" y1="${y(r)}" x2="${x(c + W)}" y2="${y(r)}"/>`);
      return;
    }
    // parallel
    let rr = r; const rowsAt = [];
    for (const b of n.branches) {
      rowsAt.push(rr);
      this._drawNode(b, c, rr, W, ctx);
      // branch filler is handled inside series; each branch end goes to right bus
      rr += sizeOf(b).h;
    }
    const last = rowsAt[rowsAt.length - 1];
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
    o.push(`<g class="el ${sel ? "sel" : ""} ${err ? "err" : ""}" data-id="${el.id}">`);
    o.push(`<rect class="hit" x="${x0 + 3}" y="${yy - 46}" width="${CW - 6}" height="${CH - 4}" rx="8"/>`);
    if (err) o.push(`<title>${esc(err)}</title>`);
    const label = (tag, yOff = 36) => {
      const L = this._label(tag);
      o.push(`<text class="lbl ${L.warn ? "warn" : ""}" x="${cx}" y="${yy - yOff}" text-anchor="middle">${esc(trunc(L.main, 19))}</text>`);
      if (L.sub) o.push(`<text class="tag" x="${cx}" y="${yy - yOff + 11}" text-anchor="middle">${esc(trunc(L.sub, 20))}</text>`);
    };
    const valueText = (s) => { if (s !== "" && s !== undefined && s !== null) o.push(`<text class="val" x="${cx}" y="${yy + 34}" text-anchor="middle">${esc(trunc(s, 20))}</text>`); };

    if (CONTACT_TYPES.has(t)) {
      const v = md ? md[2] : undefined;
      const conducting = ctx.live && md ? (t === "NO" ? v : t === "NC" ? !v : po) : false;
      o.push(`<line class="${wcIn}" x1="${x0}" y1="${yy}" x2="${cx - 10}" y2="${yy}"/>`);
      o.push(`<line class="${wcOut}" x1="${cx + 10}" y1="${yy}" x2="${x1}" y2="${yy}"/>`);
      if (conducting) o.push(`<rect class="fillon" x="${cx - 10}" y="${yy - 14}" width="20" height="28"/>`);
      o.push(`<line class="sym" x1="${cx - 10}" y1="${yy - 15}" x2="${cx - 10}" y2="${yy + 15}"/><line class="sym" x1="${cx + 10}" y1="${yy - 15}" x2="${cx + 10}" y2="${yy + 15}"/>`);
      if (t === "NC") o.push(`<line class="sym thin" x1="${cx - 7}" y1="${yy + 12}" x2="${cx + 7}" y2="${yy - 12}"/>`);
      if (t === "P" || t === "N") o.push(`<text class="symt" x="${cx}" y="${yy + 5}" text-anchor="middle">${t}</text>`);
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
    const p = this.shadowRoot.getElementById("props");
    const sel = this.sel;
    this.toggleAttribute("sheet", !!(sel && sel.ids.length));
    if (sel && sel.ids.length === 1) {
      const loc = this._locate(sel.ids[0]);
      if (loc && loc.node.t === "el") { p.innerHTML = this._elementForm(loc.node, loc); return; }
      if (loc && loc.node.t === "parallel") { p.innerHTML = this._selActions("OR branch", "Insert after it by picking from the palette.", loc); return; }
    }
    if (sel && sel.ids.length > 1) { p.innerHTML = this._selActions(`${sel.ids.length} selected`, "Wrap them in an OR branch or delete them.", null); return; }
    p.innerHTML = this._watch();
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
    const ents = this._datalist();
    const rows = fields.map(([key, label, kind, extra]) => {
      const v = el[key];
      let input;
      if (kind === "operand") input = `<input data-field="${key}" list="ld-ents" value="${esc(v ?? "")}" spellcheck="false" autocomplete="off"><div class="live" data-live="${esc(key)}">${esc(this._operandHint(v))}</div>`;
      else if (kind === "service") input = `<input data-field="${key}" list="ld-svcs" value="${esc(v ?? "")}" spellcheck="false" autocomplete="off">`;
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
    return `${ents}
      <div class="phead"><b>${esc(el.type)}</b> <span class="muted">${esc(DESCR[el.type] || "")}</span><button class="mini" data-pact="close">✕</button></div>
      ${err ? `<div class="errbox">⚠ ${esc(err)}</div>` : ""}
      ${rows || `<p class="muted">No settings.</p>`}
      <div class="acts">
        <button class="mini" data-pact="left" title="Alt+←">◀ Move</button>
        <button class="mini" data-pact="right" title="Alt+→">Move ▶</button>
        ${inOut === "logic" ? `<button class="mini" data-pact="or" title="Add a parallel branch around this">OR branch</button>` : ""}
        <button class="mini danger" data-pact="del" title="Delete">Delete</button>
      </div>
      <p class="help">Operands: ${esc(OPERAND_HELP)}</p>`;
  }
  _datalist() {
    const st = this._hass.states;
    const ents = Object.keys(st).sort();
    const tags = new Set();
    for (const p of this.programs) for (const r of p.rungs) {
      const scan = (n) => {
        for (const k of ["tag", "a", "b", "dst", "src", "reset", "load", "cd"]) if (typeof n[k] === "string" && n[k].startsWith("#")) tags.add(n[k]);
        if (n.name && TIMER_TYPES.has(n.type)) { tags.add(`#${n.name}.Q`); tags.add(`#${n.name}.ET`); }
        if (n.name && COUNTER_TYPES.has(n.type)) { tags.add(`#${n.name}.Q`); tags.add(`#${n.name}.CV`); }
      };
      walk(r.logic, (n) => n.t === "el" && scan(n));
      r.outputs.forEach(scan);
    }
    const svcs = [];
    const services = this._hass.services || {};
    for (const d of Object.keys(services).sort()) for (const s of Object.keys(services[d]).sort()) svcs.push(`${d}.${s}`);
    return `<datalist id="ld-ents">${[...tags].sort().map((t) => `<option value="${esc(t)}">`).join("")}${ents.map((e) => `<option value="${esc(e)}">${esc(st[e].attributes.friendly_name || "")}</option>`).join("")}</datalist>
      <datalist id="ld-svcs">${svcs.map((s) => `<option value="${esc(s)}">`).join("")}</datalist>`;
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
    const sel = this.sel; if (!sel || sel.ids.length !== 1) return;
    const loc = this._locate(sel.ids[0]); if (!loc || loc.node.t !== "el") return;
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
      if (live) live.textContent = this._operandHint(t.value);
    } else return;
    this._commitSnap();
    this._setDirty(true);
    this._renderToolbar();
    this._updateSvgs();
  }
  _propClick(e) {
    const b = e.target.closest("[data-pact]");
    if (b) {
      switch (b.dataset.pact) {
        case "close": this.sel = this.sel ? { rung: this.sel.rung, ids: [] } : null; this._updateSvgs(); this._renderProps(); break;
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
      <div class="wtitle">Markers</div>
      ${memRows ? `<table class="kv">${memRows}</table>` : `<p class="muted">None yet — write to <span class="mono">#name</span> with a coil.</p>`}
      ${tRows ? `<div class="wtitle">Timers</div><table class="kv">${tRows}</table>` : ""}
      ${cRows ? `<div class="wtitle">Counters</div><table class="kv">${cRows}</table>` : ""}
      <div class="wtitle">How it works</div>
      <ul class="help">
        <li>Select a rung (or an element), then click an instruction in the palette to insert it after the selection. Coils & actions go to the right-hand column.</li>
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

  /* ---------- live refresh ---------- */
  _tick(fromMonitor = false) {
    if (!this._loaded) return;
    const now = performance.now();
    if (!fromMonitor && now - this._lastTick < 1000) return; // hass updates: at most 1/s
    this._lastTick = now;
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => {
      this._raf = null;
      this._renderToolbar();
      if (this._wasRunning !== !!(this.mon && this.mon.running)) {
        this._wasRunning = !!(this.mon && this.mon.running);
        this._renderCanvas();
      } else this._updateSvgs();
      const props = this.shadowRoot.getElementById("props");
      const focused = this.shadowRoot.activeElement;
      if (!(this.sel && this.sel.ids.length)) {
        if (!(focused && props.contains(focused))) props.innerHTML = this._watch();
      } else {
        props.querySelectorAll("[data-live]").forEach((d) => {
          const inp = props.querySelector(`[data-field="${d.dataset.live}"]`);
          if (inp) d.textContent = this._operandHint(inp.value);
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
.rnum { font-weight: 600; min-width: 26px; height: 22px; border-radius: 6px; background: var(--bg); display: inline-flex; align-items: center; justify-content: center; font-size: 12px; }
.comment { flex: 1; border: 0; background: transparent; color: var(--fg); font: inherit; padding: 4px; min-width: 60px; }
.comment:focus, .progname:focus { outline: none; border-bottom: 1px solid var(--accent); }
.rerr { color: var(--err); font-size: 12px; max-width: 30%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.svgwrap { overflow-x: auto; padding: 4px 0; touch-action: pan-x pan-y; }
svg { display: block; user-select: none; }
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
.live { font-size: 11px; color: var(--accent); margin-top: 3px; min-height: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
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
