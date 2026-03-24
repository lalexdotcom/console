import { describe, expect, test } from '@rstest/core';
import { L, LogLevels } from '../../../src';
import { captureAll } from '../../helpers/capture';

// reset.ts is registered globally via rstest.config.ts setupFiles.
// beforeEach: registry.scopes is cleared → each test using L.scope() gets a fresh scope.

describe('Scope creation (SCOPE-01)', () => {
  test('L.scope() returns a ScopeLogger with scope property and all level methods', () => {
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

  test('scope level methods emit output with scope name in JSON payload', () => {
    L.format = 'json';
    const s = L.scope('scope-01-emit');
    const { stdout } = captureAll(() => s.info('from scope'));
    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.scope).toBe('scope-01-emit');
    expect(parsed.severity).toBe('info');
    expect(parsed.msg).toBe('from scope');
  });
});

describe('Scope caching (SCOPE-02)', () => {
  test('same scope name returns the cached instance (strict reference equality)', () => {
    const s1 = L.scope('scope-cache-a');
    const s2 = L.scope('scope-cache-a');
    // Object.is equality — same reference, not just structural equality
    expect(s1).toBe(s2);
  });

  test('different scope names return distinct instances', () => {
    const a = L.scope('scope-cache-x');
    const b = L.scope('scope-cache-y');
    expect(a).not.toBe(b);
  });
});

describe('Scope options cascade (SCOPE-03)', () => {
  test('scope inherits root date option when no own override is set', () => {
    L.format = 'pretty';
    L.pad = false;
    L.date = true;
    const s = L.scope('scope-opt-inherit');
    // scope has no own 'date' → root value (true) cascades via computeOptions
    const { stdout } = captureAll(() => s.info('inherited'));
    expect(stdout[0]).toMatch(/\[\d{4}-\d{2}-\d{2}/);
  });

  test('scope own date option overrides root date option', () => {
    L.format = 'pretty';
    L.pad = false;
    L.date = true; // root has date=true
    const s = L.scope('scope-opt-override');
    s.date = false; // scope overrides to false — root option must be ignored
    const { stdout } = captureAll(() => s.info('no-date'));
    expect(stdout[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
  });

  test('scope option override does not affect root', () => {
    L.format = 'pretty';
    L.pad = false;
    const s = L.scope('scope-opt-isolation');
    s.date = true; // only the scope sets date=true
    const { stdout: rootOut } = captureAll(() => L.info('root'));
    // root retains default date=false — scope's date=true must not have leaked
    expect(rootOut[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
  });
});

describe('Scope mutation isolation (SCOPE-04)', () => {
  test('setting level on one scope does not affect a sibling scope', () => {
    const s1 = L.scope('scope-iso-sibling-a');
    const s2 = L.scope('scope-iso-sibling-b');
    s1.level = 'error';
    expect(s1.level).toBe('error');
    // s2 holds its own state.options — s1's mutation must not propagate
    expect(s2.level).toBe('wth'); // default level unaffected
  });

  test('setting level on scope does not affect root', () => {
    const s = L.scope('scope-iso-root');
    s.level = 'warn';
    expect(s.level).toBe('warn');
    // root holds a separate state.options object — must remain at default
    expect(L.level).toBe('wth');
  });
});
