import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { L } from '../../../src';
import { CONSOLE_SPINNER_INTERVAL } from '../../../src/logger/mixins/spinner/console/const';
import { SPINNER_INTERVAL_JITTER } from '../../../src/logger/mixins/spinner/const';
import type { LoggerSpinner } from '../../../src/types';
import { captureAll } from '../../helpers/capture';

// reset.ts resets format to 'json' in beforeEach; override to 'pretty' so
// renderConsolePrefix renders [ ⋯ ] / [ ✔ ] / [ ✖ ] bracket badges.
beforeEach(() => {
  L.format = 'pretty';
});

// Minimum advance to guarantee at least one console spinner tick fires.
const TICK_ADVANCE = CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10;

/**
 * Intercepts process.stdout.write synchronously while executing fn.
 * Used for timer-advancing tests: setTimeout callbacks fire inside the intercept.
 */
function interceptStdout(fn: () => void): string[] {
  const out: string[] = [];
  const orig = process.stdout.write.bind(process.stdout);
  process.stdout.write = ((chunk: string | Uint8Array): boolean => {
    out.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  }) as typeof process.stdout.write;
  try {
    fn();
  } finally {
    process.stdout.write = orig;
  }
  return out;
}

// ── SPIN-01 ───────────────────────────────────────────────────────────────────

describe('spinner lifecycle (SPIN-01)', () => {
  test('start emits an immediate running frame', () => {
    const { stdout } = captureAll(() => {
      L.scope('spin-01-start').info.spin('loading');
    });
    expect(stdout.length).toBeGreaterThanOrEqual(1);
    expect(stdout[0]).toContain('⋯');
  });

  test('tick advance emits additional running frames', () => {
    rs.useFakeTimers();
    const out = interceptStdout(() => {
      L.scope('spin-01-tick').info.spin('loading');
      rs.advanceTimersByTime(TICK_ADVANCE);
    });
    expect(out.length).toBeGreaterThanOrEqual(2);
  });

  test('update changes the spinner text on the next tick', () => {
    rs.useFakeTimers();
    const out = interceptStdout(() => {
      const sp = L.scope('spin-01-update').info.spin('loading');
      sp.update('updated');
      rs.advanceTimersByTime(TICK_ADVANCE);
    });
    expect(out.some(l => l.includes('updated'))).toBe(true);
  });

  test('success emits correct icon line', () => {
    const { stdout } = captureAll(() => {
      const sp = L.scope('spin-01-success').info.spin('task');
      sp.success('done');
    });
    expect(stdout.some(l => l.includes('✔'))).toBe(true);
  });

  test('fail emits correct icon line', () => {
    const { stdout } = captureAll(() => {
      const sp = L.scope('spin-01-fail').info.spin('task');
      sp.fail('oops');
    });
    expect(stdout.some(l => l.includes('✖'))).toBe(true);
  });

  test('stop() terminates the spinner without emitting output', () => {
    const sp = L.scope('spin-01-stop').info.spin('task');
    const { stdout } = captureAll(() => sp.stop());
    expect(stdout).toHaveLength(0);
  });
});

// ── SPIN-02 ───────────────────────────────────────────────────────────────────

describe('stopped terminal state (SPIN-02)', () => {
  test('success/fail after stop() emits zero additional lines', () => {
    const sp = L.scope('spin-02-after-stop').info.spin('task');
    sp.stop();
    const { stdout: s1 } = captureAll(() => sp.success());
    const { stdout: s2 } = captureAll(() => sp.fail());
    expect(s1).toHaveLength(0);
    expect(s2).toHaveLength(0);
  });

  test('calling success() twice is idempotent', () => {
    const sp = L.scope('spin-02-double-success').info.spin('task');
    captureAll(() => sp.success('first'));
    const { stdout } = captureAll(() => sp.success('second'));
    expect(stdout).toHaveLength(0);
  });
});

// ── SPIN-03 ───────────────────────────────────────────────────────────────────

describe('autoStart option (SPIN-03)', () => {
  test('autoStart: true (default) emits an immediate running frame on construction', () => {
    const { stdout } = captureAll(() => {
      L.scope('spin-03-autostart-true').info.spin('loading');
    });
    expect(stdout.length).toBeGreaterThanOrEqual(1);
    expect(stdout[0]).toContain('⋯');
  });

  test('autoStart: false emits zero output after construction (D-02)', () => {
    const { stdout } = captureAll(() => {
      L.scope('spin-03-autostart-false').info.spin('loading', { autoStart: false });
    });
    expect(stdout).toHaveLength(0);
  });

  test('autoStart: false starts after explicit .start()', () => {
    const scope = L.scope('spin-03-explicit-start');
    let spinner!: LoggerSpinner;
    const { stdout: beforeStart } = captureAll(() => {
      spinner = scope.info.spin('loading', { autoStart: false });
    });
    expect(beforeStart).toHaveLength(0);
    const { stdout: afterStart } = captureAll(() => spinner.start());
    expect(afterStart.length).toBeGreaterThanOrEqual(1);
    expect(afterStart[0]).toContain('⋯');
  });
});

