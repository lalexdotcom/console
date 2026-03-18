import type {
  LoggerSpinner,
  SpinnerOptions,
  SpinnerUpdateOptions,
} from '../../types';
import { SPINNER_INTERVAL_JITTER } from './const';

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpinnerState = 'running' | 'success' | 'fail';

/**
 * Callback provided by each platform (console, browser, tty).
 * Receives the raw state, current text, elapsed ms and an optional stackOffset
 * so the platform can forward the right call-site info to dispatch.
 * Pass null to suppress stack display entirely (used by timer ticks).
 */
export type SpinnerRenderFn = (
  state: SpinnerState,
  text: string,
  elapsedMs: number,
  opts?: SpinnerUpdateOptions,
  stackOffset?: number | null,
) => void;

export type SequentialSpinnerConfig = {
  text: string;
  options: Pick<SpinnerOptions, 'autoStart' | 'progress'>;
  interval: number;
  render: SpinnerRenderFn;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function jitter(base: number): number {
  return base + Math.floor((Math.random() * 2 - 1) * SPINNER_INTERVAL_JITTER);
}

export function formatDuration(ms: number): string {
  return ms < 1_000 ? `${ms}ms` : `${(ms / 1_000).toFixed(3)}s`;
}

// ── createSequentialSpinner ───────────────────────────────────────────────────

/**
 * If `opts` has no explicit progress but `last` had one, infer a "100%" value:
 * - ratio → 1
 * - { done, total } → { done: total, total }
 */
function resolveSuccessProgress(
  opts: SpinnerUpdateOptions | undefined,
  last: SpinnerUpdateOptions | undefined,
): SpinnerUpdateOptions | undefined {
  if (opts?.progress != null) return opts;
  if (last?.progress == null) return opts;
  const full =
    typeof last.progress === 'number'
      ? 1
      : { done: last.progress.total, total: last.progress.total };
  return { ...opts, progress: full };
}

/**
 * Core spinner: owns timing (jittered setTimeout chain), state tracking and
 * lifecycle (start/update/success/fail). Delegates all formatting and dispatch
 * to the `render` callback supplied by the platform layer.
 *
 * `stopped` is set to true by stop/success/fail and acts as a terminal state:
 *  - scheduleTick() becomes a no-op (prevents stale ticks after stop)
 *  - success/fail/update become no-ops (idempotent termination)
 *
 * stackOffset rationale:
 *  - start(): no stackOffset — when autoStart=true (default), start() is called
 *    deep inside the factory chain, so there is no reliable user frame to target.
 *  - timer ticks: null — no user frame exists in the async call stack; null tells
 *    outputLog to skip getLogCallerInfo entirely rather than computing a large offset.
 *  - success/fail: stackOffset=2 — always called directly by user code, two extra
 *    frames above dispatch (render → success/fail → user code).
 */
export function createSequentialSpinner(
  cfg: SequentialSpinnerConfig,
): LoggerSpinner {
  const { text, options, interval, render } = cfg;

  let started = false;
  let stopped = false;
  let startTime = 0;
  let currentText = text;
  let currentOpts: SpinnerUpdateOptions | undefined = options.progress ? { progress: 0 } : undefined;
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  function elapsedMs(): number {
    return Date.now() - startTime;
  }

  function scheduleTick() {
    if (stopped) return;
    timeoutId = setTimeout(() => {
      if (stopped) return;
      render('running', currentText, elapsedMs(), currentOpts, null);
      scheduleTick();
    }, jitter(interval));
  }

  // ── LoggerSpinner ──────────────────────────────────────────────────────────

  const spinner: LoggerSpinner = {
    start() {
      if (started) return spinner;
      started = true;
      startTime = Date.now();
      render('running', currentText, 0, currentOpts, null);
      scheduleTick();
      return spinner;
    },

    update(t: string, opts?: SpinnerUpdateOptions) {
      if (stopped) return;
      currentText = t;
      currentOpts = opts;
    },

    success(t?: string, opts?: SpinnerUpdateOptions) {
      if (stopped) return;
      stopped = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      const resolvedOpts = resolveSuccessProgress(opts, currentOpts);
      render('success', t ?? currentText, elapsedMs(), resolvedOpts, null);
    },

    fail(t?: string, opts?: SpinnerUpdateOptions) {
      if (stopped) return;
      stopped = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
      const resolvedOpts = opts?.progress != null ? opts : { ...opts, progress: currentOpts?.progress };
      render('fail', t ?? currentText, elapsedMs(), resolvedOpts, null);
    },

    stop() {
      stopped = true;
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    },
  };

  if (options.autoStart !== false) spinner.start();

  return spinner;
}
