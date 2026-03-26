import type { RootLogger } from '../../src/types';

/**
 * Contract every environment adapter must satisfy.
 * Suite files depend only on this interface — never on a concrete implementation.
 *
 * @param name    - Human-readable label shown in describe() titles (e.g. "node-console:json")
 * @param setup   - Called in beforeEach: resets adapter state and applies format config
 * @param capture - Runs fn(), intercepts all output, returns normalised lines (split on \n, empty stripped)
 * @param logger  - Direct access to the RootLogger under test
 */
export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  capture(fn: () => void | Promise<void>): Promise<string[]>;
  readonly logger: RootLogger;
}
