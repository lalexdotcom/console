import type { SpinnerIcon } from '../const';

/** How often (ms) the browser spinner emits a new tick line. */
export const BROWSER_SPINNER_INTERVAL =
  typeof import.meta !== 'undefined' && import.meta.env?.DEV ? 500 : 5_000;

export const BROWSER_PROGRESS_RUNNING_COLOR = 'dodgerblue';

export const BROWSER_DEFAULT_RUNNING_ICON: SpinnerIcon = {
  icon: '-',
  color: 'dodgerblue',
};

export const BROWSER_DEFAULT_SUCCESS_ICON: SpinnerIcon = {
  icon: '✔',
  color: 'green',
};
export const BROWSER_DEFAULT_FAIL_ICON: SpinnerIcon = {
  icon: '✖',
  color: 'red',
};
