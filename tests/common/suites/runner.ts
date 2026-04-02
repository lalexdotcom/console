import { beforeEach, describe, expect, test } from '@rstest/core';
import type { TestAdapter } from '../adapter';
import type { LogOutput } from '../output';
import { resetRegistry } from '../reset.helper';
import type { Suite } from './suite';

/**
 * Registers a suite of test cases under a describe() block.
 *
 * Behaviour:
 * - Calls mainAdapter.setup() then suite.setup?.(mainAdapter) in a shared
 *   beforeEach so every test case starts from a clean, suite-configured state.
 * - When workerAdapter is provided, also calls workerAdapter.setup() then
 *   suite.setup?.(workerAdapter) in the same beforeEach.
 * - Each TestCase is registered as a test() that runs tc.run(mainAdapter).
 * - When workerAdapter is provided and tc.parity !== false, the same tc.run()
 *   is also awaited against workerAdapter (parity re-run, same test() body).
 *
 * @param suite         - Declarative suite object produced by Phase 12 suites.
 * @param mainAdapter   - Primary adapter under test.
 * @param workerAdapter - Optional worker adapter for automatic parity runs.
 */
export function runSuite(
  suite: Suite,
  mainAdapter: TestAdapter,
  workerAdapter?: TestAdapter,
): void {
  describe(suite.name, () => {
    beforeEach(async () => {
      await mainAdapter.setup();
      if (suite.setup) await suite.setup(mainAdapter);
      if (workerAdapter) {
        await workerAdapter.setup();
        if (suite.setup) await suite.setup(workerAdapter);
      }
    });

    for (const tc of suite.tests) {
      test(tc.name, async () => {
        const entries = await mainAdapter.capture(() => tc.run(mainAdapter));
        tc.check(entries);

        if (tc.parity !== false && workerAdapter) {
          // Reset registry and re-run setup before the parity run so that state
          // mutations from the main run (e.g. L.level, once()/limit() counters)
          // do not bleed into the worker adapter run.
          resetRegistry();
          await workerAdapter.setup();
          if (suite.setup) await suite.setup(workerAdapter);
          const entriesW = await workerAdapter.capture(() => tc.run(workerAdapter));
          tc.check(entriesW);
          // Verify parity: structured content must be identical between main and worker runs.
          // Exclusions:
          //   - raw/date: format text and timestamps are run-specific
          //   - elapsed-time suffixes "(+NNNms)" in msg: measured independently per run
          //   - datetime brackets "[YYYY-MM-DD ...]" in msg: emitted when date=true, ms differ
          //   - running spinner frames: tick count is timing-dependent; only terminal
          //     entries (success/fail/stop) need to match for spinners
          const normMsg = (s?: string) =>
            s
              ?.replace(/\(\+\d+ms\)/g, '(+Xms)')
              .replace(/\[\d{4}-\d{2}-\d{2}[^\]]*\]/g, '[DATE]');
          const hasSpinner = entries.some((e) => e.spinnerState !== undefined);
          const strip = ({ raw: _r, date: _d, ...rest }: LogOutput) => ({
            ...rest,
            msg: normMsg(rest.msg),
          });
          const compact = (arr: LogOutput[]) =>
            hasSpinner
              ? arr.filter((e) => e.spinnerState !== 'running').map(strip)
              : arr.map(strip);
          expect(compact(entriesW)).toEqual(compact(entries));
        }
      });
    }
  });
}
