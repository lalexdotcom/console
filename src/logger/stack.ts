import { isNode } from './env';

// ── Stack introspection ───────────────────────────────────────────────────────

/**
 * Number of internal frames to skip before reaching user code.
 *
 * [0] "Error"
 * [1]  at getCallerStack
 * [2]  at getLogCallerInfo
 * [3]  at prepareLog
 * [4]  at emit
 * [5]  at fn  (createLogMethod closure)
 * [6]  at <user call-site>  ← target
 */
export const STACK_OFFSET = 6;

/**
 * Returns the raw stack frame string at the given depth.
 *
 * @param level - Index into the `Error.stack` lines array (0 = "Error" header).
 * @returns The frame string, or `undefined` if the stack is unavailable or too shallow.
 */
const getCallerStack = (level: number): string | undefined => {
  let err: Error;
  try {
    throw new Error();
  } catch (e) {
    err = e as Error;
  }
  return err.stack?.split('\n').slice(level)[0];
};

/**
 * Extracts structured call-site information from the current stack.
 *
 * @param stackOffset - Additional frames to skip on top of `DEFAULT_STACK_OFFSET`.
 * @returns An object with `fileName`, `lineNumber`, `columnNumber` (and optionally
 *   `functionName` in browser mode), or `undefined` if introspection fails.
 */
export const getLogCallerInfo = (stackOffset = 0) => {
  const stack = getCallerStack(STACK_OFFSET + stackOffset);
  if (!stack) return undefined;
  return isNode
    ? stack.match(
        /at (?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)/,
      )?.groups
    : stack.match(
        /at (?<functionName>.*) \(?(?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)\)/,
      )?.groups;
};
