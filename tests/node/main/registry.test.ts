import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../common/capture.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles.
// reset.ts resets: registry.scopes, registry.exclusive, registry.format, registry.rootOptions.
// Exclusive lock is cleared by reset.ts — no afterEach cleanup needed for REG-03 tests.

describe('Singleton identity (REG-01)', () => {
  test('L is the same instance across multiple imports in the same process', async () => {
    // Dynamic import hits the ESM module cache — returns the same module instance.
    const { L: L2 } = await import('../../../src');
    expect(L2).toBe(L); // strict identity: same object reference
  });

  test('L has the expected public API surface', () => {
    // Smoke-check that the re-exported singleton carries all public methods.
    expect(typeof L.info).toBe('function');
    expect(typeof L.scope).toBe('function');
    expect(typeof L.patch).toBe('function');
    expect(typeof L.unpatch).toBe('function');
    expect(typeof L.bypass).toBe('function');
    expect(typeof L.restore).toBe('function');
  });
});

describe('globalThis registry (REG-02)', () => {
  test('globalThis["$logger-registry"] is defined and holds the registry', () => {
    const g = globalThis as Record<string, unknown>;
    const reg = g['$logger-registry'] as Record<string, unknown> | undefined;
    expect(reg).toBeDefined();
    expect(typeof reg?.scopes).toBe('object');
    expect(typeof reg?.rootOptions).toBe('object');
  });

  test('globalThis registry root is the L singleton', () => {
    const g = globalThis as Record<string, unknown>;
    const reg = g['$logger-registry'] as { root: unknown };
    expect(reg.root).toBe(L);
  });

  test('registry format field mirrors L.format', () => {
    L.format = 'logfmt';
    const g = globalThis as Record<string, unknown>;
    const reg = g['$logger-registry'] as { format: string };
    expect(reg.format).toBe('logfmt');
    // reset.ts restores format to 'json' before the next test.
  });
});

describe('Exclusive lock (REG-03)', () => {
  // reset.ts clears registry.exclusive in beforeEach — no manual cleanup needed.

  test('L.exclusive = true silences all scope loggers', () => {
    L.format = 'json';
    const other = L.scope('exclusive-other');
    // Set the exclusive lock: registry.exclusive = L (the root logger).
    L.exclusive = true;
    const { stdout, stderr } = captureAll(() => {
      other.info('silenced');    // other !== registry.exclusive → suppressed
      other.error('also muted'); // same — suppressed
    });
    expect(stdout).toHaveLength(0);
    expect(stderr).toHaveLength(0);
  });

  test('L itself still emits when it holds the exclusive lock', () => {
    L.format = 'json';
    L.exclusive = true;
    // L === registry.exclusive === self → the exclusive guard passes for L.
    const { stdout } = captureAll(() => L.info('still active'));
    expect(stdout).toHaveLength(1);
  });

  test('L.exclusive = false releases the lock and restores other loggers', () => {
    L.format = 'json';
    const other = L.scope('exclusive-release');
    L.exclusive = true;
    // Release: setter with false → registry.exclusive = undefined.
    L.exclusive = false;
    const { stdout } = captureAll(() => other.info('released'));
    expect(stdout).toHaveLength(1); // other can emit again
  });
});

describe('Format getter/setter (REG-04)', () => {
  test('L.format getter returns current format', () => {
    // After reset.ts: format is reset to 'json'.
    expect(L.format).toBe('json');
  });

  test('L.format = "json" produces parseable JSON output', () => {
    L.format = 'json';
    const { stdout } = captureAll(() => L.info('json-test'));
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.severity).toBe('info');
    expect(parsed.msg).toBe('json-test');
  });

  test('L.format = "logfmt" produces key=value output', () => {
    L.format = 'logfmt';
    expect(L.format).toBe('logfmt');
    const { stdout } = captureAll(() => L.info('logfmt-test'));
    expect(stdout[0]).toMatch(/^time=/);
    expect(stdout[0]).toContain('level=info');
    expect(stdout[0]).toContain('severity=info');
  });

  test('L.format = "pretty" produces bracket-prefix output', () => {
    L.format = 'pretty';
    L.pad = false;
    expect(L.format).toBe('pretty');
    const { stdout } = captureAll(() => L.info('pretty-test'));
    expect(stdout[0]).toContain('[INFO]');
  });

  test('format change affects all subsequent calls until changed again', () => {
    L.format = 'logfmt';
    const { stdout: lf } = captureAll(() => L.info('first'));
    expect(lf[0]).toContain('severity=info');
    L.format = 'json';
    const { stdout: js } = captureAll(() => L.info('second'));
    const parsed = JSON.parse(js[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.severity).toBe('info');
  });
});
