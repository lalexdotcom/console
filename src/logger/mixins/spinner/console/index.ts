import { colorize } from '../../../../utils/color';
import type { DispatchFn } from '../../../dispatch';
import type { Prefix } from '../../../prefix';
import type {
  LogLevel,
  SpinnerOptions,
  SpinnerUpdateOptions,
} from '../../../types';
import type { SpinnerRenderFn } from '../sequential';
import { createSequentialSpinner, formatDuration } from '../sequential';
import {
  CONSOLE_DEFAULT_FAIL_ICON,
  CONSOLE_DEFAULT_RUNNING_ICON,
  CONSOLE_DEFAULT_SUCCESS_ICON,
  CONSOLE_PROGRESS_BAR_BACKGROUND_CHAR,
  CONSOLE_PROGRESS_BAR_DONE_CHAR,
  CONSOLE_SPINNER_INTERVAL,
} from './const';

function buildConsoleProgressText(
  progress: number | { done: number; total: number },
  color: string,
): string {
  const isRatio = typeof progress === 'number';
  const ratio = isRatio
    ? Math.max(0, Math.min(1, progress))
    : progress.total > 0
      ? Math.max(0, Math.min(1, progress.done / progress.total))
      : 0;
  const pct = Math.round(ratio * 100);
  const label = isRatio ? `(${pct}%)` : `(${progress.done}/${progress.total})`;
  const width = 8;
  const filled = Math.round(ratio * width);
  const doneStr =
    colorize(CONSOLE_PROGRESS_BAR_DONE_CHAR.repeat(filled), { color }) ??
    CONSOLE_PROGRESS_BAR_DONE_CHAR.repeat(filled);
  const bgStr =
    colorize(CONSOLE_PROGRESS_BAR_BACKGROUND_CHAR.repeat(width - filled), { color: 'grey' }) ??
    CONSOLE_PROGRESS_BAR_BACKGROUND_CHAR.repeat(width - filled);
  const labelStr = colorize(label, { color }) ?? label;
  return `[${doneStr}${bgStr}] ${labelStr}`;
}

export function createConsoleSpinner(
  level: LogLevel,
  text: string,
  options: Omit<SpinnerOptions, 'text'>,
  dispatch: DispatchFn,
) {
  const showDuration = options.duration ?? false;

  const render: SpinnerRenderFn = (
    state,
    t,
    elapsedMs,
    opts?: SpinnerUpdateOptions,
    stackOffset?: number | null,
  ) => {
    const def =
      state === 'success'
        ? CONSOLE_DEFAULT_SUCCESS_ICON
        : state === 'fail'
          ? CONSOLE_DEFAULT_FAIL_ICON
          : CONSOLE_DEFAULT_RUNNING_ICON;
    // User icon override uses the default color for that state.
    const duration =
      showDuration && elapsedMs > 0 ? ` (+${formatDuration(elapsedMs)})` : '';
    const extraPrefixItems: Prefix[] = [];
    if (opts?.progress != null) {
      extraPrefixItems.push({ type: 'text', text: buildConsoleProgressText(opts.progress, def.color ?? 'dodgerblue') });
      extraPrefixItems.push({ type: 'progress', value: opts.progress });
    } else {
      const iconContent =
        opts?.icon ??
        options[`${state === 'running' ? 'running' : state}Icon`] ??
        def.icon;
      extraPrefixItems.push({ type: 'icon', text: iconContent, color: def.color });
    }
    dispatch(level, [`${t}${duration}`], { stackOffset, extraPrefixItems });
  };

  return createSequentialSpinner({
    text,
    options,
    interval: CONSOLE_SPINNER_INTERVAL,
    render,
  });
}
