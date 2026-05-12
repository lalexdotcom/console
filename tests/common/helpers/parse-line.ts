import { parseLogfmt } from '../logfmt.helper';
import type { LogOutput } from '../output';

/** Maps pretty-format badge text to the LogOutput level string. */
const BADGE_TO_LEVEL: Record<string, string> = {
  EMERGENCY: 'emerg',
  ALERT: 'alert',
  CRITICAL: 'crit',
  ERROR: 'error',
  WARNING: 'warn',
  NOTICE: 'notice',
  SUCCESS: 'success',
  INFO: 'info',
  VERBOSE: 'verb',
  DEBUG: 'debug',
  'WHO CARES?': 'wth',
};

/** Strips ANSI colour escape sequences from a string. */
function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Attempts to parse a pretty-format line (spinner bracket or level badge).
 * Returns a LogOutput when a known pretty pattern is found, or null otherwise.
 *
 * Console spinner output format: `[BADGE <scope>] [ icon ] message`
 * The spinner bracket immediately follows the badge — not at the start of the line.
 */
function parsePrettyLine(stripped: string, raw: string): LogOutput | null {
  // Level badge: [BADGE] or [BADGE <scope>], optionally followed by spinner bracket
  const badgeMatch = stripped.match(/^\[([A-Z ?]+?)(?:\s*<([^>]+)>)?\]\s*(.*)/);
  if (badgeMatch) {
    const remainder = badgeMatch[3];
    // Check if remainder is a spinner bracket: [ icon ] message
    const iconMatch = remainder.match(/^\[\s*([^\[\]\s]{1,3})\s*\]\s*(.*)/);
    if (iconMatch) {
      const icon = iconMatch[1];
      const spinnerState: LogOutput['spinnerState'] =
        icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
      return { raw, icon, spinnerState, scope: badgeMatch[2], msg: iconMatch[2].trim() };
    }
    return {
      raw,
      level: BADGE_TO_LEVEL[badgeMatch[1].trim()],
      scope: badgeMatch[2],
      msg: remainder.trim(),
    };
  }

  // Standalone spinner bracket (no leading badge): [ ⋯ ] / [ ✔ ] / [ ✖ ]
  const iconMatch = stripped.match(/^\[\s*([^\[\]\s]{1,3})\s*\]\s*(.*)/);
  if (iconMatch) {
    const icon = iconMatch[1];
    const spinnerState: LogOutput['spinnerState'] =
      icon === '✔' ? 'success' : icon === '✖' ? 'fail' : 'running';
    return { raw, icon, spinnerState, msg: iconMatch[2].trim() };
  }

  return null;
}

/**
 * Format-agnostic line parser: detects JSON, logfmt, or pretty output and
 * returns a normalised LogOutput.  Returns null for blank lines and stack
 * trace lines (lines that start with whitespace + "at ").
 *
 * This allows every test adapter to correctly parse lines regardless of which
 * format the suite forces at test time via L.format.
 *
 * @param line - A single intercepted console output line (raw, with ANSI codes).
 * @returns Parsed LogOutput, or null if the line should be ignored.
 */
export function parseAnyLine(line: string): LogOutput | null {
  if (!line.trim()) return null;
  const stripped = stripAnsi(line);
  if (/^\s+at /.test(stripped)) return null;

  // JSON: lines starting with '{'
  if (stripped.trimStart().startsWith('{')) {
    try {
      const p = JSON.parse(stripped.trim()) as Record<string, unknown>;
      if (typeof p.severity === 'string') {
        return {
          raw: line,
          level: p.severity,
          scope: typeof p.scope === 'string' ? p.scope : undefined,
          msg: typeof p.msg === 'string' ? p.msg : undefined,
          date: typeof p.time === 'string' ? p.time : undefined,
          caller: typeof p.caller === 'string' ? p.caller : undefined,
          progress: typeof p.progress === 'number' ? p.progress : undefined,
        };
      }
    } catch {
      // Not valid JSON — fall through
    }
  }

  // Pretty: bracket spinner or level badge
  const prettyResult = parsePrettyLine(stripped, line);
  if (prettyResult) return prettyResult;

  // Logfmt: key=value pairs
  const p = parseLogfmt(line);
  if (p.severity) {
    return {
      raw: line,
      level: p.severity,
      scope: p.scope,
      msg: p.msg,
      date: p.time,
      caller: p.caller,
    };
  }

  // Unknown format — return raw only
  return { raw: line };
}
