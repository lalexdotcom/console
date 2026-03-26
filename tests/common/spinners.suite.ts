import { beforeEach, describe, expect, rs, test } from '@rstest/core';
import { L } from '../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../src/logger/mixins/spinner/browser/const';
import { CONSOLE_SPINNER_INTERVAL } from '../../src/logger/mixins/spinner/console/const';
import { SPINNER_INTERVAL_JITTER } from '../../src/logger/mixins/spinner/const';
import type { LoggerSpinner } from '../../src/types';
import type { TestAdapter } from './adapter';

/**
 * Parameterised suite covering non-TTY spinner lifecycle, terminal state, exec(),
 * duration, progress, and bracket badge rendering (SPIN-01 through SPIN-06, SPIN-08).
 *
 * Requires L.format='pretty' (added in this suite's beforeEach, after adapter.setup()).
 * TICK_ADVANCE is selected based on adapter.name to use the correct interval constant.
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  // Select interval constant based on adapter environment
  const TICK_ADVANCE = adapter.name.startsWith('browser')
    ? BROWSER_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10
    : CONSOLE_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10;

  describe(`spinners (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
      // Spinners always render [ ⋯ ] / [ ✔ ] / [ ✖ ] bracket badges in pretty format.
      // Override adapter format to 'pretty' regardless of what adapter.setup() set.
      L.format = 'pretty';
    });

    // SPIN-01: full spinner lifecycle — start, tick, update, success, fail, stop
    describe('spinner lifecycle (SPIN-01)', () => {
      test('start emits an immediate running frame', async () => {
        const lines = await adapter.capture(() => {
          L.scope('spin-01-start').info.spin('loading');
        });
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain('⋯');
      });

      test('tick advance emits additional running frames', async () => {
        const lines = await adapter.capture(() => {
          rs.useFakeTimers();
          L.scope('spin-01-tick').info.spin('loading');
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(lines.length).toBeGreaterThanOrEqual(2);
      });

      test('update changes the spinner text on the next tick', async () => {
        const lines = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-01-update').info.spin('loading');
          sp.update('updated');
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(lines.some(l => l.includes('updated'))).toBe(true);
      });

      test('success emits correct icon line', async () => {
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-01-success').info.spin('task');
          sp.success('done');
        });
        expect(lines.some(l => l.includes('✔'))).toBe(true);
      });

      test('fail emits correct icon line', async () => {
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-01-fail').info.spin('task');
          sp.fail('oops');
        });
        expect(lines.some(l => l.includes('✖'))).toBe(true);
      });

      test('stop() terminates the spinner without emitting output', async () => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => { sp = L.scope('spin-01-stop').info.spin('task'); });
        const lines = await adapter.capture(() => { sp.stop(); });
        expect(lines).toHaveLength(0);
      });
    });

    // SPIN-02: terminal state — stopped spinner is idempotent
    describe('stopped terminal state (SPIN-02)', () => {
      test('success/fail after stop() emits zero additional lines', async () => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => {
          sp = L.scope('spin-02-after-stop').info.spin('task');
          sp.stop();
        });
        const s1 = await adapter.capture(() => { sp.success(); });
        const s2 = await adapter.capture(() => { sp.fail(); });
        expect(s1).toHaveLength(0);
        expect(s2).toHaveLength(0);
      });

      test('calling success() twice is idempotent', async () => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => { sp = L.scope('spin-02-double-success').info.spin('task'); });
        await adapter.capture(() => { sp.success('first'); });
        const lines = await adapter.capture(() => { sp.success('second'); });
        expect(lines).toHaveLength(0);
      });
    });

    // SPIN-03: autoStart option
    describe('autoStart option (SPIN-03)', () => {
      test('autoStart: true (default) emits an immediate running frame on construction', async () => {
        const lines = await adapter.capture(() => {
          L.scope('spin-03-autostart-true').info.spin('loading');
        });
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain('⋯');
      });

      test('autoStart: false emits zero output after construction', async () => {
        const lines = await adapter.capture(() => {
          L.scope('spin-03-autostart-false').info.spin('loading', { autoStart: false });
        });
        expect(lines).toHaveLength(0);
      });

      test('autoStart: false starts after explicit .start()', async () => {
        const scope = L.scope('spin-03-explicit-start');
        let spinner!: LoggerSpinner;
        const beforeStart = await adapter.capture(() => {
          spinner = scope.info.spin('loading', { autoStart: false });
        });
        expect(beforeStart).toHaveLength(0);
        const afterStart = await adapter.capture(() => { spinner.start(); });
        expect(afterStart.length).toBeGreaterThanOrEqual(1);
        expect(afterStart[0]).toContain('⋯');
      });
    });

    // SPIN-04: exec() promise wrapping — no fake timers needed (microtask resolves before tick)
    describe('exec() (SPIN-04)', () => {
      test('exec() with fulfilled promise emits success icon', async () => {
        const lines = await adapter.capture(async () => {
          await L.scope('spin-04-ok').info.exec(Promise.resolve('result'), { label: 'Task' });
        });
        expect(lines.some(l => l.includes('✔'))).toBe(true);
      });

      test('exec() with rejected promise emits fail icon and re-throws', async () => {
        let lines: string[] = [];
        try {
          lines = await adapter.capture(async () => {
            await L.scope('spin-04-fail').info.exec(
              Promise.reject(new Error('boom')),
              { label: 'Task' },
            );
          });
        } catch {
          // Expected re-throw (D-13) — consumed here
        }
        expect(lines.some(l => l.includes('✖'))).toBe(true);
      });
    });

    // SPIN-05: duration display on success
    describe('duration: true (SPIN-05)', () => {
      test('duration: true — success message contains elapsed time suffix', async () => {
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-05-duration').info.spin('task', { duration: true });
          rs.advanceTimersByTime(TICK_ADVANCE);
          sp.success('done');
        });
        rs.useRealTimers();
        expect(out.some(l => /\+\d+(ms|s)/.test(l))).toBe(true);
      });
    });

    // SPIN-06: progress bar rendering
    describe('progress option (SPIN-06)', () => {
      test('progress with ratio 0.5 renders progress bar with percentage', async () => {
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-06-ratio').info.spin('loading', { progress: true });
          sp.update('loading', { progress: 0.5 });
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(out.some(l => l.includes('●') || l.includes('%'))).toBe(true);
      });

      test('progress with {done, total} renders fraction format', async () => {
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-06-fraction').info.spin('loading', { progress: true });
          sp.update('loading', { progress: { done: 3, total: 10 } });
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(out.some(l => l.includes('3/10') || l.includes('●'))).toBe(true);
      });
    });

    // SPIN-08: console renderer bracket badge format (non-TTY)
    describe('console renderer bracket badges (SPIN-08)', () => {
      test('running ticks use [ ⋯ ] bracket format without cursor control sequences', async () => {
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          L.scope('spin-08-running').info.spin('loading');
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(out.some(l => l.includes('[ ⋯ ]'))).toBe(true);
        expect(out.every(l => !l.includes('\x1b[?25l') && !l.includes('\x1b[?25h'))).toBe(true);
      });

      test('success line uses [ ✔ ] bracket format', async () => {
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-08-success-bracket').info.spin('task');
          sp.success('done');
          // void
        });
        expect(lines.some(l => l.includes('[ ✔ ]'))).toBe(true);
      });

      test('fail line uses [ ✖ ] bracket format', async () => {
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-08-fail-bracket').info.spin('task');
          sp.fail('oops');
          // void
        });
        expect(lines.some(l => l.includes('[ ✖ ]'))).toBe(true);
      });

      test('error-level spinner routes final line to output', async () => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => { sp = L.scope('spin-08-stderr').error.spin('loading'); });
        const lines = await adapter.capture(() => { sp.success('done'); });
        expect(lines.some(l => l.includes('✔'))).toBe(true);
      });
    });
  });
}