// ── SPIN-04 ───────────────────────────────────────────────────────────────────
// No fake timers: exec() awaits a microtask that resolves before any tick fires.

describe('exec() (SPIN-04)', () => {
  test('exec() with fulfilled promise emits success icon', async () => {
    const out: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      out.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await L.scope('spin-04-ok').info.exec(Promise.resolve('result'), { label: 'Task' });
    } finally {
      process.stdout.write = orig;
    }
    expect(out.some(l => l.includes('✔'))).toBe(true);
  });

  test('exec() with rejected promise emits fail icon and re-throws (D-13)', async () => {
    const out: string[] = [];
    const orig = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array): boolean => {
      out.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
      return true;
    }) as typeof process.stdout.write;
    try {
      await L.scope('spin-04-fail').info.exec(
        Promise.reject(new Error('boom')),
        { label: 'Task' },
      );
    } catch {
      // Expected re-throw (D-13) — consumed here
    } finally {
      process.stdout.write = orig;
    }
    expect(out.some(l => l.includes('✖'))).toBe(true);
  });
});

// ── SPIN-05 ───────────────────────────────────────────────────────────────────

describe('duration: true (SPIN-05)', () => {
  test('duration: true — success message contains elapsed time suffix', () => {
    // Fake timers advance Date.now() so elapsedMs() returns a non-zero value.
    rs.useFakeTimers();
    const out = interceptStdout(() => {
      const sp = L.scope('spin-05-duration').info.spin('task', { duration: true });
      rs.advanceTimersByTime(TICK_ADVANCE);
      sp.success('done');
    });
    expect(out.some(l => /\+\d+(ms|s)/.test(l))).toBe(true);
  });
});

// ── SPIN-06 ───────────────────────────────────────────────────────────────────

describe('progress option (SPIN-06)', () => {
  test('progress with ratio 0.5 renders progress bar with percentage', () => {
    rs.useFakeTimers();
    const out = interceptStdout(() => {
      const sp = L.scope('spin-06-ratio').info.spin('loading', { progress: true });
      sp.update('loading', { progress: 0.5 });
      rs.advanceTimersByTime(TICK_ADVANCE);
    });
    expect(out.some(l => l.includes('●') || l.includes('%'))).toBe(true);
  });

  test('progress with {done, total} renders fraction format', () => {
    rs.useFakeTimers();
    const out = interceptStdout(() => {
      const sp = L.scope('spin-06-fraction').info.spin('loading', { progress: true });
      sp.update('loading', { progress: { done: 3, total: 10 } });
      rs.advanceTimersByTime(TICK_ADVANCE);
    });
    expect(out.some(l => l.includes('3/10') || l.includes('●'))).toBe(true);
  });
});

// ── SPIN-08 ───────────────────────────────────────────────────────────────────

describe('console renderer bracket badges (SPIN-08)', () => {
  test('running ticks use [ ⋯ ] bracket format without cursor control sequences', () => {
    rs.useFakeTimers();
    const out = interceptStdout(() => {
      L.scope('spin-08-running').info.spin('loading');
      rs.advanceTimersByTime(TICK_ADVANCE);
    });
    expect(out.some(l => l.includes('[ ⋯ ]'))).toBe(true);
    expect(out.every(l => !l.includes('\x1b[?25l') && !l.includes('\x1b[?25h'))).toBe(true);
  });

  test('success line uses [ ✔ ] bracket format', () => {
    const { stdout } = captureAll(() => {
      const sp = L.scope('spin-08-success-bracket').info.spin('task');
      sp.success('done');
    });
    expect(stdout.some(l => l.includes('[ ✔ ]'))).toBe(true);
  });

  test('fail line uses [ ✖ ] bracket format', () => {
    const { stdout } = captureAll(() => {
      const sp = L.scope('spin-08-fail-bracket').info.spin('task');
      sp.fail('oops');
    });
    expect(stdout.some(l => l.includes('[ ✖ ]'))).toBe(true);
  });

  test('error-level spinner routes final line to stderr', () => {
    const sp = L.scope('spin-08-stderr').error.spin('loading');
    const { stderr } = captureAll(() => sp.success('done'));
    expect(stderr.some(l => l.includes('✔'))).toBe(true);
  });
});
