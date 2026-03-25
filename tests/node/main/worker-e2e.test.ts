import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import type { RootLogger } from '../../../src/types';
import { terminateWorker, WL, WorkerLogger } from '../../../src/worker/index';
import { captureAll } from '../../common/capture.helper';

// Importing L guarantees $logger-registry is populated before any test runs.
// This means activateFallback() will take Path A (synchronous) when
// terminateWorker() is called in the WORK-09 describe block below.

// Type-level verification: WL must satisfy RootLogger.
// If this line produces a TypeScript error, WL's shape does not match RootLogger.
const _typeCheck: RootLogger = WL;
void _typeCheck; // suppress "unused variable" warning

// ── API-01: WL surface parity with L ─────────────────────────────────────────

describe('API-01: WL exposes the same public surface as L', () => {
  const LOG_LEVELS = [
    'emerg',
    'alert',
    'crit',
    'error',
    'warn',
    'notice',
    'success',
    'info',
    'verb',
    'debug',
    'wth',
  ] as const;

  test('WL and WorkerLogger are the same object reference', () => {
    expect(WL).toBe(WorkerLogger);
  });

  test('WL exposes all 11 log-level methods as callable functions', () => {
    for (const level of LOG_LEVELS) {
      expect(
        typeof (WL as unknown as Record<string, unknown>)[level],
        `WL.${level} should be a function`,
      ).toBe('function');
    }
  });

  test('WL.scope is a function', () => {
    expect(typeof WL.scope).toBe('function');
  });

  test('WL exposes the expected complete key set (runtime enumeration)', () => {
    // Authoritative list from the source: every property assigned or defineProperty'd
    // on the proxy base object + option properties.
    const expectedKeys = [
      // Level methods
      'emerg',
      'alert',
      'crit',
      'error',
      'warn',
      'notice',
      'success',
      'info',
      'verb',
      'debug',
      'wth',
      // Generic dispatch
      'log',
      // Scoping and rate-limiting
      'scope',
      'once',
      'limit',
      // One-shot option override
      'options',
      // Console patching
      'patch',
      'unpatch',
      // Console bypass (no-op on proxy but present for interface compliance)
      'bypass',
      'restore',
      // Internal — present on RootLogger interface
      '__logFromMainProcess',
      // Option properties (enumerable via Object.defineProperty)
      'enabled',
      'level',
      'pad',
      'color',
      'date',
      'stack',
      'uid',
      'inspect',
      'format',
      'exclusive',
    ];

    const wlKeys = Object.keys(WL);
    for (const key of expectedKeys) {
      expect(wlKeys, `WL is missing key: "${key}"`).toContain(key);
    }
  });

  test('WL has no extra keys that L lacks (parity check)', () => {
    // WL should not expose keys that L doesn't have — this would mean the
    // proxy leaked internal implementation details into the public surface.
    const lKeys = new Set(Object.keys(L));
    const wlKeys = Object.keys(WL);

    const extraKeys = wlKeys.filter((k) => !lKeys.has(k));
    expect(
      extraKeys,
      `WL has keys not present on L: ${extraKeys.join(', ')}`,
    ).toHaveLength(0);
  });
});

// ── WORK-09: terminateWorker() fallback and idempotence ───────────────────────

describe('terminateWorker() — WORK-09', () => {
  // NOTE: terminateWorker() is called in the first test below.
  // After that call, WL permanently routes through the main-thread fallback logger (L).
  // All tests in this describe depend on (or verify) that post-terminate state.
  // reset.ts beforeEach does NOT undo terminateWorker() — it only resets the logger
  // registry state (scopes, format, rootOptions), which is fine for these tests.

  test('terminateWorker() activates fallback — WL.info() output appears on stdout', () => {
    // Ensure L is in json format so we can parse the output.
    L.format = 'json';

    // This is the first and only call to terminateWorker() in this file.
    // _terminateTransport is null (never assigned) → _terminateTransport?.() is a no-op.
    // activateFallback() runs → finds L in $logger-registry (Path A) → sets _fallbackSend.
    terminateWorker();

    // After termination, WL routes ALL sends through L (the fallback).
    // captureAll() intercepts process.stdout.write synchronously.
    const { stdout } = captureAll(() => {
      WL.info('post-terminate-message');
    });

    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed['severity']).toBe('info');
    expect(parsed['msg']).toBe('post-terminate-message');
  });

  test('WL continues to work after terminateWorker() — all level methods route to L', () => {
    // terminateWorker() was called in the previous test — fallback is active.
    L.format = 'json';

    // warn → console.warn → stderr in Node.js (same as L.warn directly)
    const { stderr } = captureAll(() => {
      WL.warn('fallback-warn-message');
    });

    expect(stderr).toHaveLength(1);
    const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
    expect(parsed['severity']).toBe('warn');
    expect(parsed['msg']).toBe('fallback-warn-message');
  });

  test('terminateWorker() is idempotent — calling it again does not throw', () => {
    // terminateWorker() was already called in the test above.
    // Each call: _terminateTransport?.() → no-op, activateFallback() → re-runs safely.
    // activateFallback() in Path A just overwrites _fallbackSend — no throw.
    expect(() => {
      terminateWorker();
    }).not.toThrow();
  });

  test('WL still produces output after the second idempotent terminateWorker()', () => {
    // Belt-and-suspenders: verify WL still routes to L after the extra terminate call.
    L.format = 'json';

    // error → console.error → stderr in Node.js (same as L.error directly)
    const { stderr } = captureAll(() => {
      WL.error('idempotent-error-message');
    });

    expect(stderr).toHaveLength(1);
    const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
    expect(parsed['severity']).toBe('error');
    expect(parsed['msg']).toBe('idempotent-error-message');
  });
});
