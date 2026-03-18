import type { Prefix } from './prefix';
import type { LogLevel, LogParameters } from './types';

// ── DispatchFn ────────────────────────────────────────────────────────────────

export type DispatchOptions = {
  stackOffset?: number | null;
  /** Extra prefix items injected by spinners (icon badge, progress bar, …). */
  extraPrefixItems?: Prefix[];
  /**
   * TTY spinner signal: tells outputLog to register or remove a spinner in the
   * renderer instead of writing a regular log line.
   */
  ttySpinner?:
    | { action: 'register'; id: symbol; frames: string[]; color?: string; progress?: boolean }
    | { action: 'stop'; id: symbol };
};

export type DispatchFn = (
  level: LogLevel,
  args: LogParameters,
  options?: DispatchOptions,
) => void;
