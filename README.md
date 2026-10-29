# Ladder Logic for Home Assistant

Program Home Assistant like a PLC: rungs, contacts, coils, timers, counters and a real
cyclic scan, with live green power-flow monitoring in a sidebar editor.

## Install
1. Copy `custom_components/ha_ladder` into your HA `/config/custom_components/` folder
   (Samba share, Studio Code Server or File editor add-on).
2. Restart Home Assistant.
3. **Settings → Devices & services → Add integration → Ladder Logic.**
4. A **Ladder Logic** item appears in the sidebar (admin users only).

You also get `switch.ladder_logic_plc_run` (RUN/STOP), a diagnostic
`sensor.ladder_logic_plc_scan_time`, and the `ha_ladder.set_marker` action.

## How it runs
* Every cycle (250 ms by default, 50–10000 ms) the runtime reads entity states from
  memory, solves every enabled rung top to bottom, then writes the output image.
* An output only calls a service when its value **changes**. Nothing goes on the
  event bus each scan, so the Activity log only shows real changes. Tick **Enforce** on a
  coil to re-apply it every 5 s if someone changes the entity by hand.
* After a coil writes an entity, reading that entity returns the commanded value until
  HA catches up (up to 5 s), so seal-in / latch circuits don't flicker.
* Scanning starts only after HA has finished starting. Edge contacts and actions never
  fire on the first scan.
* Markers (`#name`), counter values and TONR time are retentive (they survive restarts).

## Operands
| Write | Meaning |
|---|---|
| `binary_sensor.door` | entity state (on/open/home/playing/locked… = 1) |
| `sensor.x[temperature]` | entity attribute |
| `#away` | internal memory marker |
| `#T1.Q`, `#T1.ET` | timer done bit / elapsed seconds |
| `#C1.Q`, `#C1.CV` | counter done bit / current value |
| `42`, `true`, `'home'` | constants |

## Instructions
**Bit logic:** `-| |-` NO, `-|/|-` NC, `-|P|-` / `-|N|-` positive/negative edge of an operand,
`P_TRIG` / `N_TRIG` edge of the power flow (RLO), `NOT`.
**Compare:** CMP (== <> > < >= <=, numeric or text), IN_RANGE, TIME window (with days,
works across midnight), SUN (above/below an elevation).
**Timers:** TON, TOF, TP, TONR (retentive, with reset).
**Counters:** CTU, CTD, CTUD.
**Outputs:** `-( )-`, `-(/)-`, `-(S)-`, `-(R)-`, `-(P)-` / `-(N)-` (one-scan pulse on a power-flow edge).
**Data:** MOVE, MATH (+ − × ÷ % MIN MAX ABS ROUND), SCALE.
**Home Assistant:** SERVICE (any action, JSON data with `{tag}` substitution, fires on a rising or
falling edge), NOTIFY.

Coils on entities: light/switch/fan/input_boolean… on/off, cover/valve open/close,
lock lock/unlock, scene/button activate, vacuum start/dock, lawn_mower mow/dock.
Numbers written with MOVE/MATH: input_number/number value, light brightness %,
cover position, fan %, climate setpoint, media_player volume (0–1).

## History & backups
**Every Save is a version.** The History page lists them (newest 50, plus any you pin ★, which are kept forever). Each version has a time, an optional note (shift-click **Save** to add one, or type it on the History page) and a summary. Select a version to see exactly what restoring it would change compared with the running version, rung by rung: rungs added/removed/moved, comment changes, element parameter changes (`TOF T1: pt "120" → "60"`), elements added/removed, and wiring changes.
* **Restore** replaces the running programs immediately. The current version stays in History, so a restore can always be undone by restoring again.
* **Open in editor** loads a version into the editor without running it (Ctrl+Z goes back), so you can look around or copy bits.
* **Download JSON** for any version.

**File backups** go to `/config/ladder_backups/` (so they're also inside Home Assistant's own backups). Use **Back up now**, or automate with the `ha_ladder.backup` action:
```yaml
action: ha_ladder.backup
data:
  keep: 30        # optional: delete older files
  label: nightly  # optional: added to the file name
```
Any backup file (from the folder or uploaded from your computer) can be previewed with the same diff and restored.

