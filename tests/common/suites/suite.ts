import type { TestAdapter } from '../adapter';

/**
 * A function that exercises one behaviour against the provided adapter.
 * May be synchronous or asynchronous.
 */
export type RunTestFunction = (adapter: TestAdapter) => void | Promise<void>;

/**
 * A single named test case within a Suite.
 *
 * @param name   - Shown as the test() label inside describe().
 * @param parity - When true (default), runSuite() re-runs this case against the
 *                 workerAdapter if one was provided. Set to false to opt out.
 * @param run    - Implementation — receives the adapter under test.
 */
export interface TestCase {
  name: string;
  parity?: boolean;
  run: RunTestFunction;
}

/**
 * A named, self-contained collection of test cases parameterised by a TestAdapter.
 *
 * @param name        - Used as the describe() block label.
 * @param description - Human-readable summary (optional, not used by the runner).
 * @param tests       - Ordered list of TestCase objects.
 */
export interface Suite {
  name: string;
  description?: string;
  tests: TestCase[];
}
