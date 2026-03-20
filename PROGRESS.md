# PROGRESS

## Session — 2026-03-20 : Browser stacktrace rendering + play script refactor

### Implemented

**1. Browser stacktrace via `console.groupCollapsed`** (`src/logger/index.ts` — `emitConsole`)

For levels `emerg`, `alert`, `crit` and when `stack=true`, the browser now renders the call-site inside a `console.groupCollapsed(…label…)` + `console.log(stackContent)` + `console.groupEnd()` instead of calling the native `console.error` (which injects a spurious internal stacktrace).
Node behavior is unchanged.

**2. `stack` flag unified with TRACE_LEVELS** (`src/logger/index.ts` — `prepareLog`)

- `trace = (hasTrace || stack) && callerOverride === undefined` — the stack flag now triggers the same trace rendering as `emerg`/`alert`/`crit`.
- `CallerPrefix.structuredOnly` is always `true` — the inline caller badge is removed from pretty output; the caller is only used in JSON/logfmt (`caller` field) and as the content of the collapsed group.

**3. Browser console method normalization** (`src/logger/index.ts` — `emitConsole`)

- `effectiveMethod = !isNode && method !== activeConsole.debug ? activeConsole.log : method`
- In browser: only `verb`/`debug`/`wth` use `console.debug` (DevTools Verbose filter). All other levels use `console.log`.
- Node behavior unchanged.

**4. Play scripts refactored** (`src/play-node.dev.ts`, `src/play-browser.dev.ts`, `rsbuild.config.ts`, `package.json`)

- `play-node.dev.ts`: argv parsing `--mode=main|worker` (default `main`), `--format=pretty|json|logfmt` (optional). `logger = mode === 'worker' ? WL : L`. Section 10 (terminateWorker fallback) conditioned on `mode === 'worker'`.
- `play-browser.dev.ts`: `declare const __PLAY_MODE__: 'main' | 'worker'`. `logger = __PLAY_MODE__ === 'worker' ? WL : L`.
- `rsbuild.config.ts`: `source.define` injects `__PLAY_MODE__` from `process.env.PLAY_MODE ?? 'main'`.
- `package.json`: 10 `play:*` scripts covering all mode × format combinations.

**5. README updated** (`README.md`)

`[!WARNING]` block added in the **Configuration** section documenting browser DevTools filtering limitations and the `groupCollapsed` stacktrace behavior.

### Decisions

- `groupCollapsed` in browser avoids the native DevTools stacktrace pointing to logger internals. The real call-site is shown inside the group.
- `console.debug` preserved as-is for Verbose filter compatibility. No other DevTools level filters are mapped — `L.level` is the intended filtering mechanism.
- `structuredOnly: true` always on `CallerPrefix` — the inline badge was redundant once the stacktrace is shown separately.
- `--format` defaults to the library default (no assignment) when not passed, rather than hardcoding `json`.

### Next step

Visual validation with `pnpm run play:browser`, `pnpm run play:browser:worker`, `pnpm run play:node`, `pnpm run play:node:worker`, `pnpm run play:tty` to confirm:
- `emerg`/`alert`/`crit` in browser → collapsed group with stacktrace, no native error stacktrace
- `info` with `stack=true` in browser → collapsed group with call-site
- `verb`/`debug`/`wth` → `console.debug` (Verbose filter)
- All other levels → `console.log`
- Node non-TTY and TTY unchanged



### Bug fixes — caller prefix & stacktrace

**Problèmes résolus :**
1. `emerg` sans `stack=true` affichait un prefix caller en mode pretty (TTY, non-TTY, browser) → supprimé.
2. `emerg` sans `stack=true` n'affichait pas de stacktrace en mode pretty → stacktrace complète affichée.
3. `info` avec `stack=true` affichait `<anonymous> @ file:line:col` au lieu de `file:line:col` → corrigé.
4. En json/logfmt, `caller` pour TRACE_LEVELS contenait une frame brute (`at <anonymous> (…)`) → désormais `file:line:col` propre.
5. En json/logfmt, `caller` absent pour TRACE_LEVELS du logger local `L` → désormais présent.

