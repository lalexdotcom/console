import { beforeEach, describe, expect, test } from '@rstest/core';
import { L, LogLevels } from '../../src';
import type { TestAdapter } from './adapter';

/**
 * Parameterised suite covering scope creation, caching, option cascade, and isolation
 * (SCOPE-01 through SCOPE-04). Receives a TestAdapter — no concrete adapter dependency.
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  describe(`scopes (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
    });

    // SCOPE-01: scope creation API and basic emission
    describe('Scope creation (SCOPE-01)', () => {
      test('L.scope() returns a ScopeLogger with scope property and all level methods', async () => {
        const s = L.scope('scope-01-api');
        // scope property must equal the name passed to L.scope()
        expect(s.scope).toBe('scope-01-api');
        // all 11 level methods must be functions
        for (const level of LogLevels) {
          expect(typeof s[level]).toBe('function');
        }
        // mixin methods must be present
        expect(typeof s.once).toBe('function');
        expect(typeof s.limit).toBe('function');
        expect(typeof s.options).toBe('function');
      });

      test('scope level methods emit output with scope name in JSON payload', async () => {
        if (adapter.name.startsWith('browser')) return; // browser output is %c CSS, not JSON
        L.format = 'json';
        const s = L.scope('scope-01-emit');
        const lines = await adapter.capture(() => s.info('from scope'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.scope).toBe('scope-01-emit');
        expect(parsed.severity).toBe('info');
        expect(parsed.msg).toBe('from scope');
      });
    });

    // SCOPE-02: scope caching — same name returns same reference
    describe('Scope caching (SCOPE-02)', () => {
      test('same scope name returns the cached instance (strict reference equality)', async () => {
        const s1 = L.scope('scope-cache-a');
        const s2 = L.scope('scope-cache-a');
        // Object.is equality — same reference, not just structural equality
        expect(s1).toBe(s2);
      });

      test('different scope names return distinct instances', async () => {
        const a = L.scope('scope-cache-x');
        const b = L.scope('scope-cache-y');
        expect(a).not.toBe(b);
      });
    });

    // SCOPE-03: option cascade — scope inherits and can override root options
    describe('Scope options cascade (SCOPE-03)', () => {
      test('scope inherits root date option when no own override is set', async () => {
        L.format = 'pretty';
        L.pad = false;
        L.date = true;
        const s = L.scope('scope-opt-inherit');
        // scope has no own 'date' → root value (true) cascades via computeOptions
        const lines = await adapter.capture(() => s.info('inherited'));
        expect(lines[0]).toMatch(/\[\d{4}-\d{2}-\d{2}/);
      });

      test('scope own date option overrides root date option', async () => {
        L.format = 'pretty';
        L.pad = false;
        L.date = true; // root has date=true
        const s = L.scope('scope-opt-override');
        s.date = false; // scope overrides to false — root option must be ignored
        const lines = await adapter.capture(() => s.info('no-date'));
        expect(lines[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      });

      test('scope option override does not affect root', async () => {
        L.format = 'pretty';
        L.pad = false;
        const s = L.scope('scope-opt-isolation');
        s.date = true; // only the scope sets date=true
        const lines = await adapter.capture(() => L.info('root'));
        // root retains default date=false — scope's date=true must not have leaked
        expect(lines[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      });
    });

    // SCOPE-04: mutation isolation between sibling scopes and root
    describe('Scope mutation isolation (SCOPE-04)', () => {
      test('setting level on one scope does not affect a sibling scope', async () => {
        const s1 = L.scope('scope-iso-sibling-a');
        const s2 = L.scope('scope-iso-sibling-b');
        s1.level = 'error';
        expect(s1.level).toBe('error');
        // s2 holds its own state.options — s1's mutation must not propagate
        expect(s2.level).toBe('wth'); // default level unaffected
      });

      test('setting level on scope does not affect root', async () => {
        const s = L.scope('scope-iso-root');
        s.level = 'warn';
        expect(s.level).toBe('warn');
        // root holds a separate state.options object — must remain at default
        expect(L.level).toBe('wth');
      });
    });
  });
}
