import type { TestAdapter } from '../adapter';
import type { LogOutput } from '../output';

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
 * @param run    - Stimulus only — fires log calls via the adapter under test.
 * @param check  - Assertions on the parsed output produced by run().
 */
export interface TestCase {
  name: string;
  parity?: boolean;
  run: RunTestFunction;
  check(entries: LogOutput[]): void;
}

/**
 * A named, self-contained collection of test cases parameterised by a TestAdapter.
 *
 * @param name        - Used as the describe() block label.
 * @param description - Human-readable summary (optional, not used by the runner).
 * @param setup       - Optional per-suite setup hook. Called in beforeEach after
 *                      adapter.setup(). Use for suite-level state every test case
 *                      requires beyond adapter reset (e.g. forcing L.format = 'json'
 *                      to suppress TRACE_LEVELS stack traces).
 * @param tests       - Ordered list of TestCase objects.
 */
export interface Suite {
  name: string;
  description?: string;
  /**
   * Optional per-suite setup hook. Called in beforeEach after adapter.setup().
   * Use for suite-level state that every test case requires beyond adapter reset
   * (e.g., forcing L.format = 'json' to suppress TRACE_LEVELS stack traces).
   */
  setup?: (adapter: TestAdapter) => void | Promise<void>;
  tests: TestCase[];
}
