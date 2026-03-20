import { isNode } from './env';

// ── Stack introspection ───────────────────────────────────────────────────────

/**
 * Number of internal frames to skip in the standard logger call path.
 *
 * [0] "Error"
 * [1]  at captureLines
 * [2]  at getLogCallerInfo / getCallerStackTrace
 * [3]  at prepareLog / emitConsole
 * [4]  at emit
 * [5]  at fn  (createLogMethod closure)
 * [6]  at <user call-site>  ← target
 */
export const STACK_OFFSET = 6;

/** Captures the raw call stack as an array of lines. Line [0] is always "Error". */
const captureLines = (): string[] => {
  try {
    throw new Error();
  } catch (e) {
    return (e as Error).stack?.split('\n') ?? [];
  }
};

/** Parses a single raw stack frame string into structured fields. */
const parseFrame = (frame: string) => {
  if (isNode) {
    // Node format 1: "at functionName (filePath:line:col)" — named function
    const withParens = frame.match(
      /at (?<functionName>.+?) \((?<fileName>.+):(?<lineNumber>[0-9]+):(?<columnNumber>[0-9]+)\)/,
    );
    if (withParens?.groups) return withParens.groups;
    // Node format 2: "at filePath:line:col" — anonymous / top-level
    return frame.match(
      /at (?<fileName>.+):(?<lineNumber>[0-9]+):(?<columnNumber>[0-9]+)/,
    )?.groups;
  }
  return frame.match(
    /at (?<functionName>.*) \(?(?<fileName>.*):(?<lineNumber>[0-9]*):(?<columnNumber>[0-9]*)\)/,
  )?.groups;
};

/**
 * Extracts structured call-site information using `STACK_OFFSET` as the base
 * depth. Suited for the standard logger call path (prepareLog → emit → fn → user).
 *
 * @param stackOffset - Additional frames to skip on top of `STACK_OFFSET`.
 */
export const getLogCallerInfo = (stackOffset = 0) => {
  const frame = captureLines()[STACK_OFFSET + stackOffset];
  if (!frame) return undefined;
  return parseFrame(frame);
};

/**
 * Returns the full remaining stack trace as a plain string starting at
 * `STACK_OFFSET + stackOffset`, suitable for display after a log line.
 *
 * @param stackOffset - Additional frames to skip on top of `STACK_OFFSET`.
 */
export const getCallerStackTrace = (stackOffset = 0): string | undefined => {
  const lines = captureLines().slice(STACK_OFFSET + stackOffset);
  return lines.length ? lines.join('\n') : undefined;
};

/**
 * Returns the full remaining stack trace as a plain string starting at an
 * **absolute** depth. Used by the worker proxy to capture a full callstack
 * at the user call-site before sending over IPC.
 *
 * @param absoluteDepth - Absolute index into the `Error.stack` lines array.
 */
export const getCallerStackTraceAt = (absoluteDepth: number): string | undefined => {
  const lines = captureLines().slice(absoluteDepth);
  return lines.length ? lines.join('\n') : undefined;
};

/**
 * Returns the raw (unparsed) stack frame string at an absolute depth.
 * Used as a fallback when `parseFrame` cannot match the frame format,
 * e.g. anonymous top-level frames in the browser.
 *
 * @param absoluteDepth - Absolute index into the `Error.stack` lines array.
 */
export const getRawFrameAt = (absoluteDepth: number): string | undefined => {
  const frame = captureLines()[absoluteDepth]?.trim();
  return frame || undefined;
};

/**
 * Extracts structured call-site information from an **absolute** frame depth.
 *
 * Use this when calling from a context with a known but different call-stack
 * depth than the logger internals. The worker proxy uses depth 4:
 *
 * [0] "Error"
 * [1]  at captureLines
 * [2]  at getCallerInfoAt
 * [3]  at fn  (level method closure in proxy.ts)
 * [4]  at <user call-site>  ← target
 *
 * @param absoluteDepth - Absolute index into the `Error.stack` lines array.
 */
export const getCallerInfoAt = (absoluteDepth: number) => {
  const frame = captureLines()[absoluteDepth];
  if (!frame) return undefined;
  return parseFrame(frame);
};
