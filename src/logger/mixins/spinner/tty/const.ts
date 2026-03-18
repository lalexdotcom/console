import type { SpinnerIcon } from '../const';

/** How often (ms) the TTY spinner redraws its animation frame. */
export const TTY_SPINNER_INTERVAL = 150; //ms.

// ── TTYSpinnerIcon ────────────────────────────────────────────────────────────

/**
 * Extends SpinnerIcon to support animated frames: `icon` can be an array of
 * strings instead of a single character.
 */
export type TTYSpinnerIcon = Omit<SpinnerIcon, 'icon'> & {
  icon: string | string[];
};

// ── Defaults ──────────────────────────────────────────────────────────────────

export const TTY_DEFAULT_RUNNING_ICON: TTYSpinnerIcon = {
  icon: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
  color: 'cyan',
};

export const TTY_DEFAULT_SUCCESS_ICON: SpinnerIcon = {
  icon: '✔',
  color: 'green',
};
export const TTY_DEFAULT_FAIL_ICON: SpinnerIcon = { icon: '✖', color: 'red' };
