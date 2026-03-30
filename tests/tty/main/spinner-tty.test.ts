import { stripVTControlCharacters } from 'node:util';
import { afterEach, describe, expect, rs, test } from '@rstest/core';
import {
  type TTYSpinnerState,
  ttyRenderer,
} from '../../../src/logger/mixins/spinner/tty/renderer';
import { captureAll } from '../../common/capture.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles — no import needed.

// NOTE (RISK-1 fallback): rs.mock('../../../src/utils/env') cannot reliably
// override `isTTY = isNodeTTY` in spinner/index.ts because rspack bundles the
// source before testing, causing `isTTY` to be captured at bundle evaluation
// time before any mock factory can intercept it. The plan's fallback is applied:
// ttyRenderer is called directly, bypassing selectSpinnerFactory() entirely.
// This is valid for SPIN-07 which specifies renderer behaviour (cursor, tick,
// queue, cleanup), not the routing from selectSpinnerFactory.

// TTY tick interval is 150ms (TTY_SPINNER_INTERVAL, not affected by NODE_ENV).
// Advance by 160ms to guarantee at least one tick fires deterministically.
const TTY_TICK_ADVANCE = 160;

// Minimal spinner state used in tests that only need the raw renderer API.
function makeState(text: string): TTYSpinnerState {
  return { id: Symbol(), text, frames: ['⠋'], iconIndex: 0, color: undefined };
}

// Clean up ttyRenderer singleton after every test to prevent state leakage.
// reset.ts does NOT clear ttyRenderer state; this afterEach fills that gap.
afterEach(() => {
  ttyRenderer?.cleanup();
  rs.useRealTimers();
});

// ── SPIN-07: TTY renderer cursor management, tick output, log queue ───────────

describe('TTY spinner — cursor management, tick output and log queue (SPIN-07)', () => {
  test('cursor hide — \\x1b[?25l written to stdout when first spinner starts', () => {
    const { stdout } = captureAll(() => {
      ttyRenderer?.addSpinner(makeState('loading'));
    });
    expect(stdout.some((l) => l.includes('\x1b[?25l'))).toBe(true);
  });

  test('cursor show — \\x1b[?25h written to stdout when last spinner stops', () => {
    const state = makeState('task');
    captureAll(() => {
      ttyRenderer?.addSpinner(state);
    });
    const { stdout } = captureAll(() => {
      ttyRenderer?.removeSpinner(state.id);
    });
    expect(stdout.some((l) => l.includes('\x1b[?25h'))).toBe(true);
  });

  test('spinner text appears in tick output after advancing fake clock', () => {
    rs.useFakeTimers();
    const { stdout } = captureAll(() => {
      ttyRenderer?.addSpinner(makeState('my task'));
      rs.advanceTimersByTime(TTY_TICK_ADVANCE);
    });
    const clean = stdout.map((s) => stripVTControlCharacters(s));
    expect(clean.some((l) => l.includes('my task'))).toBe(true);
  });

  test('enqueued log line is flushed to stdout on the next tick', () => {
    rs.useFakeTimers();
    const { stdout } = captureAll(() => {
      ttyRenderer?.addSpinner(makeState('background task'));
      // Line pushed to pendingQueue; NOT written to stdout yet.
      ttyRenderer?.enqueueLog('queued log message');
      // Advancing the clock fires tick() → flushPending() → stdout write.
      rs.advanceTimersByTime(TTY_TICK_ADVANCE);
    });
    const clean = stdout.map((s) => stripVTControlCharacters(s));
    expect(clean.some((l) => l.includes('queued log message'))).toBe(true);
  });

  test('isActive() returns true while spinner is running, false after last stops', () => {
    const state = makeState('active test');
    ttyRenderer?.addSpinner(state);
    expect(ttyRenderer?.isActive()).toBe(true);
    captureAll(() => {
      ttyRenderer?.removeSpinner(state.id);
    });
    expect(ttyRenderer?.isActive()).toBe(false);
  });

  test('multi-spinner — two concurrent spinners both appear in tick output', () => {
    rs.useFakeTimers();
    const stateA = makeState('task A');
    const stateB = makeState('task B');
    const { stdout } = captureAll(() => {
      ttyRenderer?.addSpinner(stateA);
      ttyRenderer?.addSpinner(stateB);
      rs.advanceTimersByTime(TTY_TICK_ADVANCE);
    });
    const clean = stdout.map((s) => stripVTControlCharacters(s));
    expect(clean.some((l) => l.includes('task A'))).toBe(true);
    expect(clean.some((l) => l.includes('task B'))).toBe(true);
  });
});
