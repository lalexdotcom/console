import { beforeEach, describe, expect, test } from '@rstest/core';
import { L } from '../../src';
import type { TestAdapter } from './adapter';

/**
 * Parameterised suite covering option getters/setters, cascade, level strictness,
 * and util.inspect forwarding (OPT-01 through OPT-04).
 *
 * Browser guards:
 * - OPT-01 pad default: L.pad defaults to false in browser (isNode=false)
 * - OPT-04 util.inspect: util.inspect is Node-only; these tests skip in browser
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  describe(`options (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
    });

    // OPT-01: getter/setter round-trips for all root logger options
    describe('Option getters/setters (OPT-01)', () => {
      test('enabled: default=true, setter/getter round-trip', async () => {
        expect(L.enabled).toBe(true); // default
        L.enabled = false;
        expect(L.enabled).toBe(false);
        L.enabled = true;
        expect(L.enabled).toBe(true);
      });

      test('level: default=wth (most permissive), setter/getter round-trip', async () => {
        expect(L.level).toBe('wth'); // DEFAULT_LOGGER_OPTIONS level = MOST_PERMISSIVE = wth(10)
        L.level = 'error';
        expect(L.level).toBe('error');
        L.level = 'info';
        expect(L.level).toBe('info');
      });

      test('pad: default=true in Node, setter/getter round-trip', async () => {
        // Default pad=true only in Node (isNode=true); browser (isNode=false) defaults to false
        if (!adapter.name.startsWith('browser')) {
          expect(L.pad).toBe(true);
        }
        L.pad = false;
        expect(L.pad).toBe(false);
        L.pad = true;
        expect(L.pad).toBe(true);
      });

      test('color: default=true, setter/getter round-trip', async () => {
        expect(L.color).toBe(true);
        L.color = false;
        expect(L.color).toBe(false);
      });

      test('date: default=false, setter/getter round-trip', async () => {
        expect(L.date).toBe(false);
        L.date = true;
        expect(L.date).toBe(true);
      });

      test('stack: default=false, setter/getter round-trip', async () => {
        expect(L.stack).toBe(false);
        L.stack = true;
        expect(L.stack).toBe(true);
      });

      test('uid: default=false, setter/getter round-trip', async () => {
        expect(L.uid).toBe(false);
        L.uid = true;
        expect(L.uid).toBe(true);
      });

      test('inspect: default depth=5, setter/getter round-trip', async () => {
        expect(L.inspect).toMatchObject({ depth: 5 }); // DEFAULT_INSPECT_OPTIONS
        L.inspect = { depth: 2 };
        expect(L.inspect).toMatchObject({ depth: 2 });
      });
    });

    // OPT-02: own > root > default option cascade
    describe('Option cascade: own > root > defaults (OPT-02)', () => {
      test('root option applies to scope with no own override', async () => {
        L.date = true; // rootOptions.date = true
        const s = L.scope('cascade-inherit');
        // scope has no own 'date' setting → root value (true) cascades
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => s.info('inherited'));
        expect(lines[0]).toMatch(/\[\d{4}-\d{2}-\d{2}/); // date bracket present
      });

      test('own scope option overrides root option', async () => {
        L.date = true; // rootOptions.date = true
        const s = L.scope('cascade-override');
        s.date = false; // scope own option: false
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => s.info('overridden'));
        expect(lines[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/); // no date bracket
      });

      test('own scope option does not mutate root option', async () => {
        L.date = false;
        const s = L.scope('cascade-no-leak');
        s.date = true;
        expect(L.date).toBe(false); // root unchanged
        expect(s.date).toBe(true);  // scope has own value
      });

      test('default applies when neither scope nor root have the option set', async () => {
        // After reset: rootOptions has no 'stack' key → cascades to DEFAULT(false)
        const s = L.scope('cascade-default');
        expect(s.stack).toBe(false); // from DEFAULT_LOGGER_OPTIONS
      });
    });

    // OPT-03: level filtering — strictest (lowest severity) wins between root and scope
    describe('Level cascade: strictest (lowest severity) wins (OPT-03)', () => {
      // LEVEL_METHODS numeric severity: emerg=0, error=3, warn=4, info=7, wth=10
      // Strictest = lowest number. Filtering: if configuredSeverity < messageSeverity → suppress.

      test('root level=error(3) dominates scope level=warn(4): warn suppressed', async () => {
        L.format = 'json';
        L.level = 'error'; // root strict: 3
        const s = L.scope('level-root-strict');
        s.level = 'warn';  // scope less strict: 4 → root(3) wins
        // warn(4) > error(3) → suppressed
        const warnOut = await adapter.capture(() => s.warn('suppressed'));
        expect(warnOut).toHaveLength(0);
        // error(3) = configured → passes
        const errOut = await adapter.capture(() => s.error('shown'));
        expect(errOut).toHaveLength(1);
      });

      test('scope level=error(3) with permissive root: error filtering applied', async () => {
        L.format = 'json';
        // root level = wth(10) default — most permissive
        const s = L.scope('level-scope-strict');
        s.level = 'error'; // scope is strict: 3
        // warn(4) > error(3) → suppressed by scope
        const warnOut = await adapter.capture(() => s.warn('suppressed'));
        expect(warnOut).toHaveLength(0);
        // error(3) = configured → passes
        const errOut = await adapter.capture(() => s.error('shown'));
        expect(errOut).toHaveLength(1);
      });

      test('when root and scope both define level, strictest wins', async () => {
        L.format = 'json';
        L.level = 'warn'; // root: 4
        const s = L.scope('level-both-set');
        s.level = 'error'; // scope: 3 — scope is stricter
        // Effective = error(3). warn(4) suppressed.
        const lines = await adapter.capture(() => s.warn('suppressed'));
        expect(lines).toHaveLength(0);
      });
    });

    // OPT-04: util.inspect forwarding — Node only (skipped in browser)
    describe('util.inspect forwarding (OPT-04)', () => {
      // In Node mode, non-string args in callArgs are pre-processed by util.inspect
      // before reaching the serializer. Inspect options come from computeOptions.inspect.

      test('inspect depth=0 limits object rendering to top level', async () => {
        if (adapter.name.startsWith('browser')) return; // util.inspect not available in browser
        L.format = 'pretty';
        L.pad = false;
        L.inspect = { depth: 0 };
        // With depth=0: { outer: { inner: 'value' } } → '{ outer: [Object] }'
        const nested = { outer: { inner: 'value' } };
        const lines = await adapter.capture(() => L.info(nested));
        expect(lines[0]).toContain('[Object]');
        expect(lines[0]).not.toContain('inner'); // inner not rendered at depth 0
      });

      test('inspect depth=5 (default) renders nested objects fully', async () => {
        if (adapter.name.startsWith('browser')) return; // util.inspect not available in browser
        L.format = 'pretty';
        L.pad = false;
        // L.inspect defaults to { depth: 5 } — deep objects should show inner fields
        const nested = { outer: { inner: 'value' } };
        const lines = await adapter.capture(() => L.info(nested));
        expect(lines[0]).toContain('inner');
        expect(lines[0]).toContain('value');
      });
    });
  });
}
