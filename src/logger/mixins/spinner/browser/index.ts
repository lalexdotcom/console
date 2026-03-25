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
  BROWSER_DEFAULT_FAIL_ICON,
  BROWSER_DEFAULT_RUNNING_ICON,
  BROWSER_DEFAULT_SUCCESS_ICON,
  BROWSER_PROGRESS_RUNNING_COLOR,
  BROWSER_SPINNER_INTERVAL,
} from './const';

// Progress bar exemple
// console.log('%c %c %d%%', 'background:linear-gradient(to right,#4caf50 0%,#4caf50 33%,#e0e0e0 33%,#e0e0e0 100%);padding:0px 60px;line-height:0.5;border-radius:2px;', 'color:#4caf50;font-weight:bold;', 33);

export function createBrowserSpinner(
  level: LogLevel,
  text: string,
  options: Omit<SpinnerOptions, 'text'> & { console?: true },
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
        ? BROWSER_DEFAULT_SUCCESS_ICON
        : state === 'fail'
          ? BROWSER_DEFAULT_FAIL_ICON
          : BROWSER_DEFAULT_RUNNING_ICON;
    const suffix =
      showDuration && elapsedMs > 0 ? ` (+${formatDuration(elapsedMs)})` : '';

    const extraPrefixItems: Prefix[] = [];
    if (opts?.progress != null) {
      const progressColor =
        state === 'running' ? BROWSER_PROGRESS_RUNNING_COLOR : def.color;
      const ratio =
        typeof opts.progress === 'number'
          ? Math.max(0, Math.min(1, opts.progress))
          : opts.progress.total > 0
            ? Math.max(0, Math.min(1, opts.progress.done / opts.progress.total))
            : 0;
      const pct = Math.round(ratio * 100);
      const label =
        typeof opts.progress === 'number'
          ? `(${pct}%)`
          : `(${opts.progress.done}/${opts.progress.total})`;
      const c = progressColor ?? 'green';
      const barCss = `background:linear-gradient(to right,${c} 0%,${c} ${pct}%,lightgrey ${pct}%,lightgrey 100%);padding:0px 48px;line-height:0.5;border-radius:2px;`;
      const labelCss = `color:${c};font-weight:bold;`;
      extraPrefixItems.push(
        { type: 'text', text: ' ', css: barCss },
        { type: 'text', text: label, css: labelCss },
      );
    } else {
      const iconContent =
        opts?.icon === null
          ? def.icon
          : (opts?.icon ??
            options[`${state === 'running' ? 'running' : state}Icon`] ??
            def.icon);
      if (iconContent !== '') {
        extraPrefixItems.push({
          type: 'icon',
          text: iconContent,
          color: def.color,
        });
      }
    }

    dispatch(level, [`${t}${suffix}`], { stackOffset, extraPrefixItems });
  };

  return createSequentialSpinner({
    text,
    options,
    interval: BROWSER_SPINNER_INTERVAL,
    render,
  });
}
