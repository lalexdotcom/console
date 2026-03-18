# PROGRESS

## Implemented

### TTY Spinner system (`src/logger/mixins/spinner/tty/`)

- **`renderer.ts`** — `createTTYRenderer()` singleton (stored on `globalThis` to survive CJS+ESM dual-load).
  - Interval-based redraw: `eraseSpinners` (VT100 cursor-up + erase-to-end) → `flushPending` → `drawSpinners`.
  - `lastSpinnerLineCount` tracks physical terminal lines occupied (wrapping-aware via `getLineCount`).
  - `overrideIcon` field on `TTYSpinnerState`: fixed icon (`string`), no icon (`""`), or reset to animation (`null → undefined`).
  - `updateIcon(id, icon | null)` method on `TTYRenderer`.
  - **Resize handling**: on `process.stdout` `resize` event, `lastSpinnerLineCount` is recalculated with the new column width (terminal has already reflowed), then `tick()` is called immediately. Listener is registered with the first spinner and removed in `stopInterval()` / `cleanup()` — no leak.
  - Empty icon (`""`) → no leading space in rendered line (`frameAndText` conditional).
  - Cursor hide/show (`\x1b[?25l` / `\x1b[?25h`).

- **`spinner.ts`** — `createTTYSpinner()`.
  - `register` / `stop` signals routed through `dispatch` → `emitTTY`.
  - `update()` now forwards `opts.icon` to `ttyRenderer.updateIcon()` when present (including `null`).

- **`const.ts`** — `TTYSpinnerIcon`, `TTY_DEFAULT_RUNNING/SUCCESS/FAIL_ICON` as `{ icon, color }`.

### Browser Spinner (`src/logger/mixins/spinner/browser/`)

- `createBrowserSpinner()` using `createSequentialSpinner` (console-log based, interval-driven).
- Respects `opts.icon` override per `SpinnerUpdateOptions`.

### Shared spinner infrastructure

- **`sequential.ts`** — `createSequentialSpinner` + `formatDuration`.
- **`index.ts`** — `selectSpinnerFactory`: TTY → `createTTYSpinner`, console/browser → `createBrowserSpinner`.

### Logger core (`src/logger/index.ts`)

- `emit` → `prepareLog` → `emitTTY` | `emitConsole` split (was a monolithic `outputLog`).
- `DispatchOptions.ttySpinner` signal routed through `emit` → `emitTTY`.
- `emitTTY`: handles `register` (adds spinner to renderer), `stop` (removes before writing final line), and normal log lines (enqueued or direct depending on renderer activity).

### Types (`src/logger/types.ts`)

- `SpinnerUpdateOptions.progress`: `number` (ratio 0–1) or `{ done: number; total: number }`.
- `SpinnerUpdateOptions.icon`: `string | null`
  - `string` → fixed icon, stops cycling.
  - `""` → no icon displayed.
  - `null` → resets to default animation.

### Prefix rendering (`src/logger/prefix.ts`)

- Browser: `if (icon?.content)` guard — empty string no longer renders a bubble.
- Node: same guard prevents empty `[ ]` bracket in output.

### Naming conventions

- All mid-word `Tty` renamed to `TTY` (`emitTTY`, `TTYRenderer`, `TTYSpinnerState`, `createTTYRenderer`, `createTTYSpinner`).
- First-word `tty` stays lowercase (`ttyRenderer`, `ttySpinner` field).

---

## Decisions

- **`overrideIcon` is `string | undefined`** (not `string | null`) internally — `null` from the public API is translated to `undefined` at the boundary (`updateIcon`).
- **Resize recalculates with the new width**, not the old one, because the terminal has already reflowed by the time the event fires.
- **`progress` field** is typed but not yet rendered — reserved for future gauge display.

---

### New level `success` + color `mediumpurple`

- **`src/utils/color.ts`** — `mediumpurple` ajouté en foreground (`[38, 5, 135]`) et background (`[48, 5, 135]`).
- **`src/logger/levels.ts`** — niveau `success` inséré à la sévérité 6 avec la couleur verte (`background-color: green`) récupérée de `verb`. `verb` passe à la sévérité 8 avec `mediumpurple`. Renumérotation complète : `info` → 7, `debug` → 9, `wth` → 10.
- **`src/logger/index.ts`** — `success: { method: console.info }` ajouté dans `LEVEL_PARAMS`.
- **`README.md`** — compteur mis à 11 niveaux, tableau des niveaux mis à jour.

## Decisions

- `mediumpurple` = code 256-couleurs ANSI 135, cohérent avec la palette existante (256-color extended sequences).
- `success` reprend exactement le vert (`green`) de `verb` qui l'utilisait avant — pas de nouvelle couleur inventée.
- L'ordre de sévérité syslog est respecté : `success` (6) < `info` (7) < `verb` (8).

---

## Next step

Implement `progress` rendering in `drawSpinners`:
- `number` → format as `[████░░░░] 42%`
- `{ done, total }` → format as `[████░░░░] 3/7`

The progress value should be stored on `TTYSpinnerState` (alongside `overrideIcon`) and updated via a new `updateProgress(id, progress)` method on `TTYRenderer`, called from `spinner.update()`.
