import type { LogLevel } from '../levels';
import { LEVEL_DISPLAY } from '../levels';
import type { LoggerOptions } from '../types';
import type { LevelPrefix, Prefix } from './types';

export type {
  DatePrefix,
  IconPrefix,
  LevelPrefix,
  Prefix,
  TextPrefix,
} from './types';

// ── Level prefix ──────────────────────────────────────────────────────────────

type PrefixOptions = Pick<LoggerOptions, 'pad'> & {
  scope?: string;
  /** Native console method name, resolved by the caller via `LEVEL_PARAMS[level].method.name`. */
  channel: string;
};

/**
 * Builds the semantic prefix items for a log line.
 * Returns a `Prefix[]` that is environment-agnostic.
 * Rendering (ANSI, %c CSS, or plain text) is deferred to the emit layer.
 */
export function getPrefix(level: LogLevel, options: PrefixOptions): Prefix[] {
  const { pad, scope, channel } = options;
  const display = LEVEL_DISPLAY[level];
  const label = (pad && display.paddedLabel) || display.label;
  const item: LevelPrefix = {
    type: 'level',
    channel: channel,
    severity: level,
    label,
    style: display.style,
    css: display.css,
  };
  if (scope) item.scope = scope;
  return [item];
}

// ── Date / duration prefix ────────────────────────────────────────────────────

/** Returns a formatted timestamp string: `[YYYY-MM-DD HH:MM:SS.mmm]`. */
export function getDatePrefix(date: Date): string {
  return `[${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')} ${`${date.getHours()}`.padStart(2, '0')}:${`${date.getMinutes()}`.padStart(2, '0')}:${`${date.getSeconds()}`.padStart(2, '0')}.${`${(date.getMilliseconds() / 1000).toFixed(3).slice(2, 5)}`.padStart(2, '0')}]`;
}

/** Overload 1: formats a duration given in milliseconds → `[+1.234s]`. */
export function getDurationPrefix(durationMs: number): string;
/** Overload 2: formats the elapsed time between two timestamps → `[+1.234s]`. */
export function getDurationPrefix(since: Date, to?: Date): string;
export function getDurationPrefix(
  sinceOrDurationMs: Date | number,
  to?: Date,
): string {
  const duration =
    typeof sinceOrDurationMs === 'number'
      ? sinceOrDurationMs
      : (to ?? new Date()).valueOf() - sinceOrDurationMs.valueOf();
  return `[+${(duration / 1000).toFixed(3)}s]`;
}
