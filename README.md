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

## Editor
**Drag and drop:** drag instructions from the palette onto a rung, and drag placed elements to move them, within a rung or to another rung. Drop on a wire to insert in series, just below an element to OR it, or on the palette to delete. Drag the ⠿ handle to reorder rungs. On touch screens, press and hold to start a drag.

You can also select a rung or an element, then click an instruction in the palette to insert it after
the selection. Coils and actions go to the right-hand column. **OR branch** wraps the
selection in a parallel path. Shift-click selects several elements side by side. Click a
marker or counter in the Watch panel to modify it while the program is running.
The ◐ button switches the editor between Auto (follows HA), Dark and Light themes.
Keys: Ctrl+S save, Ctrl+Z/Y undo/redo, Delete, Alt+←/→ move. Use Export/Import to
back up programs as JSON.