**Fichiers modifiés :**

- **`src/logger/prefix/types.ts`** — `CallerPrefix.structuredOnly?: boolean`. Quand `true`, les renderers pretty ignorent l'item; le sérialiseur JSON/logfmt l'inclut toujours.
- **`src/logger/prefix/render.ts`** — les trois renderers (`renderBrowserPrefix`, `renderTTYPrefix`, `renderConsolePrefix`) sautent les items `caller` avec `structuredOnly: true`.
- **`src/logger/index.ts`** — `EmitOptions.callerStructuredOnly?: boolean` ajouté. `prepareLog` : la condition d'ajout du caller passe de `stack` à `stack || TRACE_LEVELS.has(logLevel)` ; le flag `structuredOnly` est positionné à `true` quand le caller est émis pour TRACE_LEVELS sans `stack=true`. `__logFromMainProcess` accepte un 6e param `callerStructuredOnly?`.
- **`src/types.ts`** — signature de `__logFromMainProcess` dans `RootLogger` et `ScopeLogger` mise à jour (6e param `callerStructuredOnly?`).
- **`src/worker/protocol.ts`** — `callerStructuredOnly?: boolean` ajouté au variant `log` ; commentaire `traceCaller` étendu pour couvrir Node en plus du browser.
- **`src/worker/worker.ts`** — `__logFromMainProcess` appelé avec `msg.callerStructuredOnly` (6e arg).
- **`src/worker/index.ts`** — `formatCallerString` réduit à `file:line:col` uniquement (suppression de `functionName`). Import `getRawFrameAt` remplacé par `getCallerStackTraceAt`. Import `isBrowser` supprimé (devenu inutilisé). Les 4 closures de log (niveau + base['log'] dans root et scope) unifiées : capturent `callerInfo` + `callerStructuredOnly` + `traceCaller` pour tous les TRACE_LEVELS quel que soit la plateforme. `buildFallbackSend` passe `msg.traceCaller` et `msg.callerStructuredOnly` à `__logFromMainProcess`.
- **`src/worker/limit.ts`** — caller réduit à `file:line:col` uniquement dans `buildLimitedProxy`.

**Décisions :**
- `structuredOnly` sur `CallerPrefix` plutôt qu'un second type — minimal, transparent pour `serialize.ts` (pas de changement nécessaire).
- `formatCallerString` → `file:line:col` uniquement : le nom de fonction est instable (anonyme en tsx, nom de module bundlé en browser, identifiant manglé en prod).
- `traceCaller` capturé pour TRACE_LEVELS sur Node ET browser, sans condition `isBrowser` — les deux environnements en ont besoin en mode pretty.
- `TRACE_LEVELS` condition sans `isBrowser` dans les proxies — cohérence entre root et scope, entre Node et browser.

## Next step

Valider visuellement les corrections avec `pnpm run play:tty`, `pnpm run play:node` et `pnpm run play:browser` :
- `emerg` / `alert` / `crit` sans `stack=true` → pas de prefix caller en pretty, stacktrace complète affichée en dessous, `caller` présent en json/logfmt.
- `info` avec `stack=true` → prefix `(file:line:col)` sans `<anonymous> @`.
- `info` sans `stack=true` → aucun prefix caller, pas de stacktrace.

---

### WorkerLogger (`src/worker/`)

