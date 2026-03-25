import type { DispatchFn } from '../../../dispatch';
import type {
  LoggerSpinner,
  LogLevel,
  SpinnerOptions,
  SpinnerUpdateOptions,
} from '../../../types';
import {
  TTY_DEFAULT_FAIL_ICON,
  TTY_DEFAULT_RUNNING_ICON,
  TTY_DEFAULT_SUCCESS_ICON,
  type TTYSpinnerIcon,
} from './const';
import {
  renderProgressBar,
  renderProgressLabel,
  ttyRenderer,
} from './renderer';

// ── helpers ──────────────────────────────────────────────────────────────

function resolveFrames(icon: TTYSpinnerIcon): string[] {
  return Array.isArray(icon.icon) ? [...icon.icon] : icon.icon.split('');
}

// ── createTTYSpinner ───────────────────────────────────────────────────────

/**
 * TTY-mode spinner: all output (register, stop) is routed through `dispatch` so
 * that `outputLog` handles prefix computation, level filtering, and renderer
 * delegation in a single place.
 * Only `update()` touches the renderer directly (it mutates state, not output).
 */
export function createTTYSpinner(
  level: LogLevel,
  text: string,
  options: Omit<SpinnerOptions, 'text'>,
  dispatch: DispatchFn,
): LoggerSpinner {
  const autoStart = options.autoStart ?? true;
  const runningIcon: TTYSpinnerIcon = TTY_DEFAULT_RUNNING_ICON;
  // Pre-create the id so it can be referenced before outputLog stores the spinner.
  const id = Symbol();

  let started = false;
  let stopped = false;
  let currentText = text;
  let currentProgressRatio: number | undefined;
  let currentProgressRaw: number | { done: number; total: number } | undefined;

  function register() {
    dispatch(level, [currentText], {
      stackOffset: null,
      ttySpinner: {
        action: 'register',
        id,
        frames: resolveFrames(runningIcon),
        color: runningIcon.color,
        progress: options.progress,
      },
    });
  }

  function stopSpinner(
    iconDef: { icon: string; color?: string },
    message?: string,
    outcome: 'success' | 'fail' | 'stop' = 'stop',
  ) {
    if (stopped) return;
    stopped = true;

    if (options.progress) {
      const ratio = outcome === 'success' ? 1 : (currentProgressRatio ?? 0);
      const rawForLabel: number | { done: number; total: number } =
        outcome === 'success'
          ? currentProgressRaw === undefined
            ? 1
            : typeof currentProgressRaw === 'number'
              ? 1
              : {
                  done: currentProgressRaw.total,
                  total: currentProgressRaw.total,
                }
          : (currentProgressRaw ?? 0);
      const bar = renderProgressBar(ratio, iconDef.color);
      const label =
        ratio > 0
          ? ` ${renderProgressLabel(rawForLabel, iconDef.color)}`
          : '     ';
      dispatch(level, [message ?? currentText], {
        stackOffset: null,
        extraPrefixItems: [{ type: 'text', text: `${bar}${label}` }],
        ttySpinner: { action: 'stop', id },
      });
      return;
    }

    dispatch(level, [message ?? currentText], {
      stackOffset: null,
      extraPrefixItems: [
        { type: 'icon', text: iconDef.icon, color: iconDef.color },
      ],
      ttySpinner: { action: 'stop', id },
    });
  }

  const spinner: LoggerSpinner = {
    start() {
      if (started || stopped) return spinner;
      started = true;
      register();
      return spinner;
    },
    update(newText: string, opts?: SpinnerUpdateOptions) {
      if (stopped) return;
      currentText = newText;
      ttyRenderer?.updateText(id, newText);
      if (opts?.icon !== undefined) ttyRenderer?.updateIcon(id, opts.icon);
      if (opts?.progress !== undefined) {
        const ratio =
          typeof opts.progress === 'number'
            ? opts.progress
            : opts.progress.done / opts.progress.total;
        currentProgressRatio = ratio;
        currentProgressRaw = opts.progress;
        ttyRenderer?.updateProgress(id, ratio, opts.progress);
      }
    },
    success(message?: string, _opts?: SpinnerUpdateOptions) {
      stopSpinner(TTY_DEFAULT_SUCCESS_ICON, message, 'success');
    },
    fail(message?: string, _opts?: SpinnerUpdateOptions) {
      stopSpinner(TTY_DEFAULT_FAIL_ICON, message, 'fail');
    },
    stop() {
      stopSpinner(TTY_DEFAULT_FAIL_ICON, undefined, 'stop');
    },
  };

  if (autoStart) {
    started = true;
    register();
  }

  return spinner;
}
