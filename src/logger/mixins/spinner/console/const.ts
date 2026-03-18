import type { SpinnerIcon } from '../const';

/** How often (ms) the console (non-TTY) spinner emits a new tick line. */
export const CONSOLE_SPINNER_INTERVAL =
  (typeof process !== 'undefined' && process.env?.NODE_ENV !== 'production') ||
  (typeof import.meta !== 'undefined' && import.meta.env?.DEV)
    ? 500
    : 5_000;

/** Character used for the filled portion of the progress bar. */
export const CONSOLE_PROGRESS_BAR_DONE_CHAR = '●';
/** Character used for the unfilled portion of the progress bar. */
export const CONSOLE_PROGRESS_BAR_BACKGROUND_CHAR = '-';

export const CONSOLE_DEFAULT_RUNNING_ICON: SpinnerIcon = {
  icon: '⋯',
  color: 'dodgerblue',
};

export const CONSOLE_DEFAULT_SUCCESS_ICON: SpinnerIcon = {
  icon: '✔',
  color: 'green',
};
export const CONSOLE_DEFAULT_FAIL_ICON: SpinnerIcon = {
  icon: '✖',
  color: 'red',
};
