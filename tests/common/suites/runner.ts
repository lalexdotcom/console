import { beforeEach, describe, test } from '@rstest/core';
import type { TestAdapter } from '../adapter';
import type { Suite } from './suite';

/**
 * Registers a suite of test cases under a describe() block.
 *
 * Behaviour:
 * - Calls mainAdapter.setup() (and workerAdapter.setup() when provided) in
 *   a shared beforeEach so every test case starts from a clean state.
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
      if (workerAdapter) await workerAdapter.setup();
    });

    for (const tc of suite.tests) {
      test(tc.name, async () => {
        await tc.run(mainAdapter);
        if (tc.parity !== false && workerAdapter) {
          await tc.run(workerAdapter);
        }
      });
    }
  });
}
