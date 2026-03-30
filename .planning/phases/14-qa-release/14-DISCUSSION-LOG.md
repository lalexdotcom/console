# Phase 14: QA + Release — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-03-30

---

## Gray Areas Selected

All 4 areas selected: Checklist de migration, Commande Biome, Bump de version, Périmètre tsc

---

## Area: Checklist de migration

**Q:** Comment générer le checklist de migration (couverture QA-01) ?

| Option | Selected |
|--------|----------|
| Script automatisé — compare git avant/après via les summaries | |
| Audit manuel — MIGRATION-AUDIT.md comparant fichiers supprimés vs nouveaux index.test.ts | |
| **Basé sur les summaries GSD** — agréger les SUMMARY.md des phases 12/13 | ✓ |

**Decision:** Aggreger les SUMMARY.md des phases 12 et 13 — ils listent déjà les fichiers
supprimés et les garanties de couverture. Produire un `MIGRATION-AUDIT.md` en phase dir.

---

## Area: Commande Biome

**Q:** Quelle commande Biome pour QA-03 ?

| Option | Selected |
|--------|----------|
| `check` tel quel — pas de changement au package.json | |
| Ajouter alias `lint` dans package.json | |
| Corriger le ROADMAP | |
| **Free text** | ✓ |

**User response:** "Garde 'check': ca fait le lint et le format en même temps"

**Decision:** `pnpm run check` — couvre lint + format, pas d'alias ajouté.

---

## Area: Bump de version

**Q:** Comment bumper la version à `3.0.2-rc.0` ?

| Option | Selected |
|--------|----------|
| **Édition directe de `package.json`** (VERSION-03 impose une valeur exacte) | ✓ |
| `pnpm run version` (upversion interactif) | |

**Decision:** Édition directe en dernier, après tous les gates passés.

---

## Area: Périmètre tsc

**Q:** Périmètre du check `tsc --noEmit` (QA-02) ?

| Option | Selected |
|--------|----------|
| `src/` seulement | |
| **`src/` + `tests/`** | ✓ |

**Follow-up Q:** Comment inclure `tests/` dans tsc ?

| Option | Selected |
|--------|----------|
| `tsconfig.test.json` dédié | |
| **Étendre `tsconfig.json` existant** | ✓ |

**Discovered:** `tsconfig.json` inclut déjà `"tests"` dans son `include` array —
aucune modification nécessaire. `tsc --noEmit` est déjà propre (0 erreurs).

---

*Audit trail generated: 2026-03-30*
