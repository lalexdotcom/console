import { stripVTControlCharacters } from 'node:util';
import { colorize } from '../../../../utils/color';
import { TTY_SPINNER_INTERVAL } from './const';

// ── Types ─────────────────────────────────────────────────────────────────────

export type TTYSpinnerState = {
  id: symbol;
  text: string;
  /** Optional prefix (log-level badge) prepended on every rendered line. */
  prefix?: string;
  /** Pre-resolved animation frames (never empty). */
  frames: string[];
  iconIndex: number;
  color: string | undefined;
  /** When set, replaces the animated frame with a fixed icon. Null resets to animation. */
  overrideIcon?: string;
  /** When defined, renders an 8-char progress bar instead of the animated frames. Ratio [0, 1]. */
  progress?: number;
  /** Raw value passed to update() — used to render the label. */
  progressRaw?: number | { done: number; total: number };
};

export type TTYRenderer = {
  readonly isActive: () => boolean;
  readonly addSpinner: (state: TTYSpinnerState) => void;
  readonly updateText: (id: symbol, text: string) => void;
  readonly updateIcon: (id: symbol, icon: string | null) => void;
  readonly updateProgress: (
    id: symbol,
    ratio: number,
    raw: number | { done: number; total: number },
  ) => void;
  readonly removeSpinner: (id: symbol) => void;
  readonly enqueueLog: (line: string) => void;
  readonly tick: () => void;
  readonly cleanup: () => void;
};

// ── helpers ───────────────────────────────────────────────────────────────────

/** Renders an 8-character wide progress bar for a [0, 1] ratio, with colors. */
export function renderProgressBar(progress: number, color: string | undefined): string {
  const WIDTH = 8;
  const filled = Math.round(Math.min(1, Math.max(0, progress)) * WIDTH);
  const filledBar = '━'.repeat(filled);
  const emptyBar = '━'.repeat(WIDTH - filled);
  const filledColored = filled > 0 && color ? (colorize(filledBar, { color }) ?? filledBar) : filledBar;
  const emptyColored = colorize(emptyBar, { color: 'gray' }) ?? emptyBar;
  return filledColored + emptyColored;
}

/** Renders the progress label next to the bar. */
export function renderProgressLabel(
  raw: number | { done: number; total: number },
  color: string | undefined,
): string {
  let text: string;
  if (typeof raw === 'number') {
    text = `(${Math.round(raw * 100).toString().padStart(3)}%)`;
  } else {
    const totalStr = String(raw.total);
    const doneStr = String(raw.done).padStart(totalStr.length);
    text = `(${doneStr}/${totalStr})`;
  }
  return color ? (colorize(text, { color }) ?? text) : text;
}

/** Returns the number of terminal lines a rendered string occupies. */
function getLineCount(text: string): number {
  const cols = process.stdout.columns || 80;
  const plain = stripVTControlCharacters(text);
  let count = 0;
  for (const line of plain.split('\n')) {
    count += Math.max(1, Math.ceil(line.length / cols));
  }
  return count;
}

// ── createTTYRenderer ─────────────────────────────────────────────────────────

