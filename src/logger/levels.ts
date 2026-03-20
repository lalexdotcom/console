import type { InspectOptions } from 'node:util';
import type { LogLevel } from '../levels';
import { LEVEL_METHODS, LogLevels } from '../levels';
import { isBrowser, isNode } from '../utils/env';

export type { LogLevel } from '../levels';

export const DEFAULT_INSPECT_OPTIONS: InspectOptions = {
  depth: 5,
  colors: true,
};

// ── Level display styles ─────────────────────────────────────────────────────

/** ANSI / CSS style applied to a level's prefix badge. */
export type LogLevelStyle = {
  'background-color'?: string;
  color?: string;
};

/** Default padding + border-radius for browser console badges. */
export const DEFAULT_BROWSER_STYLE = {
  padding: '1px 4px',
  'border-radius': '4px',
};

/** Fallback style applied when a level has no explicit style. */
export const DEFAULT_LEVEL_STYLE: LogLevelStyle = {
  'background-color': 'grey',
  color: 'white',
};

/** Full descriptor for a log level, including display label and dispatch methods. */
export type LogLevelParam = {
  label: string;
  paddedLabel?: string;
  methods: (typeof console.log)[];
  style?: Partial<LogLevelStyle>;
  css?: string;
};

/** Static display config for a level (label + style only, no dispatch methods). */
export type LogLevelDisplay = Pick<
  LogLevelParam,
  'label' | 'paddedLabel' | 'style' | 'css'
>;

/**
 * Static display data for each level: label and ANSI/CSS style.
 * Does not include dispatch `methods` (those reference `activeConsole` and live in index.ts).
 * Mutated at module load time to add `paddedLabel` (Node) and `css` (browser).
 */
export const LEVEL_DISPLAY: { [key in LogLevel]: LogLevelDisplay } = {
  emerg: { label: 'EMERGENCY', style: { 'background-color': 'red' } },
  alert: { label: 'ALERT', style: { 'background-color': 'red' } },
  crit: { label: 'CRITICAL', style: { 'background-color': 'red' } },
  error: { label: 'ERROR', style: { 'background-color': 'red' } },
  warn: {
    label: 'WARNING',
    style: { color: 'white', 'background-color': 'orange' },
  },
  notice: { label: 'NOTICE', style: { 'background-color': 'blue' } },
  success: { label: 'SUCCESS', style: { 'background-color': 'green' } },
  info: { label: 'INFO' },
  verb: { label: 'VERBOSE', style: { 'background-color': 'mediumpurple' } },
  debug: {
    label: 'DEBUG',
    style: { 'background-color': 'yellow', color: 'black' },
  },
  wth: {
    label: 'WHO CARES?',
    style: { 'background-color': 'lightgray', color: 'black' },
  },
};

/**
 * Converts a LogLevelStyle object to an inline CSS string.
 * Merges with DEFAULT_BROWSER_STYLE so padding/border-radius are always present.
 */
export function css(style: Partial<LogLevelStyle>): string {
  const cssObject: Record<string, unknown> = {
    ...DEFAULT_BROWSER_STYLE,
    ...style,
  };
  return Object.entries(cssObject)
    .map(([key, value]) => `${key}: ${value}`)
    .join(';');
}

// ── LEVEL_DISPLAY initialization ─────────────────────────────────────────────

// In Node: compute a consistent padded label so all levels column-align.
if (isNode) {
  const padSize = Math.max(
    ...Object.values(LEVEL_DISPLAY).map((d) => d.label.length),
  );
  for (const lvl of Object.values(LEVEL_DISPLAY)) {
    lvl.paddedLabel = lvl.label
      .padEnd(lvl.label.length + (padSize - lvl.label.length) / 2, ' ')
      .padStart(padSize, ' ');
  }
}

// For all environments: merge DEFAULT_LEVEL_STYLE and pre-compute css string.
for (const lvl of Object.values(LEVEL_DISPLAY)) {
  lvl.style = { ...DEFAULT_LEVEL_STYLE, ...lvl.style };
  if (isBrowser) lvl.css = css(lvl.style);
}