## Test mode
🧪 **Test** in the toolbar (or `switch.ladder_logic_plc_test_mode`) runs the program normally, but outputs and actions are only simulated: nothing in the house is switched and no notifications are sent. Simulated outputs read back to the program (so latches work), show in purple as "(sim)" in the ladder and on the Tags/Trace pages, and the Watch panel lists every simulated output change and action. When you leave test mode, the next scan applies the program's outputs to the real devices.

## Checks and cross-reference
The ⚠ badge in the toolbar counts problems; click it for the list, with links to each place:
* **double coils**: the same tag assigned by two coils/moves (the last one wins each scan), or assigned *and* set/reset;
* duplicate timer/counter names; references to a timer/counter that doesn't exist;
* missing, unavailable or read-only entities, writing to attributes, empty operands, invalid JSON;
* info: SET without RESET, markers that are read but never written, rungs without outputs.

Affected elements get a dashed outline. Selecting an element shows a **cross-reference** of every tag it uses: each use with read/write/set/reset/definition badges, and a click jumps there.

## Collapsible rungs
▾/▸ on each rung collapses it to a one-line summary (`NO Hallway Motion · SUN → COIL Hallway Light`), with a status LED that shows the rung result while monitoring. ⊟/⊞ collapse/expand all. Collapse state is remembered per browser and doesn't mark the program as changed.

## Scan semantics (worth knowing)
* Edge contacts, P_TRIG/N_TRIG, edge coils, counters and SERVICE/NOTIFY only see an edge if they were also evaluated in the previous scan. A rung that is newly added, re-enabled or just started never fires a false edge.
* Non-retentive timers that weren't evaluated last scan (rung disabled, PLC stopped) start fresh instead of jumping by the skipped time. TP doesn't fire on the first scan if its input is already on.
* STOP → RUN clears edge memory and timers and re-syncs every output to the logic on the first scan. An output that was unavailable is re-synced when it comes back.
* The last write in a scan wins. Reading an entity that a coil wrote earlier in the same scan returns the written value (output image).

## Entity picker
Operand fields have a searchable picker. Search by name, entity id, area or device. Suggestions depend on the field: a contact suggests on/off sources, a coil only switchable entities, a MOVE destination only settable ones. Domain chips filter the list; recently used and in-program entities come first, with live state shown. After you pick an entity you can choose one of its attributes, e.g. `climate.living[current_temperature]`. You can also enter `#markers` or constants. Keyboard: ↑ ↓ Enter Esc.

## Tags page (watch & force table)
Lists every marker, timer and counter bit/value, every entity the program reads (input) or writes (output), and anything you add to the watch list, all with live values. **Modify** writes a marker or counter once. **Force** holds a tag at a value until released, like a PLC force table:
* a forced input or marker is read as the forced value, and coils can't change it;
* a forced output entity is driven to the forced value;
* forces survive restarts, show an orange **F** in the ladder, and the header shows "F n forced". **Release all** clears them.

## Trace page
A TIA-style trace / logic analyzer. Add up to 16 entities or #tags (or use 📈 on the Tags page). The runtime records every value change at scan resolution, and entities are pre-filled with the last 24 h from HA's recorder. Each signal gets its own lane: on/off signals as digital steps, numbers as auto-scaled lines, text states as labelled bands.
Zoom with the mouse wheel / pinch or the presets (10 s → 24 h), drag to pan, double-click to return to **Live**. Hovering shows a cursor with every signal's value at that moment. **CSV** exports the visible window.

## Editor
**Drag and drop:** drag instructions from the palette onto a rung, and drag placed elements to move them, within a rung or to another rung. Drop on a wire to insert in series, just below an element to OR it, or on the palette to delete. Drag the ⠿ handle to reorder rungs. On touch screens, press and hold to start a drag.

You can also select a rung or an element, then click an instruction in the palette to insert it after
the selection. Coils and actions go to the right-hand column. **OR branch** wraps the
selection in a parallel path. Shift-click selects several elements side by side. Click a
marker or counter in the Watch panel to modify it while the program is running.
The ◐ button switches the editor between Auto (follows HA), Dark and Light themes.
Keys: Ctrl+S save, Ctrl+Z/Y undo/redo, Delete, Alt+←/→ move. Use Export/Import to
back up programs as JSON.