function createTTYRenderer(): TTYRenderer {
  const spinners = new Map<symbol, TTYSpinnerState>();
  const pendingQueue: string[] = [];
  let lastSpinnerLineCount = 0;
  let intervalId: NodeJS.Timeout | undefined;
  let cursorHidden = false;
  let resizeListener: (() => void) | undefined;

  function eraseSpinners() {
    if (lastSpinnerLineCount > 0) {
      // Move up N lines then erase from cursor to end of screen.
      process.stdout.write(`\x1b[${lastSpinnerLineCount}A\x1b[0J`);
      lastSpinnerLineCount = 0;
    }
  }

  function flushPending() {
    for (const line of pendingQueue) {
      process.stdout.write(`${line}\n`);
    }
    pendingQueue.length = 0;
  }

  function drawSpinners() {
    let totalLines = 0;
    for (const state of spinners.values()) {
      let frameAndText: string;
      if (state.progress !== undefined) {
        const bar = renderProgressBar(state.progress, state.color);
        const label = state.progress > 0 ? ` ${renderProgressLabel(state.progressRaw ?? state.progress, state.color)}` : '     ';
        frameAndText = `${bar}${label} ${state.text}`;
      } else {
        let rawFrame: string;
        if (state.overrideIcon !== undefined) {
          rawFrame = state.overrideIcon;
        } else {
          state.iconIndex = (state.iconIndex + 1) % state.frames.length;
          rawFrame = state.frames[state.iconIndex] ?? state.frames[0];
        }
        const frame = state.color
          ? (colorize(rawFrame, { color: state.color }) ?? rawFrame)
          : rawFrame;
        frameAndText = rawFrame ? `${frame} ${state.text}` : state.text;
      }
      const line = [state.prefix, frameAndText].filter(Boolean).join(' ');
      process.stdout.write(`${line}\n`);
      totalLines += getLineCount(line);
    }
    lastSpinnerLineCount = totalLines;
  }

  function stopInterval() {
    if (intervalId !== undefined) {
      clearInterval(intervalId);
      intervalId = undefined;
    }
    if (resizeListener) {
      process.stdout.off('resize', resizeListener);
      resizeListener = undefined;
    }
  }

  function showCursor() {
    if (cursorHidden) {
      process.stdout.write('\x1b[?25h');
      cursorHidden = false;
    }
  }

  function tick() {
    eraseSpinners();
    flushPending();
    drawSpinners();
  }

  function cleanup() {
    stopInterval();
    eraseSpinners();
    flushPending();
    showCursor();
    spinners.clear();
  }

  return {
    isActive: () => spinners.size > 0,

    addSpinner(state) {
      spinners.set(state.id, { ...state });
      if (!cursorHidden) {
        process.stdout.write('\x1b[?25l');
        cursorHidden = true;
      }
      if (!intervalId) {
        intervalId = setInterval(tick, TTY_SPINNER_INTERVAL);
        // Allow the process to exit naturally even if the interval is still live.
        intervalId.unref();
        // On terminal resize, recalculate the spinner line count with the new
        // column width (the terminal has already reflowed the existing output)
        // then immediately redraw so the next erase targets the right line count.
        resizeListener = () => {
          lastSpinnerLineCount = [...spinners.values()].reduce((sum, s) => {
            let frameAndText: string;
            if (s.progress !== undefined) {
              const bar = renderProgressBar(s.progress, s.color);
              const label = s.progress > 0 ? ` ${renderProgressLabel(s.progressRaw ?? s.progress, s.color)}` : '     ';
              frameAndText = `${bar}${label} ${s.text}`;
            } else {
              const rawFrame =
                s.overrideIcon !== undefined
                  ? s.overrideIcon
                  : (s.frames[s.iconIndex] ?? s.frames[0]);
              const frame = s.color
                ? (colorize(rawFrame, { color: s.color }) ?? rawFrame)
                : rawFrame;
              frameAndText = rawFrame ? `${frame} ${s.text}` : s.text;
            }
            const line = [s.prefix, frameAndText].filter(Boolean).join(' ');
            return sum + getLineCount(line);
          }, 0);
          tick();
        };
        process.stdout.on('resize', resizeListener);
      }
    },

    updateText(id, text) {
      const s = spinners.get(id);
      if (s) s.text = text;
    },

    updateIcon(id, icon) {
      const s = spinners.get(id);
      if (s) s.overrideIcon = icon === null ? undefined : icon;
    },

    updateProgress(id, ratio, raw) {
      const s = spinners.get(id);
      if (s) {
        s.progress = ratio;
        s.progressRaw = raw;
      }
    },

    removeSpinner(id) {
      spinners.delete(id);
      if (spinners.size === 0) {
        stopInterval();
        eraseSpinners();
        flushPending();
        showCursor();
      }
    },

    enqueueLog(line) {
      pendingQueue.push(line);
    },

    tick,
    cleanup,
  };
}

// ── Singleton ─────────────────────────────────────────────────────────────────
// Stored on globalThis so the same instance is shared even when this module is
// loaded more than once (duplicate packages, CJS+ESM dual-load, etc.).

const RENDERER_KEY = '$tty-renderer';
const anyGlobal = globalThis as Record<string, unknown>;

export const ttyRenderer: TTYRenderer | undefined = (() => {
  if (typeof process === 'undefined' || !process.stdout) return undefined;
  if (!anyGlobal[RENDERER_KEY]) {
    const renderer = createTTYRenderer();
    process.on('exit', () => renderer.cleanup());
    process.on('SIGINT', () => {
      renderer.cleanup();
      process.exit(130);
    });
    anyGlobal[RENDERER_KEY] = renderer;
  }
  return anyGlobal[RENDERER_KEY] as TTYRenderer;
})();
