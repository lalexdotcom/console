import { LEVEL_METHODS } from '../levels';
import { isNode } from '../utils/env';
import { DEFAULT_INSPECT_OPTIONS } from './levels';
import type { LoggerOptions, LogLevel } from './types';

// ── Logger defaults ───────────────────────────────────────────────────────────

/** The most permissive level — the one with the highest numeric value in LEVEL_METHODS. */
const MOST_PERMISSIVE_LEVEL = (
  Object.entries(LEVEL_METHODS) as [LogLevel, number][]
).reduce((a, b) => (b[1] > a[1] ? b : a))[0];

export const DEFAULT_LOGGER_OPTIONS: LoggerOptions = {
  enabled: true,
  /** Show everything by default — the most permissive level. */
  level: MOST_PERMISSIVE_LEVEL,

  stack: false,
  date: false,
  pad: isNode,
  color: true,

  uid: false,

  inspect: DEFAULT_INSPECT_OPTIONS,
};
