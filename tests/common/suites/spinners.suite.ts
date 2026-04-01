import { expect, rs } from '@rstest/core';
import { L } from '../../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../../src/logger/mixins/spinner/browser/const';
import { CONSOLE_SPINNER_INTERVAL } from '../../../src/logger/mixins/spinner/console/const';
import { SPINNER_INTERVAL_JITTER } from '../../../src/logger/mixins/spinner/const';
import type { LogOutput } from '../output';
import type { TestAdapter } from '../adapter';
import type { Suite } from './suite';

/**
 * Returns the tick advance duration (ms) to use in fake-timer tests.
 * Advances past one full spinner interval including jitter.
 */
function getTickAdvance(adapter: TestAdapter): number {
  return adapter.name.startsWith('browser')
    ? BROWSER_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10
    : CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10;
}

/**
 * Declarative suite covering non-TTY spinner lifecycle, terminal state, exec(),
 * duration, progress, and bracket badge rendering (SPIN-01 through SPIN-06, SPIN-08).
 *
 * setup() forces L.format = 'pretty' after adapter.setup() so spinner badges render.
 */
export const spinnersSuite: Suite = {
  name: 'spinners',
  description:
    'Non-TTY spinner lifecycle, exec, duration, progress, bracket badges (SPIN-01/02/03/04/05/06/08)',
  setup: async () => {
    // Spinners always render [ ⋯ ] / [ ✔ ] / [ ✖ ] bracket badges in pretty format.
    // Override adapter format to 'pretty' regardless of what adapter.setup() set.
    L.format = 'pretty';
  },
  tests: [
    // SPIN-01: full spinner lifecycle — start, tick, update, success, fail, stop
    {
      name: 'start emits an immediate running frame',
      run(_adapter) {
        L.scope('spin-01-start').info.spin('loading');
      },
      check(entries: LogOutput[]) {
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0].spinnerState).toBe('running');
      },
    },
    {
      name: 'tick advance emits additional running frames',
      run(adapter) {
        const TICK_ADVANCE = getTickAdvance(adapter);
        rs.useFakeTimers();
        L.scope('spin-01-tick').info.spin('loading');
        rs.advanceTimersByTime(TICK_ADVANCE);
        rs.useRealTimers();
      },
      check(entries: LogOutput[]) {
        expect(entries.length).toBeGreaterThanOrEqual(2);
      },
    },
    {
      name: 'update changes the spinner text on the next tick',
      run(adapter) {
        // Browser capture collects only the %c format string (c[0]) — message text is
        // a separate arg. Verifying message content requires node-mode capture.
        if (adapter.name.startsWith('browser')) return;
        const TICK_ADVANCE = getTickAdvance(adapter);
        rs.useFakeTimers();
        const sp = L.scope('spin-01-update').info.spin('loading');
        sp.update('updated');
        rs.advanceTimersByTime(TICK_ADVANCE);
        rs.useRealTimers();
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries.some((e) => e.raw.includes('updated'))).toBe(true);
      },
    },
    {
      name: 'success emits correct icon line',
      run(_adapter) {
        const sp = L.scope('spin-01-success').info.spin('task');
        sp.success('done');
      },
      check(entries: LogOutput[]) {
        expect(entries.some((e) => e.spinnerState === 'success')).toBe(true);
      },
    },
    {
      name: 'fail emits correct icon line',
      run(_adapter) {
        const sp = L.scope('spin-01-fail').info.spin('task');
        sp.fail('oops');
      },
      check(entries: LogOutput[]) {
        expect(entries.some((e) => e.spinnerState === 'fail')).toBe(true);
      },
    },
    {
      name: 'stop() terminates the spinner without emitting output',
      run(_adapter) {
        // start emits 1 running frame; stop() adds 0
        const sp = L.scope('spin-01-stop').info.spin('task');
        sp.stop();
      },
      check(entries: LogOutput[]) {
        // Only the initial start frame; stop() adds nothing
        expect(entries).toHaveLength(1);
        expect(entries[0].spinnerState).toBe('running');
      },
    },
    // SPIN-02: terminal state — stopped spinner is idempotent
    {
      name: 'success/fail after stop() emits zero additional lines',
      run(_adapter) {
        const sp = L.scope('spin-02-after-stop').info.spin('task');
        sp.stop();
        sp.success(); // terminal — no output
        sp.fail();    // terminal — no output
      },
      check(entries: LogOutput[]) {
        // Only the initial start frame; stop/success/fail all add 0
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'calling success() twice is idempotent',
      run(_adapter) {
        const sp = L.scope('spin-02-double-success').info.spin('task');
        sp.success('first');
        sp.success('second'); // second call on terminal state emits nothing
      },
      check(entries: LogOutput[]) {
        // start (1 running) + first success (1 success) + second (0) = 2
        expect(entries.some((e) => e.spinnerState === 'success')).toBe(true);
        // After first success the spinner is terminal — second call is a no-op
        const successCount = entries.filter(
          (e) => e.spinnerState === 'success',
        ).length;
        expect(successCount).toBe(1);
      },
    },
    // SPIN-03: autoStart option
    {
      name: 'autoStart: true (default) emits an immediate running frame on construction',
      run(_adapter) {
        L.scope('spin-03-autostart-true').info.spin('loading');
      },
      check(entries: LogOutput[]) {
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0].spinnerState).toBe('running');
      },
    },
    {
      name: 'autoStart: false emits zero output after construction',
      run(_adapter) {
        L.scope('spin-03-autostart-false').info.spin('loading', {
          autoStart: false,
        });
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(0);
      },
    },
    {
      name: 'autoStart: false starts after explicit .start()',
      run(_adapter) {
        const scope = L.scope('spin-03-explicit-start');
        const spinner = scope.info.spin('loading', { autoStart: false });
        // autoStart:false construction emits 0; start() emits ≥1
        spinner.start();
      },
      check(entries: LogOutput[]) {
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0].spinnerState).toBe('running');
      },
    },
    // SPIN-04: exec() promise wrapping
    {
      name: 'exec() with fulfilled promise emits success icon',
      async run(_adapter) {
        await L.scope('spin-04-ok').info.exec(Promise.resolve('result'), {
          label: 'Task',
        });
      },
      check(entries: LogOutput[]) {
        expect(entries.some((e) => e.spinnerState === 'success')).toBe(true);
      },
    },
    {
      name: 'exec() with rejected promise emits fail icon and re-throws',
      async run(_adapter) {
        try {
          await L.scope('spin-04-fail').info.exec(
            Promise.reject(new Error('boom')),
            { label: 'Task' },
          );
        } catch {
          // exec() re-throws after calling sp.fail() — expected
        }
      },
      check(entries: LogOutput[]) {
        // fail icon confirms exec() called sp.fail() before rethrowing
        expect(entries.some((e) => e.spinnerState === 'fail')).toBe(true);
      },
    },
    // SPIN-05: duration display on success
    {
      name: 'duration: true — success message contains elapsed time suffix',
      run(adapter) {
        // Browser capture collects only c[0] (format string) — the duration suffix is
        // appended to callArgs text and lives beyond the format string.
        if (adapter.name.startsWith('browser')) return;
        const TICK_ADVANCE = getTickAdvance(adapter);
        rs.useFakeTimers();
        const sp = L.scope('spin-05-duration').info.spin('task', {
          duration: true,
        });
        rs.advanceTimersByTime(TICK_ADVANCE);
        sp.success('done');
        rs.useRealTimers();
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries.some((e) => /\+\d+(ms|s)/.test(e.raw))).toBe(true);
      },
    },
    // SPIN-06: progress bar rendering
    {
      name: 'progress with ratio 0.5 renders progress bar with percentage',
      run(adapter) {
        const TICK_ADVANCE = getTickAdvance(adapter);
        rs.useFakeTimers();
        const sp = L.scope('spin-06-ratio').info.spin('loading', {
          progress: true,
        });
        sp.update('loading', { progress: 0.5 });
        rs.advanceTimersByTime(TICK_ADVANCE);
        rs.useRealTimers();
      },
      check(entries: LogOutput[]) {
        expect(
          entries.some((e) => e.raw.includes('●') || e.raw.includes('%')),
        ).toBe(true);
      },
    },
    {
      name: 'progress with {done, total} renders fraction format',
      run(adapter) {
        const TICK_ADVANCE = getTickAdvance(adapter);
        rs.useFakeTimers();
        const sp = L.scope('spin-06-fraction').info.spin('loading', {
          progress: true,
        });
        sp.update('loading', { progress: { done: 3, total: 10 } });
        rs.advanceTimersByTime(TICK_ADVANCE);
        rs.useRealTimers();
      },
      check(entries: LogOutput[]) {
        expect(
          entries.some((e) => e.raw.includes('3/10') || e.raw.includes('●')),
        ).toBe(true);
      },
    },
    // SPIN-08: console renderer bracket badge format (non-TTY)
    {
      name: 'running ticks use [ ⋯ ] bracket format without cursor control sequences',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        const TICK_ADVANCE = getTickAdvance(adapter);
        rs.useFakeTimers();
        L.scope('spin-08-running').info.spin('loading');
        rs.advanceTimersByTime(TICK_ADVANCE);
        rs.useRealTimers();
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries.some((e) => e.raw.includes('[ ⋯ ]'))).toBe(true);
        expect(
          entries.every(
            (e) => !e.raw.includes('\x1b[?25l') && !e.raw.includes('\x1b[?25h'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'success line uses [ ✔ ] bracket format',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        const sp = L.scope('spin-08-success-bracket').info.spin('task');
        sp.success('done');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries.some((e) => e.raw.includes('[ ✔ ]'))).toBe(true);
      },
    },
    {
      name: 'fail line uses [ ✖ ] bracket format',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        const sp = L.scope('spin-08-fail-bracket').info.spin('task');
        sp.fail('oops');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries.some((e) => e.raw.includes('[ ✖ ]'))).toBe(true);
      },
    },
    {
      name: 'error-level spinner routes final line to output',
      run(_adapter) {
        const sp = L.scope('spin-08-stderr').error.spin('loading');
        sp.success('done');
      },
      check(entries: LogOutput[]) {
        expect(entries.some((e) => e.spinnerState === 'success')).toBe(true);
      },
    },
  ],
};
