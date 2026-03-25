import { Console } from 'node:console';
import { Writable } from 'node:stream';
import { afterEach, describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../common/capture.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles.
//
// CRITICAL: reset.ts does NOT reset console patch state or bypass state.
// Every test that calls L.patch() MUST call L.unpatch() in cleanup.
// Every test that calls L.bypass() MUST call L.restore() in cleanup.
// Use try/finally in each test body for reliable cleanup.

// Global safety net: unpatch and restore after every test in this file,
// even if a test assertion throws before reaching the cleanup.
afterEach(() => {
  L.unpatch();
  L.restore();
});

/**
 * Creates a real Console backed by a mock Writable stream.
 * Required because emitConsole calls method.apply(activeConsole, args) where
 * method is the captured console.info/warn/error — these are Console prototype
 * methods that use `this._stdout`/`_stderr` internally. A plain object spy
 * would throw; a real Console instance works correctly.
 *
 * @returns spy — a Console instance; lines — captured output lines (trimmed).
 */
function makeStreamSpy() {
  const lines: string[] = [];
  const ws = new Writable({
    write(chunk, _enc, cb) {
      lines.push(chunk.toString().trimEnd());
      cb();
    },
  });
  // Both stdout and stderr route to the same collector for simplicity.
  const spy = new Console(ws, ws);
  return { spy, lines };
}

describe('patch() (CONS-01)', () => {
  test('patch() replaces console.log with logger dispatch — output is structured JSON', () => {
    L.format = 'json';
    L.patch();
    try {
      const { stdout } = captureAll(() => console.log('patched via console'));
      expect(stdout).toHaveLength(1);
      const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
      // console.log is remapped to L.info by patch() → severity = 'info'
      expect(parsed.severity).toBe('info');
      expect(parsed.msg).toBe('patched via console');
    } finally {
      L.unpatch();
    }
  });

  test('patch() replaces console.error — output lands on stderr with severity crit', () => {
    L.format = 'json';
    L.patch();
    try {
      // patch() maps console.error → L.crit (see createRootMixin.patch() in src/logger/index.ts)
      const { stderr } = captureAll(() => console.error('error via console'));
      expect(stderr).toHaveLength(1);
      const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
      expect(parsed.severity).toBe('crit');
      expect(parsed.msg).toBe('error via console');
    } finally {
      L.unpatch();
    }
  });

  test('patch() replaces console.warn — output lands on stderr with severity warn', () => {
    L.format = 'json';
    L.patch();
    try {
      const { stderr } = captureAll(() => console.warn('warning via console'));
      expect(stderr).toHaveLength(1);
      const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
      expect(parsed.severity).toBe('warn');
      expect(parsed.msg).toBe('warning via console');
    } finally {
      L.unpatch();
    }
  });
});

describe('unpatch() (CONS-02)', () => {
  test('unpatch() restores original console.log behavior — output is plain text, not JSON', () => {
    L.patch();
    L.unpatch();
    const { stdout } = captureAll(() => console.log('raw output'));
    expect(stdout).toHaveLength(1);
    // Plain console.log does not emit valid JSON.
    expect(() => JSON.parse(stdout[0].trimEnd())).toThrow();
  });

  test('unpatch() is idempotent — calling twice does not throw', () => {
    L.patch();
    L.unpatch();
    expect(() => L.unpatch()).not.toThrow();
  });
});

describe('bypass() (CONS-03)', () => {
  test('bypass(spy) redirects L.info output to spy — nothing written to process.stdout', () => {
    L.format = 'json';
    const { spy, lines } = makeStreamSpy();
    L.bypass(spy);
    try {
      // captureAll intercepts process.stdout/stderr; bypass routes output to spy's internal stream.
      const { stdout, stderr } = captureAll(() => L.info('bypassed'));
      expect(stdout).toHaveLength(0);
      expect(stderr).toHaveLength(0);
      // Spy's Writable stream received the serialized log line.
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(parsed.msg).toBe('bypassed');
      expect(parsed.severity).toBe('info');
    } finally {
      L.restore();
    }
  });

  test('bypass() routes error-level output to spy error stream', () => {
    L.format = 'json';
    const { spy, lines } = makeStreamSpy();
    L.bypass(spy);
    try {
      captureAll(() => L.error('err'));
      expect(lines).toHaveLength(1);
      const parsed = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(parsed.severity).toBe('error');
    } finally {
      L.restore();
    }
  });
});

describe('restore() (CONS-04)', () => {
  test('restore() reverts bypass — subsequent L.info calls go to process.stdout', () => {
    L.format = 'json';
    const { spy } = makeStreamSpy();
    L.bypass(spy);
    L.restore();
    // After restore, activeConsole = systemConsole, output flows back to process.stdout.
    const { stdout } = captureAll(() => L.info('restored'));
    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.msg).toBe('restored');
  });

  test('restore() is idempotent — calling twice does not throw', () => {
    const { spy } = makeStreamSpy();
    L.bypass(spy);
    L.restore();
    expect(() => L.restore()).not.toThrow();
  });
});
