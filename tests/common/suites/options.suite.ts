import { expect } from '@rstest/core';
import { L } from '../../../src';
import type { LogOutput } from '../output';
import type { Suite } from './suite';

/**
 * Declarative suite covering option getters/setters, cascade, level strictness,
 * and util.inspect forwarding (OPT-01 through OPT-04).
 *
 * Browser guards (adapter.name.startsWith('browser')) are preserved inline
 * per test — some OPT-01 and all OPT-04 tests skip in browser.
 */
export const optionsSuite: Suite = {
  name: 'options',
  description:
    'Option getters/setters, cascade, level cascade, util.inspect (OPT-01/02/03/04)',
  tests: [
    // OPT-01: getter/setter round-trips
    {
      name: 'enabled: default=true, setter/getter round-trip',
      run(_adapter) {
        expect(L.enabled).toBe(true);
        L.enabled = false;
        expect(L.enabled).toBe(false);
        L.enabled = true;
        expect(L.enabled).toBe(true);
      },
      check: () => {},
    },
    {
      name: 'level: default=wth (most permissive), setter/getter round-trip',
      run(_adapter) {
        expect(L.level).toBe('wth');
        L.level = 'error';
        expect(L.level).toBe('error');
        L.level = 'info';
        expect(L.level).toBe('info');
      },
      check: () => {},
    },
    {
      name: 'pad: default=true in Node, setter/getter round-trip',
      run(adapter) {
        // Default pad=true only in Node (isNode=true); browser (isNode=false) defaults to false
        if (!adapter.name.startsWith('browser')) {
          expect(L.pad).toBe(true);
        }
        L.pad = false;
        expect(L.pad).toBe(false);
        L.pad = true;
        expect(L.pad).toBe(true);
      },
      check: () => {},
    },
    {
      name: 'color: default=true, setter/getter round-trip',
      run(_adapter) {
        expect(L.color).toBe(true);
        L.color = false;
        expect(L.color).toBe(false);
      },
      check: () => {},
    },
    {
      name: 'date: default=false, setter/getter round-trip',
      run(_adapter) {
        expect(L.date).toBe(false);
        L.date = true;
        expect(L.date).toBe(true);
      },
      check: () => {},
    },
    {
      name: 'stack: default=false, setter/getter round-trip',
      run(_adapter) {
        expect(L.stack).toBe(false);
        L.stack = true;
        expect(L.stack).toBe(true);
      },
      check: () => {},
    },
    {
      name: 'uid: default=false, setter/getter round-trip',
      run(_adapter) {
        expect(L.uid).toBe(false);
        L.uid = true;
        expect(L.uid).toBe(true);
      },
      check: () => {},
    },
    {
      name: 'inspect: default depth=5, setter/getter round-trip',
      run(_adapter) {
        expect(L.inspect).toMatchObject({ depth: 5 });
        L.inspect = { depth: 2 };
        expect(L.inspect).toMatchObject({ depth: 2 });
      },
      check: () => {},
    },
    // OPT-02: own > root > default option cascade
    {
      name: 'root option applies to scope with no own override',
      run(_adapter) {
        L.date = true;
        const s = L.scope('cascade-inherit');
        L.format = 'pretty';
        L.pad = false;
        s.info('inherited');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    {
      name: 'own scope option overrides root option',
      run(_adapter) {
        L.date = true;
        const s = L.scope('cascade-override');
        s.date = false;
        L.format = 'pretty';
        L.pad = false;
        s.info('overridden');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    {
      name: 'own scope option does not mutate root option',
      run(_adapter) {
        L.date = false;
        const s = L.scope('cascade-no-leak');
        s.date = true;
        expect(L.date).toBe(false);
        expect(s.date).toBe(true);
      },
      check: () => {},
    },
    {
      name: 'default applies when neither scope nor root have the option set',
      run(_adapter) {
        const s = L.scope('cascade-default');
        expect(s.stack).toBe(false);
      },
      check: () => {},
    },
    // OPT-03: level filtering — strictest (lowest severity) wins
    {
      name: 'root level=error(3) dominates scope level=warn(4): warn suppressed',
      run(_adapter) {
        L.format = 'json';
        L.level = 'error';
        const s = L.scope('level-root-strict');
        s.level = 'warn';
        s.warn('suppressed'); // warn(4) > error(3) → suppressed
        s.error('shown');     // error(3) = configured → passes
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        // JSON/logfmt adapters set entries[0].level; TTY adapters embed ERROR in raw
        if (entries[0].level !== undefined) {
          expect(entries[0].level).toBe('error');
        } else {
          expect(entries[0].raw.replace(/\x1b\[[0-9;]*m/g, '')).toMatch(/ERROR/i);
        }
      },
    },
    {
      name: 'scope level=error(3) with permissive root: error filtering applied',
      run(_adapter) {
        L.format = 'json';
        const s = L.scope('level-scope-strict');
        s.level = 'error';
        s.warn('suppressed'); // warn(4) > error(3) → suppressed by scope
        s.error('shown');     // error(3) = configured → passes
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        // JSON/logfmt adapters set entries[0].level; TTY adapters embed ERROR in raw
        if (entries[0].level !== undefined) {
          expect(entries[0].level).toBe('error');
        } else {
          expect(entries[0].raw.replace(/\x1b\[[0-9;]*m/g, '')).toMatch(/ERROR/i);
        }
      },
    },
    {
      name: 'when root and scope both define level, strictest wins',
      run(_adapter) {
        L.format = 'json';
        L.level = 'warn';
        const s = L.scope('level-both-set');
        s.level = 'error';
        s.warn('suppressed'); // effective = error(3), warn(4) suppressed
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(0);
      },
    },
    // OPT-04: util.inspect forwarding — Node only
    {
      name: 'inspect depth=0 limits object rendering to top level',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        L.inspect = { depth: 0 };
        L.info({ outer: { inner: 'value' } });
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return; // browser adapter skipped in run()
        expect(entries[0].raw).toContain('[Object]');
        expect(entries[0].raw).not.toContain('inner');
      },
    },
    {
      name: 'inspect depth=5 (default) renders nested objects fully',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        L.info({ outer: { inner: 'value' } });
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return; // browser adapter skipped in run()
        expect(entries[0].raw).toContain('inner');
        expect(entries[0].raw).toContain('value');
      },
    },
  ],
};
