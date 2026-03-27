/**
 * Normalise a single output line for stable equality comparisons across
 * environments and between main/worker captures.
 *
 * Strips:
 * - ISO timestamps:  "2026-03-26T12:34:56.789Z" → "<ts>"
 * - Caller paths:    "(file.ts:28:21)"            → "(<caller>)"
 * - ANSI escapes:    "\x1b[32m"                   → ""
 *
 * @param s - A single captured output line.
 * @returns The normalised line.
 */
export function normalise(s: string): string {
  return s
    .replace(/\d{4}-\d{2}-\d{2}T[^\s]+/g, '<ts>')
    .replace(/\([^)]+:\d+:\d+\)/g, '(<caller>)')
    .replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Normalise an array of captured output lines.
 *
 * Behaviour:
 * - Filters out stack-trace lines (lines matching /^\s+at\s+/).
 *   These are emitted by TRACE_LEVELS (error/warn) and differ between main and
 *   worker captures because the calls originate from different source lines.
 * - Applies normalise() to each remaining line.
 *
 * @param lines - Array of captured output lines (split on \n, empty stripped).
 * @returns Filtered and normalised lines.
 */
export function normaliseLines(lines: string[]): string[] {
  return lines
    .filter((l) => !/^\s+at\s+/.test(l))
    .map(normalise);
}
