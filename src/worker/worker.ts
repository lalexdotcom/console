/**
 * Worker script — runs inside a child_process.fork() (Node) or Web Worker (browser).
 *
 * Receives WorkerMessage objects via IPC / MessageChannel, routes them to a
 * real RootLogger instance, and produces all output from within this context.
 * The main thread never writes to stdout directly when this script is active.
 */
import { Logger } from '../logger';
import type { LoggerSpinner } from '../types';
import type { WorkerMessage } from './protocol';

// ── Transport detection ───────────────────────────────────────────────────────

const isNodeProcess =
  typeof process !== 'undefined' && process?.versions?.node != null;

// ── Spinner registry ──────────────────────────────────────────────────────────

/** Tracks active spinner handles by their string ID. */
const spinners = new Map<string, LoggerSpinner>();

// ── Message handler ───────────────────────────────────────────────────────────

/**
 * Dispatches a single WorkerMessage to the logger.
 * All branching is exhaustive over the `type` discriminant.
 */
function handle(msg: WorkerMessage): void {
  switch (msg.type) {
    case 'log': {
      const target = msg.scope
        ? Logger.scope(msg.scope.name, msg.scope.options)
        : Logger;
      if (msg.key !== undefined) {
        // Rate-limited call: delegate to Logger.once / Logger.limit so the
        // counter map lives in the worker — the single source of truth.
        const limited =
          (msg.max ?? 1) > 1
            ? target.limit(msg.max as number, msg.key)
            : target.once(msg.key);
        limited[msg.level](...(msg.args as Parameters<typeof console.log>));
      } else {
        // Use __logFromMainProcess so the call-site string captured in the main
        // process is forwarded to prepareLog, bypassing worker-side introspection.
        target.__logFromMainProcess(
          msg.level,
          msg.caller,
          msg.args,
          msg.ts,
          msg.traceCaller,
          msg.callerStructuredOnly,
        );
      }
      break;
    }

    case 'spin:start': {
      const target = msg.scope
        ? Logger.scope(msg.scope.name, msg.scope.options)
        : Logger;
      const spinner = target[msg.level].spin(msg.message, msg.options ?? {});
      spinner.start();
      spinners.set(msg.id, spinner);
      break;
    }

    case 'spin:update': {
      const spinner = spinners.get(msg.id);
      if (spinner) spinner.update(msg.text, msg.options);
      break;
    }

    case 'spin:success': {
      const spinner = spinners.get(msg.id);
      if (spinner) {
        spinner.success(msg.text, msg.options);
        spinners.delete(msg.id);
      }
      break;
    }

    case 'spin:fail': {
      const spinner = spinners.get(msg.id);
      if (spinner) {
        spinner.fail(msg.text, msg.options);
        spinners.delete(msg.id);
      }
      break;
    }

    case 'spin:stop': {
      const spinner = spinners.get(msg.id);
      if (spinner) {
        spinner.stop();
        spinners.delete(msg.id);
      }
      break;
    }

    case 'opt:set': {
      // biome-ignore lint/suspicious/noExplicitAny: dynamic key assignment on typed logger options
      (Logger as any)[msg.key] = msg.value;
      break;
    }

    case 'opt:format': {
      Logger.format = msg.value;
      break;
    }

    case 'opt:exclusive': {
      Logger.exclusive = msg.value;
      break;
    }

    default: {
      // Exhaustiveness guard — msg is `never` here if all cases are covered.
      const _exhaustive: never = msg;
      console.error('[worker-script] Unknown message type:', _exhaustive);
    }
  }
}

// ── Bootstrap: attach the correct transport listener ─────────────────────────

if (isNodeProcess) {
  // Node child_process.fork() — messages arrive on process via IPC.
  process.on('message', (raw: unknown) => {
    try {
      handle(raw as WorkerMessage);
    } catch (e) {
      console.error('[worker-script] Error handling message:', e);
    }
  });
} else {
  // Browser Web Worker / SharedWorker.
  self.addEventListener('message', (event: MessageEvent) => {
    try {
      handle(event.data as WorkerMessage);
    } catch (e) {
      console.error('[worker-script] Error handling message:', e);
    }
  });
}
