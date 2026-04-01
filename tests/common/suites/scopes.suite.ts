import { expect } from '@rstest/core';
import { L, LogLevels } from '../../../src';
import type { LogOutput } from '../output';
import type { Suite } from './suite';

/**
 * Declarative suite covering scope creation, caching, option cascade, and isolation
 * (SCOPE-01 through SCOPE-04).
 */
export const scopesSuite: Suite = {
  name: 'scopes',
  description:
    'Scope creation, caching, option cascade, and mutation isolation (SCOPE-01/02/03/04)',
  tests: [
    // SCOPE-01: scope creation API and basic emission
    {
      name: 'L.scope() returns a ScopeLogger with scope property and all level methods',
      run(_adapter) {
        const s = L.scope('scope-01-api');
        expect(s.scope).toBe('scope-01-api');
        for (const level of LogLevels) {
          expect(typeof s[level]).toBe('function');
        }
        expect(typeof s.once).toBe('function');
        expect(typeof s.limit).toBe('function');
        expect(typeof s.options).toBe('function');
      },
      check: () => {},
    },
    {
      name: 'scope level methods emit output with scope name in JSON payload',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        const s = L.scope('scope-01-emit');
        s.info('from scope');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return; // browser adapter skipped in run()
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe('scope-01-emit');
        expect(entries[0].level).toBe('info');
        expect(entries[0].msg).toBe('from scope');
      },
    },
    // SCOPE-02: scope caching — same name returns same reference
    {
      name: 'same scope name returns the cached instance (strict reference equality)',
      run(_adapter) {
        const s1 = L.scope('scope-cache-a');
        const s2 = L.scope('scope-cache-a');
        expect(s1).toBe(s2);
      },
      check: () => {},
    },
    {
      name: 'different scope names return distinct instances',
      run(_adapter) {
        const a = L.scope('scope-cache-x');
        const b = L.scope('scope-cache-y');
        expect(a).not.toBe(b);
      },
      check: () => {},
    },
    // SCOPE-03: option cascade — scope inherits and can override root options
    {
      name: 'scope inherits root date option when no own override is set',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.date = true;
        const s = L.scope('scope-opt-inherit');
        s.info('inherited');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    {
      name: 'scope own date option overrides root date option',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.date = true;
        const s = L.scope('scope-opt-override');
        s.date = false;
        s.info('no-date');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    {
      name: 'scope option override does not affect root',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        const s = L.scope('scope-opt-isolation');
        s.date = true;
        L.info('root');
      },
      check(entries: LogOutput[]) {
        // root retains default date=false — scope's date=true must not have leaked
        expect(entries[0].raw).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    // SCOPE-04: mutation isolation between sibling scopes and root
    {
      name: 'setting level on one scope does not affect a sibling scope',
      run(_adapter) {
        const s1 = L.scope('scope-iso-sibling-a');
        const s2 = L.scope('scope-iso-sibling-b');
        s1.level = 'error';
        expect(s1.level).toBe('error');
        expect(s2.level).toBe('wth');
      },
      check: () => {},
    },
    {
      name: 'setting level on scope does not affect root',
      run(_adapter) {
        const s = L.scope('scope-iso-root');
        s.level = 'warn';
        expect(s.level).toBe('warn');
        expect(L.level).toBe('wth');
      },
      check: () => {},
    },
  ],
};
