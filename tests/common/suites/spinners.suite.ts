import { expect, rs } from '@rstest/core';
import { L } from '../../../src';
import {
  BROWSER_DEFAULT_RUNNING_ICON,
  BROWSER_SPINNER_INTERVAL,
} from '../../../src/logger/mixins/spinner/browser/const';
import { CONSOLE_SPINNER_INTERVAL } from '../../../src/logger/mixins/spinner/console/const';
import { SPINNER_INTERVAL_JITTER } from '../../../src/logger/mixins/spinner/const';
import type { LoggerSpinner } from '../../../src/types';
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
 * Returns the running icon string for the given adapter environment.
 * Browser uses '-' (BROWSER_DEFAULT_RUNNING_ICON); node console uses '⋯'.
 */
function getRunningIcon(adapter: TestAdapter): string {
  return adapter.name.startsWith('browser') ? BROWSER_DEFAULT_RUNNING_ICON.icon : '⋯';
}

/**
 * Declarative suite covering non-TTY spinner lifecycle, terminal state, exec(),
 * duration, progress, and bracket badge rendering (SPIN-01 through SPIN-06, SPIN-08).
 *
 * setup() forces L.format = 'pretty' after adapter.setup() so spinner badges render.
 */
export const spinnersSuite: Suite = {
  name: 'spinners',
  description: 'Non-TTY spinner lifecycle, exec, duration, progress, bracket badges (SPIN-01/02/03/04/05/06/08)',
  setup: async () => {
    // Spinners always render [ ⋯ ] / [ ✔ ] / [ ✖ ] bracket badges in pretty format.
    // Override adapter format to 'pretty' regardless of what adapter.setup() set.
    L.format = 'pretty';
  },
  tests: [
    // SPIN-01: full spinner lifecycle — start, tick, update, success, fail, stop
    {
      name: 'start emits an immediate running frame',
      run: async (adapter) => {
        const RUNNING_ICON = getRunningIcon(adapter);
        const lines = await adapter.capture(() => {
          L.scope('spin-01-start').info.spin('loading');
        });
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain(RUNNING_ICON);
      },
    },
    {
      name: 'tick advance emits additional running frames',
      run: async (adapter) => {
        const TICK_ADVANCE = getTickAdvance(adapter);
        const lines = await adapter.capture(() => {
          rs.useFakeTimers();
          L.scope('spin-01-tick').info.spin('loading');
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(lines.length).toBeGreaterThanOrEqual(2);
      },
    },
    {
      name: 'update changes the spinner text on the next tick',
      run: async (adapter) => {
        // Browser capture collects only the %c format string (c[0]) — message text is
        // a separate arg. Verifying message content requires node-mode capture.
        if (adapter.name.startsWith('browser')) return;
        const TICK_ADVANCE = getTickAdvance(adapter);
        const lines = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-01-update').info.spin('loading');
          sp.update('updated');
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(lines.some((l) => l.includes('updated'))).toBe(true);
      },
    },
    {
      name: 'success emits correct icon line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-01-success').info.spin('task');
          sp.success('done');
        });
        expect(lines.some((l) => l.includes('✔'))).toBe(true);
      },
    },
    {
      name: 'fail emits correct icon line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-01-fail').info.spin('task');
          sp.fail('oops');
        });
        expect(lines.some((l) => l.includes('✖'))).toBe(true);
      },
    },
    {
      name: 'stop() terminates the spinner without emitting output',
      run: async (adapter) => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => {
          sp = L.scope('spin-01-stop').info.spin('task');
        });
        const lines = await adapter.capture(() => {
          sp.stop();
        });
        expect(lines).toHaveLength(0);
      },
    },
    // SPIN-02: terminal state — stopped spinner is idempotent
    {
      name: 'success/fail after stop() emits zero additional lines',
      run: async (adapter) => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => {
          sp = L.scope('spin-02-after-stop').info.spin('task');
          sp.stop();
        });
        const s1 = await adapter.capture(() => {
          sp.success();
        });
        const s2 = await adapter.capture(() => {
          sp.fail();
        });
        expect(s1).toHaveLength(0);
        expect(s2).toHaveLength(0);
      },
    },
    {
      name: 'calling success() twice is idempotent',
      run: async (adapter) => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => {
          sp = L.scope('spin-02-double-success').info.spin('task');
        });
        await adapter.capture(() => {
          sp.success('first');
        });
        const lines = await adapter.capture(() => {
          sp.success('second');
        });
        expect(lines).toHaveLength(0);
      },
    },
    // SPIN-03: autoStart option
    {
      name: 'autoStart: true (default) emits an immediate running frame on construction',
      run: async (adapter) => {
        const RUNNING_ICON = getRunningIcon(adapter);
        const lines = await adapter.capture(() => {
          L.scope('spin-03-autostart-true').info.spin('loading');
        });
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain(RUNNING_ICON);
      },
    },
    {
      name: 'autoStart: false emits zero output after construction',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          L.scope('spin-03-autostart-false').info.spin('loading', {
            autoStart: false,
          });
        });
        expect(lines).toHaveLength(0);
      },
    },
    {
      name: 'autoStart: false starts after explicit .start()',
      run: async (adapter) => {
        const RUNNING_ICON = getRunningIcon(adapter);
        const scope = L.scope('spin-03-explicit-start');
        let spinner!: LoggerSpinner;
        const beforeStart = await adapter.capture(() => {
          spinner = scope.info.spin('loading', { autoStart: false });
        });
        expect(beforeStart).toHaveLength(0);
        const afterStart = await adapter.capture(() => {
          spinner.start();
        });
        expect(afterStart.length).toBeGreaterThanOrEqual(1);
        expect(afterStart[0]).toContain(RUNNING_ICON);
      },
    },
    // SPIN-04: exec() promise wrapping
    {
      name: 'exec() with fulfilled promise emits success icon',
      run: async (adapter) => {
        const lines = await adapter.capture(async () => {
          await L.scope('spin-04-ok').info.exec(Promise.resolve('result'), {
            label: 'Task',
          });
        });
        expect(lines.some((l) => l.includes('✔'))).toBe(true);
      },
    },
    {
      name: 'exec() with rejected promise emits fail icon and re-throws',
      run: async (adapter) => {
        let threw = false;
        const lines = await adapter.capture(async () => {
          try {
            await L.scope('spin-04-fail').info.exec(
              Promise.reject(new Error('boom')),
              { label: 'Task' },
            );
          } catch {
            threw = true; // exec() re-throws after calling sp.fail() (D-13)
          }
        });
        expect(threw).toBe(true);
        expect(lines.some((l) => l.includes('✖'))).toBe(true);
      },
    },
    // SPIN-05: duration display on success
    {
      name: 'duration: true — success message contains elapsed time suffix',
      run: async (adapter) => {
        // Browser capture collects only c[0] (format string) — the duration suffix is
        // appended to callArgs text and lives beyond the format string.
        if (adapter.name.startsWith('browser')) return;
        const TICK_ADVANCE = getTickAdvance(adapter);
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-05-duration').info.spin('task', {
            duration: true,
          });
          rs.advanceTimersByTime(TICK_ADVANCE);
          sp.success('done');
        });
        rs.useRealTimers();
        expect(out.some((l) => /\+\d+(ms|s)/.test(l))).toBe(true);
      },
    },
    // SPIN-06: progress bar rendering
    {
      name: 'progress with ratio 0.5 renders progress bar with percentage',
      run: async (adapter) => {
        const TICK_ADVANCE = getTickAdvance(adapter);
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-06-ratio').info.spin('loading', {
            progress: true,
          });
          sp.update('loading', { progress: 0.5 });
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(out.some((l) => l.includes('●') || l.includes('%'))).toBe(true);
      },
    },
    {
      name: 'progress with {done, total} renders fraction format',
      run: async (adapter) => {
        const TICK_ADVANCE = getTickAdvance(adapter);
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          const sp = L.scope('spin-06-fraction').info.spin('loading', {
            progress: true,
          });
          sp.update('loading', { progress: { done: 3, total: 10 } });
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(out.some((l) => l.includes('3/10') || l.includes('●'))).toBe(true);
      },
    },
    // SPIN-08: console renderer bracket badge format (non-TTY)
    {
      name: 'running ticks use [ ⋯ ] bracket format without cursor control sequences',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        const TICK_ADVANCE = getTickAdvance(adapter);
        const out = await adapter.capture(() => {
          rs.useFakeTimers();
          L.scope('spin-08-running').info.spin('loading');
          rs.advanceTimersByTime(TICK_ADVANCE);
        });
        rs.useRealTimers();
        expect(out.some((l) => l.includes('[ ⋯ ]'))).toBe(true);
        expect(
          out.every(
            (l) => !l.includes('\x1b[?25l') && !l.includes('\x1b[?25h'),
          ),
        ).toBe(true);
      },
    },
    {
      name: 'success line uses [ ✔ ] bracket format',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-08-success-bracket').info.spin('task');
          sp.success('done');
          // void
        });
        expect(lines.some((l) => l.includes('[ ✔ ]'))).toBe(true);
      },
    },
    {
      name: 'fail line uses [ ✖ ] bracket format',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        const lines = await adapter.capture(() => {
          const sp = L.scope('spin-08-fail-bracket').info.spin('task');
          sp.fail('oops');
          // void
        });
        expect(lines.some((l) => l.includes('[ ✖ ]'))).toBe(true);
      },
    },
    {
      name: 'error-level spinner routes final line to output',
      run: async (adapter) => {
        let sp!: LoggerSpinner;
        await adapter.capture(() => {
          sp = L.scope('spin-08-stderr').error.spin('loading');
        });
        const lines = await adapter.capture(() => {
          sp.success('done');
        });
        expect(lines.some((l) => l.includes('✔'))).toBe(true);
      },
    },
  ],
};
