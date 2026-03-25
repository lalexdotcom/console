import type { LogLevel, LogLevelStyle } from '../levels';

/**
 * A text element, optionally styled as a badge (`badge: true` adds brackets).
 * - `badge: true` + `style`/`css`: level label, e.g. `[INFO]`
 * - No extra properties: plain text inlined as-is (stack trace, progress label, …)
 */
export type TextPrefix = {
  type: 'text';
  text: string;
  /** ANSI style for TTY badge rendering. */
  style?: Partial<LogLevelStyle>;
  /** Full CSS string for browser devtools badge rendering. */
  css?: string;
  /** When true, renders with brackets: `[text]`. */
  badge?: true;
};

/**
 * A spinner icon element.
 * The renderer determines its visual form: circular CSS bubble in browser,
 * `[ x ]` brackets in TTY / console.
 */
export type IconPrefix = {
  type: 'icon';
  text: string;
  color?: string;
};

/**
 * A timestamp element.
 * When `ts` is defined, it is the Unix ms timestamp captured in the main
 * process at call time; otherwise the render time is used.
 */
export type DatePrefix = { type: 'date'; ts?: number };

/**
 * The log-level badge element.
 * Carries both the pre-computed display label (pretty mode) and semantic
 * fields (`level`, `severity`) intended for structured output (JSON/logfmt).
 */
export type LevelPrefix = {
  type: 'level';
  /** Native console method name — semantic field for structured output. */
  channel: string;
  /** Actual logger severity — semantic field for structured output. */
  severity: LogLevel;
  /** Pre-computed display label (padding already applied). */
  label: string;
  /** TTY ANSI style. */
  style?: Partial<LogLevelStyle>;
  /** Browser devtools CSS string. */
  css?: string;
  scope?: string;
};

/**
 * A callsite info element.
 *
 * When `structuredOnly` is false/absent, the value is rendered as a visible
 * prefix bubble in pretty mode AND serialised as `caller` in JSON/logfmt.
 *
 * When `structuredOnly` is true, pretty renderers skip this item entirely.
 * Only the JSON/logfmt serialiser picks it up. This is used for TRACE_LEVELS
 * (emerg/alert/crit) without stack=true: the call-site belongs in structured
 * logs, but pretty output already shows a full stack trace below the line,
 * making a prefix badge redundant and visually noisy.
 */
export type CallerPrefix = {
  type: 'caller';
  value: string;
  structuredOnly?: boolean;
};

/** Union of all prefix element types. */
export type Prefix =
  | TextPrefix
  | IconPrefix
  | DatePrefix
  | LevelPrefix
  | ProgressPrefix
  | CallerPrefix;

/**
 * A spinner progress element — ignored in pretty renderers, serialized as a
 * `progress` field in JSON/logfmt output.
 */
export type ProgressPrefix = {
  type: 'progress';
  value: number | { done: number; total: number };
};
