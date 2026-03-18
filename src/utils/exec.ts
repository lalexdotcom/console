import { L, type RootLogger } from '../logger';

export type ExecUtilOptions = {
  /** Human-readable name of the action, shown in the spinner. */
  label?: string;
  /** Returns the spinner text while the promise is pending. Defaults to the label. */
  progressLabel?: (label: string) => string;
  /** Returns the spinner text on success. Defaults to progressLabel. */
  completeLabel?: (label: string) => string;
  /** Logger instance to use; falls back to a scoped root logger. */
  logger?: RootLogger;
  /**
   * Controls whether a spinner is displayed:
   * - `false` → silent execution, no spinner.
   * - `true`  → spinner under the default "exec" scope.
   * - `string` → spinner under a custom scope name.
   */
  debug?: boolean | string;
};

const DEFAULT_EXEC_OPTIONS = {
  label: 'Action',
  progressLabel: (label: string) => `${label}`,
  completeLabel: (label: string) => `${label}`,
};

/**
 * Executes a promise (or a factory returning one) while displaying a spinner.
 *
 * When `options.debug` is `false`, the promise is run silently with no spinner.
 * On success the spinner transitions to ✔; on failure it transitions to ✖ and
 * the original error is re-thrown so callers can handle it.
 *
 * NOTE: The `setInterval` call for `progressInterval` has no delay argument,
 * which collapses to 0 ms — meaning the update callback fires as fast as the
 * event loop allows. This is intentional to keep the spinner text fresh, but
 * it should be replaced with a reasonable debounce interval.
 */
export async function exec<T>(
  promiseOrFactory: Promise<T> | (() => Promise<T>),
  label?: ExecUtilOptions['label'],
  options?: Omit<ExecUtilOptions, 'label'>,
) {
  // Normalise: always work with a factory so we defer execution when needed.
  const promiseGenerator =
    typeof promiseOrFactory === 'function'
      ? promiseOrFactory
      : () => promiseOrFactory;

  // Short-circuit when the spinner is explicitly disabled.
  if (!(options?.debug ?? true)) return promiseGenerator();

  const spinner = (
    options?.logger ??
    L.scope(typeof options?.debug === 'string' ? options.debug : 'exec')
  ).verb.spin(label ?? `Start ${label}`, { duration: true });

  // Periodically push a text update to the spinner while the promise runs.
  // ⚠️  Missing interval delay — see JSDoc note above.
  const progressInterval = setInterval(() =>
    spinner.update(
      (options?.progressLabel ?? DEFAULT_EXEC_OPTIONS.progressLabel)(
        label ?? DEFAULT_EXEC_OPTIONS.label,
      ),
    ),
  );

  const res = await promiseGenerator()
    .then((res) => {
      clearInterval(progressInterval);
      spinner.success(
        (
          options?.completeLabel ??
          options?.progressLabel ??
          DEFAULT_EXEC_OPTIONS.progressLabel
        )(label ?? DEFAULT_EXEC_OPTIONS.label),
      );
      return res;
    })
    .catch(async (e) => {
      clearInterval(progressInterval);
      spinner.fail(
        e instanceof Error
          ? `${label ?? DEFAULT_EXEC_OPTIONS.label} failed (${e.stack})`
          : `${label ?? DEFAULT_EXEC_OPTIONS.label} failed`,
      );
      throw e;
    });
  return res;
}