- **`protocol.ts`** — union discriminante `WorkerMessage` : `log`, `spin:start/update/success/fail/stop`, `opt:set/format/exclusive`.
- **`script.ts`** — script exécuté dans le fork/Worker. Instancie le vrai `Logger`, reçoit les messages IPC (Node `process.on('message')`) ou `MessageChannel` (browser `self.addEventListener`). Gère un registre de spinners actifs par ID string. Écriture TTY entièrement dans ce contexte.
- **`proxy.ts`** — proxy main thread. Aucun import du bundle logger — zero overhead côté main thread.
  - Node : `child_process.fork(script.js, { stdio: ['inherit','inherit','inherit','ipc'] })` → fork hérite du fd TTY.
  - Browser : `new Worker(new URL('./script.js', import.meta.url), { type: 'module' })`.
  - `silenceMainLogger()` : duck-typing via `globalThis['$logger-registry']` pour appeler `L.bypass(nullConsole)` en TTY Node sans importer `@lalex/console`.
  - `restoreMainLogger()` : appelé par `terminate()`.
  - Singleton stocké sur `globalThis['$worker-logger-registry']` (survie aux dual-loads).
  - Spinner handles côté main thread : `buildSpinnerHandle(id)` poste `spin:update/success/fail/stop` par ID de corrélation.
  - `cloneArg()` : `structuredClone` + fallback `String()` pour les valeurs non-clonables.
- **`index.ts`** — exports publics nommés : `WorkerLogger`, `WL` (alias), `RootWorkerLogger` (type).

### Build / package

- **`rslib.config.ts`** — 3 entries : `esm0` (main), `esm1` (worker proxy → `dist/worker/index.js`), `esm2` (worker script → `dist/worker/script.js`).
- **`package.json`** — subpath export `"./worker"` → `dist/worker/index.js` + `dist/worker/index.d.ts`.

## Decisions

- Transport Node = `child_process.fork` (pas `worker_threads`) : seule option donnant un vrai fd TTY hérité.
- TTY ownership = convention applicative : le fork est le seul écrivain de stdout ; le main thread est silencié via `bypass(nullConsole)`.
- Pas de `terminate()` sur `WL` (fin de vie = fin du process) ; helper `terminate` exporté depuis `@lalex/console/worker` pour les cas avancés.
- `require('child_process')` obfusqué en `require(\`${'child_process'}\`)` pour éviter le bundling du built-in par les bundlers statiques.

---

### Next step

Tests d'intégration + play script (`play-node.dev.ts`) pour valider TTY spinner via WL.

---

## Implemented

### Timestamp capturé dans le main process

En mode worker, le timestamp est désormais capturé dans le main process (`Date.now()`) au moment de l'appel, puis transmis via IPC et utilisé à la fois pour le flag `date` (rendu pretty/TTY) et pour les sorties structurées (logfmt/json).

**Fichiers modifiés :**

