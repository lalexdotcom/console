---
phase: 14-qa-release
plan: P02
type: execute
wave: 1
depends_on: []
files_modified:
  - biome.json
autonomous: true
requirements:
  - QA-03

must_haves:
  truths:
    - "pnpm run check exits with 0 errors and 0 warnings"
    - "biome.json has .github/get-shit-done/** excluded from Biome linting"
    - "biome.json retains all existing rules (linter.rules.recommended, suspicious overrides)"
  artifacts:
    - path: "biome.json"
      provides: "Biome configuration with GSD tooling excluded"
  key_links:
    - from: "biome.json"
      to: ".github/get-shit-done/bin/lib/"
      via: "files.ignore pattern"
      pattern: "get-shit-done"
---

<objective>
Resolve all 6 Biome errors and 36 warnings so that `pnpm run check` exits clean (0 errors,
0 warnings). All issues are in .github/get-shit-done/bin/lib/*.cjs — third-party GSD
framework files that are not part of the project source.

The fix is to add the GSD tooling directory to Biome's ignore list in biome.json.
This is the safe-fix approach aligned with D-03: "Biome safe-fix mode only — no unsafe coercions."
Modifying generated CJS files with --unsafe would risk breaking the GSD tooling runtime.

Output: Updated biome.json with .github/get-shit-done/** excluded.
</objective>

<execution_context>
@.github/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/phases/14-qa-release/14-CONTEXT.md
@.planning/ROADMAP.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add .github/get-shit-done/** to Biome files.ignore</name>
  <files>biome.json</files>
  <read_first>
    - biome.json — read the FULL current content before editing to understand the exact structure
  </read_first>
  <action>
Add a `files` section to biome.json that ignores the GSD tooling directory.
The `files` key goes at the top level alongside `linter`, `formatter`, `vcs`, etc.

The resulting biome.json must include:

```json
"files": {
  "ignore": [
    ".github/get-shit-done/**"
  ]
}
```

Add this as a new top-level key in biome.json. Do NOT modify the `linter`, `formatter`,
`javascript`, `css`, `vcs`, or `assist` sections — preserve all existing settings exactly.

The full updated biome.json should be:
```json
{
  "$schema": "./node_modules/@biomejs/biome/configuration_schema.json",
  "files": {
    "ignore": [
      ".github/get-shit-done/**"
    ]
  },
  "assist": {
    "actions": {
      "source": {
        "organizeImports": "on"
      }
    }
  },
  "vcs": {
    "enabled": true,
    "clientKind": "git",
    "useIgnoreFile": true
  },
  "formatter": {
    "indentStyle": "space"
  },
  "javascript": {
    "formatter": {
      "quoteStyle": "single"
    }
  },
  "css": {
    "parser": {
      "cssModules": true
    }
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "suspicious": {
        "noControlCharactersInRegex": "info",
        "noAssignInExpressions": "info"
      }
    }
  }
}
```
  </action>
  <verify>
    <automated>grep -A3 '"files"' biome.json</automated>
    <automated>pnpm run check 2>&1 | tail -5</automated>
  </verify>
  <done>
    - grep shows `"ignore"` array containing `.github/get-shit-done/**`
    - `pnpm run check` exits with "Found 0 errors." (or clean exit / no errors line)
    - `pnpm run check` output does NOT contain "Found [1-9]" before "errors"</done>
</task>

</tasks>

<verification>
- [ ] biome.json contains `files.ignore` with `.github/get-shit-done/**`
- [ ] All pre-existing biome.json settings are preserved (linter, formatter, vcs, assist, javascript, css)
- [ ] `pnpm run check` exits with 0 errors
- [ ] `pnpm run check` exits with 0 warnings (or only infos which are not blocking)
- [ ] src/ and tests/ source files are still checked by Biome (not accidentally excluded)
</verification>
