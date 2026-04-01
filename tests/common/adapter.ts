import type { LogOutput } from './output';

/**
 * Contract every environment adapter must satisfy.
 * Suite files depend only on this interface — never on a concrete implementation.
 *
 * @param name    - Human-readable label shown in describe() titles (e.g. "node-console:json")
 * @param setup   - Called in beforeEach: resets adapter state and applies format config
 * @param parse   - Parses one raw output line into a LogOutput; returns null for non-log lines
 * @param capture - Runs fn(), intercepts all output, maps each line through parse(), filters nulls
 */
export interface TestAdapter {
  name: string;
  setup(): void | Promise<void>;
  parse(line: string): LogOutput | null;
  capture(fn: () => void | Promise<void>): Promise<LogOutput[]>;
}