- **`src/worker/protocol.ts`** — `ts: number` ajouté au variant `log` de `WorkerMessage`.
- **`src/worker/index.ts`** — `ts: Date.now()` injecté dans tous les envois `type: 'log'` (level methods, `base['log']`, `patch()`).
- **`src/worker/proxy.ts`** — idem (l'ancien proxy avait les mêmes patterns).
- **`src/worker/worker.ts`** — `msg.ts` passé comme 4e argument à `__logFromMainProcess`.
- **`src/types.ts`** — signature de `__logFromMainProcess` mise à jour (`ts?: number`). Anciennement nommé `__logWithCaller`.
- **`src/logger/index.ts`** — `EmitOptions.ts?: number` ajouté ; `prepareLog` passe `{ type: 'date', ts: options?.ts }` ; `__logFromMainProcess` accepte et propage `ts`.
- **`src/logger/prefix/types.ts`** — `DatePrefix.ts?: number` ajouté.
- **`src/logger/prefix/render.ts`** — les 3 renderers (browser, TTY, console) utilisent `new Date(item.ts)` — `undefined` donne la date courante, pas de conditionnel nécessaire.
- **`src/logger/prefix/serialize.ts`** — `extractFields` détecte `DatePrefix.ts` dans la boucle existante et l'utilise via `new Date(ts ?? Date.now())`.

**Décisions :**

- `ts: number` (pas `Date`) — les nombres traversent `structuredClone` / IPC sans perte de précision.
- `new Date(undefined) === new Date()` : aucun conditionnel dans les renderers, le fallback est natif.
- `__logWithCaller` renommé en `__logFromMainProcess` : nom plus expressif du contexte d'appel.
- Seul le message `log` reçoit `ts` ; les messages `spin:*` ne sont pas concernés (le spinner timestamp n'est pas observable par l'utilisateur).

---

### Next step

Tests d'intégration + play script (`play-node.dev.ts`) pour valider : timestamp correct en JSON/logfmt worker vs timestamp local hors worker.

---

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

---

## Implemented (session: WorkerLogger refactor + public API cleanup)

### `src/types.ts` — new internal types module
- All public types moved here: `LogLevel`, `LogParameters`, `LoggerSpinner`, `SpinnerOptions`, `SpinnerUpdateOptions`, `ExecOptions`, `LogMethod`, `LoggerOptions`, `GenericLogger`, `LimitedLogger`, `Logger`, `RootLogger`, `ScopeLogger`.
- `RootLogger` and `ScopeLogger` expose `__logWithCaller(level, caller, args)` (semi-private convention).
- **Not re-exported** from any barrel — users use `typeof L` / `ReturnType<typeof L.scope>`.

### `src/logger/types.ts` — reduced
- Now only defines `LoggerState` (internal) and re-exports `src/types.ts`.

### `src/utils/stack.ts` — moved from `src/logger/stack.ts`
- `getLogCallerInfo(offset?)` — uses `STACK_OFFSET = 6`, for logger internals.
- `getCallerInfoAt(absoluteDepth)` — absolute depth, for worker proxy (depth = 4).
- `src/logger/stack.ts` deleted.

### Public API cleanup
- `src/utils/index.ts` cleared (removed `export * from './color'`).
- `src/index.ts` simplified to `export * from './logger'` only (`colorize`/`STYLES` no longer public).

### `terminateWorker()` exported function
- Replaces `terminate()` method on `WL`.
- Exported from `@lalex/console/worker`.
- Calls `_terminateTransport?.()` and nulls the closure.
- `RootWorkerLogger` interface deleted; `WL` is typed as `RootLogger`.

### `__logWithCaller` + `callerOverride`
- `callerOverride?: string` added to `EmitOptions` in `logger/index.ts`.
  - `undefined` → normal `getLogCallerInfo()` path.
  - `''` → no caller prefix.
  - non-empty string → used as-is.
- `__logWithCaller(level, caller, args)` implemented in `createCoreLogger()`.

### Worker proxy: correct call-site capture
- `caller?: string` field added to `log` variant in `protocol.ts`.
- `_captureStack` module-level mirror: gates `new Error()` in proxy (zero overhead when `stack = false`).
- `getCallerInfoAt(4)` used in level method closures.
- `formatCallerString()` helper formats the caller info.
- `script.ts` uses `target.__logWithCaller(msg.level, msg.caller, msg.args)`.

### `_enabled` optimization (`proxy.ts`)
- `let _enabled = true` module-level mirror of worker's `enabled` option.
- `if (!_enabled) return` guard at top of `send()` — skips IPC entirely when logger is disabled.
- `opt:set` setter updates `_enabled` when `key === 'enabled'`.

### README
- Removed `## Utilities` section (`colorize`/`STYLES`).
- Added `🧵 Worker Logger` bullet in feature list.
- Added `## Worker Logger` section documenting import, API parity, `WL.stack = true`, `terminateWorker()`, coexistence with `L`.

## Decisions

- `WL` typed as `RootLogger` (not a separate `RootWorkerLogger`) — same public contract, no type duplication.
- `terminateWorker()` as a module-level function rather than a method — lifecycle concern separate from logging API.
- `_captureStack` and `_enabled` as module-level vars (not closures) — mutated synchronously by the `opt:set` setter, read cheaply in every log call.
- `getCallerInfoAt(4)` — absolute depth accounts for: `Error` → `getCallerStack` → `getCallerInfoAt` → `fn` → user call site.

---

## Next step

Runtime validation: run `play-node.dev.ts` with `WL.stack = true` and verify that the call-site displayed in the worker output matches the actual call site in `play-node.dev.ts`.

---

## Implemented (session: patch/unpatch + fallback post-terminateWorker + structural refactor)

### Structural refactoring — decouple worker bundle from `src/logger/`

- **`src/logger/env.ts` → `src/utils/env.ts`** : déplacé sans `systemConsole` (déclaré localement dans `src/logger/index.ts`). Tous les consommateurs mis à jour.
- **`src/levels.ts`** (nouveau) : constantes pures `LEVEL_METHODS`, `LogLevel`, `LogLevels` sans aucune dépendance. Consommateurs : `src/logger/index.ts`, `src/logger/const.ts`, `src/logger/levels.ts`, `src/logger/mixins/limit.ts`, `src/logger/mixins/override.ts`, `src/logger/mixins/spinner/index.ts`, `src/worker/index.ts`.
- **`src/logger/env.ts` supprimé**.
- Résultat vérifié : `dist/worker/src_worker_index_ts.js` = 0 import de `src/logger/`.

### `proxy.ts` → `index.ts` (merge)

- `src/worker/proxy.ts` fusionné dans `src/worker/index.ts` (qui était un barrel d'une ligne).
- `src/worker/proxy.ts` supprimé.
- Exports ajoutés explicitement dans `index.ts` : `terminateWorker`, `workerLoggerSingleton`, `WorkerLogger`, `WL`.

### `script.ts` → `worker.ts`

- Renommé par l'utilisateur.
- Entry `rslib.config.ts` : `{ script: ... }` → `{ worker: ... }`.
- Constante `WORKER_FILENAME = 'worker'` dans `rslib.config.ts` (source of truth).
- `__WORKER_SCRIPT__` injecté via `source.define` dans l'entry `esm1` : `new URL(__WORKER_SCRIPT__, import.meta.url)` dans les deux transports.
- `declare const __WORKER_SCRIPT__: string` dans `src/env.d.ts`.

### `patch()` / `unpatch()`

- `__originalConsoleMethods` capturé au chargement du module (`.bind(console)`).
- `patch()` : remplace `console.log/info → 'info'`, `console.debug → 'debug'`, `console.warn → 'warn'`, `console.error → 'crit'` via `send()`.
- `unpatch()` : restaure depuis `__originalConsoleMethods`.

### Fallback post-`terminateWorker()`

- `_fallbackSend: SendFn | null` au niveau module — vérifié en premier dans `send()`.
- `buildFallbackSend(root)` : interprète tous les types `WorkerMessage`, délègue au `RootLogger` L.
- `activateFallback()` :
  - **Path A** : `globalThis['$logger-registry']?.root` présent → utilisation directe, zéro import.
  - **Path B** : `import(/* webpackChunkName: "fallback-logger" */ '../logger')` dynamique + buffer des messages en attente.
- `terminateWorker()` appelle `activateFallback()` au lieu de `restoreMainLogger()`.
- Laziness vérifiée : `dist/worker/src_worker_index_ts.js` = 0 occurrences d'internals logger ; chunk séparé `dist/worker/fallback-logger.js` (43,5 kB) chargé uniquement après `terminateWorker()`.

### Build output (`dist/worker/`)

```
index.js                 0.11 kB  ← façade Rspack (re-exports)
src_worker_index_ts.js  14.6 kB   ← code proxy réel (chargé immédiatement)
fallback-logger.js      43.5 kB   ← L (chargé uniquement après terminateWorker())
rslib-runtime.js         0.62 kB
worker.js               47.5 kB   ← script worker (fork/Web Worker)
```

Le nom `src_worker_index_ts.js` est imposé par Rspack (split obligatoire dû au `import()` dynamique). Impossible à renommer sans plugin Rspack personnalisé — accepté en l'état.

### Config

- `source.exclude: [/\.dev\.ts$/]` dans `rslib.config.ts` (exclu du bundle).
- `"src/**/*.dev.ts"` dans `tsconfig.json` `exclude` (exclu de `tsc` / génération de déclarations).
- `tools.rspack` : `chunkIds: 'named'`, `chunkFilename: '[name].js'`.

## Decisions

- **Un seul sens** : après `terminateWorker()`, le proxy ne peut plus repasser en mode worker. Pas de retour arrière.
- **Path A / Path B** : si L est déjà chargé (registre présent), pas de dynamic import — fallback immédiat sans coût. Sinon, import dynamique + buffer.
- **`__WORKER_SCRIPT__`** comme constante injectée à la compilation : le nom du fichier worker est défini une seule fois dans `rslib.config.ts` (`WORKER_FILENAME`), puis substitué dans le bundle. Synchronisation garantie.
- **`proxy.ts` → `index.ts`** : le barrel d'une ligne n'avait aucune valeur ; la fusion simplifie la structure.

## Next step

Tests d'intégration dans `play-node.dev.ts` :
1. `WL.patch()` → `console.log('hello')` → doit apparaître via le worker (niveau `info`).
2. `WL.unpatch()` → `console.log('restored')` → console native.
3. `WL.patch()` → `terminateWorker()` → `console.log('after')` → routé via L sans crash.
4. `terminateWorker()` sans que L soit chargé → import dynamique → WL continue via L.

Ensuite : mise à jour du README pour documenter `patch()`, `unpatch()`, et le comportement de bascule de `terminateWorker()`.

---

## Implemented (session: README + play scripts + worker bug fixes + once/limit protocol + flag mirroring)

### README
- Table de mapping `patch()` : `console.log/info → info`, `console.debug → debug`, `console.warn → warn` (pas de ligne `console.error` — décision utilisateur).
- Section `terminateWorker()` : documente le comportement de bascule sur L, TTY Node un-silenced.

### `play-node.dev.ts` + `play-browser.dev.ts`
- Réécriture complète des deux fichiers (10 sections chacun).
- Couverture : tous les niveaux, options, filtrage par niveau, once/limit, scopes, spinners, exec, patch/unpatch.
- Section `terminateWorker` commentée dans `play-node.dev.ts` (TODO — edge cases non résolus).

### Fix — `__WORKER_SCRIPT__` ReferenceError sous tsx
- `tsx` exécute `.ts` directement sans build → `define` jamais appliqué → `ReferenceError`.
- Fix : `const _workerScriptPath = typeof __WORKER_SCRIPT__ !== 'undefined' ? __WORKER_SCRIPT__ : './worker.ts'`.
- Transport Node : `path.resolve(dirname(fileURLToPath(import.meta.url)), _workerScriptPath)` + `execArgv: process.execArgv` si `.ts`.

### Fix — Rspack "critical dependency" warning
- `new URL(_workerScriptPath, import.meta.url)` — argument variable, non analysable statiquement.
- Transport Node : remplacé par `path.resolve` (plus de `new URL`).
- Transport browser : `new URL('./worker.ts', import.meta.url)` — littéral statique.

### Fix — stack traces parasites sur emerg/alert/crit
- `LEVEL_PARAMS[level].trace = console.trace` toujours transmis → frames IPC capturées.
- Fix dans `prepareLog` (`src/logger/index.ts`) : `traceMethod = options?.callerOverride !== undefined ? undefined : trace`.

### Fix — once()/limit() : protocole worker-side
- Ancien comportement : `stubUnusedMethods` retournait `base` pour `once`/`limit` → compteurs inexistants.
- **Nouveau design** : compteurs dans le worker, clé capturée dans le main thread.
- `src/worker/limit.ts` (nouveau) : `createWorkerLimitMixin` — capture la call-site via `new Error().stack[3]` quand aucune clé explicite n'est fournie, envoie `key` + `max` dans le message `'log'`.
- `src/worker/protocol.ts` : `key?: string` et `max?: number` ajoutés au message `'log'`.
- `src/worker/worker.ts` : `handle('log')` délègue à `Logger.once(key)` / `Logger.limit(max, key)` quand `key` est présent.

### Mirroring de tous les flags LoggerOptions (`src/worker/index.ts`)
- Ajout de `_level`, `_pad`, `_color`, `_date`, `_uid`, `_inspect`, `_format`, `_exclusive` aux côtés de `_captureStack` et `_enabled` existants.
- Import de `InspectOptions` depuis `node:util`.
- Tous les setters (`opt:set`, `opt:format`, `opt:exclusive`) mettent à jour leur variable miroir avant l'IPC.
- `activateFallback()` chemins A et B : les 10 flags sont tous appliqués au Logger de fallback.

## Decisions

- `once()`/`limit()` : compteurs dans le worker (source de vérité unique). Le main thread capture seulement la call-site pour construire la clé.
- Variables miroirs au niveau module (singleton) : lecture bon marché dans chaque appel de log, mutation synchrone dans les setters.
- Section `terminateWorker` laissée commentée dans `play-node.dev.ts` : deux TODOs ouverts (`"level":"bound info"` et format non propagé au fallback — les deux résolus par le mirroring des flags).

## TODOs (non bloquants)
- `"level":"bound info"` après terminateWorker : `LEVEL_PARAMS[level].method.name` capture le nom bindé de `console.info`. Fix prévu : map statique `LEVEL_CHANNEL` dans `logger/index.ts`.

## Next step

Décommenter la section `terminateWorker` dans `play-node.dev.ts` et valider le comportement de bascule avec les flags correctement propagés. Corriger le bug `"level":"bound info"` si constaté.

---

## Implemented (session: scope options + play indices + proxy comments)

### Scope level filtering in worker mode

**Problem:** `WL.scope('api', { level: 'warn' })` — the `level` option was silently dropped. The scope was created without any filter, so `api.info(...)` was displayed despite being below the threshold.

**Root cause:** `scope?: string` in the protocol carried only the scope name. Options were never transmitted.

**Fix:**
- **`src/worker/protocol.ts`** — `scope?: string` → `scope?: { name: string; options?: Partial<LoggerOptions> }` in `log` and `spin:start` variants.
- **`src/worker/index.ts`** — `createWorkerScopeProxy` gains `scopeOptions: Partial<LoggerOptions>`. Pre-computes `scopeSeverity = LEVEL_METHODS[scopeOptions.level]` and guards each level method with a cheap integer comparison before sending to IPC. `base['scope']` accepts and forwards `scopeOptions`. `buildFallbackSend` uses `msg.scope.name` / `msg.scope.options`.
- **`src/worker/worker.ts`** — `Logger.scope(msg.scope.name, msg.scope.options)` in `log` and `spin:start` cases.
- **`src/worker/limit.ts`** — `scope: { name: scopeName }`.
- **`src/worker/proxy.ts`** — same changes as `index.ts` (separate legacy file), plus `LEVEL_METHODS` import.

### Play script indices

- **`src/play-node.dev.ts`** — all visible messages prefixed `[1]`–`[30]`, filtered messages prefixed `[X]`.
- **`src/play-browser.dev.ts`** — visible messages `[1]`–`[26]`, filtered messages `[X]`.

### proxy.ts comments

Detailed inline comments added to all function bodies in `src/worker/proxy.ts`:
- `cloneArg`: three fallback tiers explained.
- `createNodeTransport`: `stdio[0..3]` semantics.
- `buildFallbackSend`: why `__logFromMainProcess` is used vs direct call.
- `activateFallback` paths A/B: ordering guarantees, buffer drain, null-out on failure.
- `createWorkerScopeProxy`: pre-computed severity threshold, proxy-side filtering rationale.
- `send` dispatch: three branches (fallback / disabled / queue vs live).
- `stubUnusedMethods`: full docstring explaining each stub's existence.

## Decisions

- **Proxy-side filtering** (before IPC) rather than only worker-side: avoids serialisation overhead for messages that would be discarded anyway. Worker still applies its own filter as the authoritative gate.
- **`scope` as `{ name, options? }` object** (user suggestion): cleaner than two separate fields, self-documenting, forward-compatible if more scope metadata is needed.
- **`scopeSeverity` pre-computed at proxy creation**: cheaper than a string lookup per log call.

## Next step

Run `pnpm run build` to confirm no build errors, then run `play:node` and `play:browser` to verify:
1. `[X]` messages do not appear in output.
2. All numbered messages appear in the correct order.
3. `once` / `limit` counts are respected.

