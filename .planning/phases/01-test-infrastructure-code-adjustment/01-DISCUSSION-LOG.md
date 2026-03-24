# Phase 1: Test Infrastructure & Code Adjustment - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-24
**Phase:** 1-Test Infrastructure & Code Adjustment
**Areas discussed:** Test file organization, Helper architecture, Browser test strategy, Test isolation approach

---

## Test File Organization

### Q1: Where should test files live?

| Option | Description | Selected |
|--------|-------------|----------|
| Co-located in src/ | src/logger/index.test.ts next to src/logger/index.ts — easy to find, visible in folder. Already excluded from build via Rslib source.exclude | |
| Dedicated tests/ directory | tests/logger/index.test.ts at project root — clean separation, src/ stays production-only. Needs path alias or relative imports. | ✓ |
| Hybrid: tests/ for Node, co-located for browser | tests/ at root for Node tests, src/ co-located for browser tests | |

**User's choice:** Dedicated tests/ directory
**Notes:** None

### Q2: Within tests/, how should files be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Mirror src/ structure | tests/logger/index.test.ts, tests/logger/prefix/render.test.ts — mirrors src/ structure exactly | |
| Flat by concern | tests/levels.test.ts, tests/dispatch.test.ts — flat list, each file covers one concern | |
| Grouped by runtime mode | tests/core/, tests/browser/, tests/worker/ — grouped by runtime environment | ✓ |

**User's choice:** Grouped by runtime environment AND mode (free text)
**Notes:** User specified: `browser/main`, `browser/worker`, `node/main`, `node/worker`, `tty/main`, `tty/worker`

### Q3: Where to place shared utilities?

| Option | Description | Selected |
|--------|-------------|----------|
| tests/helpers/ | Dossier dédié aux utilitaires partagés (capture, reset, fixtures) | ✓ |
| tests/_utils/ | Convention underscore pour signaler que ce n'est pas des tests | |
| tests/shared/ | Nom explicite pour les ressources transversales | |

**User's choice:** tests/helpers/
**Notes:** None

---

## Helper Architecture

### Q1: How to structure helpers?

| Option | Description | Selected |
|--------|-------------|----------|
| Un fichier par concern | stdout.ts, console-spy.ts, reset.ts, etc. — imports ciblés, chaque helper est indépendant | ✓ |
| Fichier unique index.ts | Simple, un seul import pour les tests | |
| Un fichier par environnement | node-helpers.ts, browser-helpers.ts — regroupe par plateforme | |

**User's choice:** Un fichier par concern
**Notes:** None

### Q2: What pattern for helpers?

| Option | Description | Selected |
|--------|-------------|----------|
| Wrapper fonctionnel | Fonctions pures : captureStdout(() => { ... }) retourne le output capturé — pas d'état partagé, composable | ✓ |
| Objet avec lifecycle | Objets avec setup/teardown : const capture = createCapture(); capture.start(); ... capture.stop(); capture.output | |
| You decide | Laisse le choix au planificateur selon le besoin de chaque helper | |

**User's choice:** Wrapper fonctionnel
**Notes:** None

---

## Browser Test Strategy

### Q1: Which browsers?

| Option | Description | Selected |
|--------|-------------|----------|
| Chromium only (headless) | Rapide, suffisant pour valider console.log/%c CSS, groupCollapsed, etc. | ✓ |
| Multi-browser (Chromium + Firefox) | Couvre les différences de devtools entre navigateurs | |
| Full matrix | Tous les navigateurs (Chromium, Firefox, WebKit) — couverture maximale mais plus lent | |

**User's choice:** Chromium only (headless)
**Notes:** None

### Q2: How to capture browser output?

| Option | Description | Selected |
|--------|-------------|----------|
| Console method spying | Spy sur console.log/warn/error dans le contexte browser headless | ✓ |
| CDP console capture | Capture de la sortie réelle du navigateur via Playwright CDP protocol | |
| You decide | Laisse le choix au chercheur/planificateur | |

**User's choice:** Console method spying
**Notes:** None

---

## Test Isolation Approach

### Q1: How to isolate the singleton?

| Option | Description | Selected |
|--------|-------------|----------|
| Reset function exportée | Fonction resetRegistry() qui nettoie globalThis et recrée un logger vierge | |
| Fixture automatique via beforeEach | Fixture rstest (beforeEach/afterEach) qui isole automatiquement chaque test | ✓ |
| Les deux combinés | Fonction reset dans helpers + beforeEach qui l'appelle — flexible pour les cas spéciaux | |

**User's choice:** Fixture automatique via beforeEach
**Notes:** None

### Q2: What reset depth?

| Option | Description | Selected |
|--------|-------------|----------|
| Full reset (registry + state + scopes) | globalThis registry, logger state, options, scopes | |
| Registry reset only | Recréer le singleton suffit, les options reviennent aux défauts | |
| You decide | Laisse le planificateur décider de la profondeur du reset | ✓ |

**User's choice:** You decide
**Notes:** Agent has discretion on reset depth

---

## Agent's Discretion

- Reset depth (registry only vs. registry + state + scopes + console patch)

## Deferred Ideas

None — discussion stayed within phase scope.
