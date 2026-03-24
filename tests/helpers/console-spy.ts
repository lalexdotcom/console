/** A captured console method call with the method name and its arguments. */
export interface ConsoleCall {
  method: string;
  args: unknown[];
}

/**
 * Console methods to intercept. Includes groupCollapsed/groupEnd because the
 * logger wraps TRACE_LEVELS output in groupCollapsed in browser devtools mode.
 */
const SPY_METHODS = [
  'log',
  'info',
  'debug',
  'warn',
  'error',
  'groupCollapsed',
  'groupEnd',
] as const;

type SpyMethod = (typeof SPY_METHODS)[number];

/**
 * Spies on console methods during callback execution.
 * Returns an array of { method, args } for every intercepted call.
 * Synchronous — the logger's browser dispatch is synchronous.
 *
 * @param fn - Callback to execute while console is intercepted.
 * @returns Array of ConsoleCall objects captured during fn().
 */
export function spyOnConsole(fn: () => void): ConsoleCall[] {
  const calls: ConsoleCall[] = [];
  const originals = Object.fromEntries(
    SPY_METHODS.map((m) => [m, console[m as keyof Console]]),
  ) as Record<SpyMethod, (...args: unknown[]) => void>;

  for (const method of SPY_METHODS) {
    (console as Record<string, unknown>)[method] = (...args: unknown[]) => {
      calls.push({ method, args });
    };
  }

  try {
    fn();
  } finally {
    for (const method of SPY_METHODS) {
      (console as Record<string, unknown>)[method] = originals[method];
    }
  }

  return calls;
}
