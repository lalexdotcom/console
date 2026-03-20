import { LogLevels } from '../../../levels';
import { isNode, isNodeTTY } from '../../../utils/env';
import type { DispatchFn } from '../../dispatch';
import type {
  ExecOptions,
  GenericLogger,
  LoggerSpinner,
  LogLevel,
  LogMethod,
  SpinnerOptions,
} from '../../types';
import { createBrowserSpinner } from './browser';
import { createConsoleSpinner } from './console';
import { createTTYSpinner } from './tty';

// ── isTTY ─────────────────────────────────────────────────────────────────────

const isTTY = isNodeTTY;

// ── noopSpinner ───────────────────────────────────────────────────────────────

export const noopSpinner: LoggerSpinner = {
  start() {
    return noopSpinner;
  },
  update(_text: string) {},
  success(_text?: string) {},
  fail(_text?: string) {},
  stop() {},
};

// ── makeExecFn ────────────────────────────────────────────────────────────────

/**
 * Returns the `.exec()` implementation for a given `LogMethod`.
 * Delegates entirely to `.spin()` so real-spinner upgrades are automatic.
 */
export function makeExecFn(spinFn: LogMethod['spin']) {
  return async <T>(
    promiseOrFactory: Promise<T> | (() => Promise<T>),
    options?: ExecOptions,
  ): Promise<T> => {
    const label = options?.label ?? 'Exec';
    const factory =
      typeof promiseOrFactory === 'function'
        ? promiseOrFactory
        : () => promiseOrFactory;
    const spinner = spinFn(label, { duration: true });
    spinner.start();
    try {
      const result = await factory();
      spinner.success(label);
      return result;
    } catch (e) {
      spinner.fail(e instanceof Error ? `${label}: ${e.message}` : label);
      throw e;
    }
  };
}

// ── selectSpinnerFactory ──────────────────────────────────────────────────────

function selectSpinnerFactory() {
  if (isNode && isTTY) return createTTYSpinner;
  if (isNode) return createConsoleSpinner;
  return createBrowserSpinner;
}

// ── createSpinnerMixin ────────────────────────────────────────────────────────

/**
 * Attaches `.spin()` and `.exec()` to each existing level method of `logger`.
 * `dispatch` is used by the spinner to route output through `outputLog` at the
 * correct level — spinners are aware of the logger state that created them.
 */
export function createSpinnerMixin(
  logger: GenericLogger,
  dispatch: DispatchFn,
): { [key in LogLevel]: LogMethod } {
  const result = {} as { [key in LogLevel]: LogMethod };

  for (const level of LogLevels) {
    const fn = logger[level];

    const spinFunction: LogMethod['spin'] = (
      message: string,
      options: Omit<SpinnerOptions, 'text'> = {},
    ): LoggerSpinner => {
      const factory = selectSpinnerFactory();
      return factory(level, message, options, dispatch);
    };

    // Mutate fn in place — preserves the reference already stored on the logger.
    Object.assign(fn, { spin: spinFunction, exec: makeExecFn(spinFunction) });

    result[level] = fn;
  }

  return result;
}
