import { LogLevels } from '../levels';
import type {
  GenericLogger,
  LoggerOptions,
  LoggerSpinner,
  LoggerState,
  LogLevel,
  LogParameters,
  RootLogger,
  ScopeLogger,
  SpinnerOptions,
} from '../types';
import { makeExecFn, noopSpinner } from './spinner';

// ── EmitFn ────────────────────────────────────────────────────────────────────

/** Shape of the `emit` function injected from `index.ts`. */
type EmitFn = (
  level: LogLevel,
  args: LogParameters,
  state: LoggerState,
  self: RootLogger | ScopeLogger,
  options?: { options?: Partial<LoggerOptions> },
) => void;

// ── createOneShot ─────────────────────────────────────────────────────────────

function createOneShot(
  state: LoggerState,
  self: RootLogger | ScopeLogger,
  overrides: Partial<Omit<LoggerOptions, 'level'>>,
  emit: EmitFn,
): GenericLogger {
  const result = {
    log: (level: LogLevel, ...args: LogParameters) =>
      emit(level, args, state, self, { options: overrides }),
  } as unknown as GenericLogger;

  for (const level of LogLevels) {
    const fn = (...args: LogParameters) =>
      emit(level, args, state, self, { options: overrides });
    fn.spin = (
      _message: string,
      _options?: Omit<SpinnerOptions & { console?: true }, 'text'>,
    ): LoggerSpinner => noopSpinner;
    fn.exec = makeExecFn(fn.spin);
    (result as unknown as Record<string, unknown>)[level] = fn;
  }

  return result;
}

// ── createOverrideMixin ───────────────────────────────────────────────────────

/**
 * Returns `{ options }` — the one-shot option-override method.
 *
 * `emit` is injected from `index.ts` to avoid a circular dependency
 * (emit relies on module-level registry / activeConsole state).
 */
export function createOverrideMixin(
  state: LoggerState,
  self: RootLogger | ScopeLogger,
  emit: EmitFn,
) {
  return {
    options: (overrides: Partial<Omit<LoggerOptions, 'level'>>) =>
      createOneShot(state, self, overrides, emit),
  };
}
