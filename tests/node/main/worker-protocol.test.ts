import { afterEach, beforeEach, describe, expect, rs, test } from '@rstest/core';

// Patch child_process.fork in Node's require cache before WL is imported.
//
// Why this works:
//   - `createNodeTransport()` calls `await import('node:child_process')` (dynamic)
//   - Node built-ins are singletons: require('node:child_process') and
//     import('node:child_process') return the same object — mutating .fork
//     here intercepts every caller regardless of how they import it
//
// Why rs.hoisted + __non_webpack_require__:
//   - rs.hoisted runs BEFORE static imports are resolved (transform reorders code)
//   - Static imports are hoisted past this point, so any `import` at the top of
//     the file would be undefined when the hoisted callback executes
//   - __non_webpack_require__ is injected by rspack at bundle scope as `require`,
//     so it IS available when the hoisted callback executes
//
// Type declaration for the rspack-injected global:
declare const __non_webpack_require__: NodeRequire;

const fakeFork = rs.hoisted(() => {
  const cp = __non_webpack_require__('node:child_process') as { fork: (...a: unknown[]) => unknown };
  const sentMessages: unknown[] = [];
  const originalFork = cp.fork;

  cp.fork = () => ({
    on: () => {},
    send: (msg: unknown) => {
      sentMessages.push(msg);
      return true;
    },
    kill: () => {},
    connected: true,
    pid: 12345,
  });

  // Restore is called after all tests to leave the module cache clean.
  const restore = () => {
    cp.fork = originalFork;
  };

  return { sentMessages, restore };
});

import { WL } from '../../../src/worker/index';
import type { WorkerMessage } from '../../../src/worker/protocol';

// Flushes the microtask queue so createNodeTransport()'s async Promise chain
// resolves and the internal message queue is drained to the fake fork.
const flush = (): Promise<void> =>
  new Promise<void>((resolve) => setImmediate(resolve));

// Extracts only the 'log' type messages from sentMessages for easier assertions.
function getLogMsgs(): (WorkerMessage & { type: 'log' })[] {
  return (fakeFork.sentMessages as WorkerMessage[]).filter(
    (m): m is WorkerMessage & { type: 'log' } => m.type === 'log',
  );
}

beforeEach(() => {
  fakeFork.sentMessages.length = 0;
});

afterEach(() => {
  // Restore any option state that WORK-06 tests may have set.
  // WL is a singleton — option values persist across tests without explicit reset.
  (WL as unknown as { level: undefined }).level = undefined;
  (WL as unknown as { format: string }).format = 'json';
  (WL as unknown as { exclusive: boolean }).exclusive = false;
  fakeFork.sentMessages.length = 0;
});

// ── WORK-01: log dispatch ─────────────────────────────────────────────────────

describe('log dispatch (WORK-01)', () => {
  test('CANARY: WL.info sends a WorkerMessage log to the fake fork', async () => {
    WL.info('hello canary');
    await flush();

    // If fakeFork.sentMessages is still empty, the require cache patch did NOT
    // intercept the dynamic import. The fake transport was not used.
    expect(
      fakeFork.sentMessages.length,
      'CANARY FAILED — require cache patch did not intercept child_process.fork. ' +
        'See 04-RESEARCH.md §1.4 for fallback strategy.',
    ).toBeGreaterThanOrEqual(1);

    const msg = fakeFork.sentMessages[0] as WorkerMessage;
    expect(msg.type).toBe('log');
    expect((msg as WorkerMessage & { type: 'log' }).level).toBe('info');
  });

  test('all 11 level methods send { type: "log", level: <level> }', async () => {
    const levels = [
      'emerg',
      'alert',
      'crit',
      'error',
      'warn',
      'notice',
      'success',
      'info',
      'verb',
      'debug',
      'wth',
    ] as const;

    for (const level of levels) {
      fakeFork.sentMessages.length = 0;
      (WL as unknown as Record<string, (...args: unknown[]) => void>)[level](
        `test-${level}`,
      );
      await flush();
      const msgs = getLogMsgs();
      expect(msgs.length, `${level}: expected 1 log message`).toBeGreaterThanOrEqual(1);
      expect(msgs[0].level).toBe(level);
      expect(msgs[0].args[0]).toBe(`test-${level}`);
    }
  });

  test('when WL.stack = true, log message includes a caller string', async () => {
    (WL as unknown as { stack: boolean }).stack = true;
    WL.info('caller-test');
    await flush();
    const msg = getLogMsgs().at(-1);
    expect(typeof msg?.caller).toBe('string');
    (WL as unknown as { stack: boolean }).stack = false; // restore
  });
});

// ── WORK-02: all WorkerMessage type variants dispatched ───────────────────────

describe('all WorkerMessage types dispatched (WORK-02)', () => {
  test('opt:set — WL.level setter sends { type: "opt:set", key: "level", value: "debug" }', async () => {
    (WL as unknown as { level: string }).level = 'debug';
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:set' } =>
        m.type === 'opt:set' && m.key === 'level',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe('debug');
  });

  test('opt:format — WL.format setter sends { type: "opt:format", value: "logfmt" }', async () => {
    (WL as unknown as { format: string }).format = 'logfmt';
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:format' } =>
        m.type === 'opt:format',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe('logfmt');
  });

  test('opt:exclusive — WL.exclusive setter sends { type: "opt:exclusive", value: true }', async () => {
    (WL as unknown as { exclusive: boolean }).exclusive = true;
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:exclusive' } =>
        m.type === 'opt:exclusive',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe(true);
  });

  test('spin:start — WL.info.spin() sends { type: "spin:start", id: string, level: "info" }', async () => {
    const handle = WL.info.spin('loading text');
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    expect(msg).toBeDefined();
    expect(msg?.level).toBe('info');
    expect(msg?.message).toBe('loading text');
    expect(msg?.id).toMatch(/^ws-\d+$/);
    handle.stop();
  });

  test('spin:update — handle.update() sends { type: "spin:update", id, text }', async () => {
    const handle = WL.info.spin('initial text');
    await flush();

    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    const spinnerId = startMsg?.id;

    fakeFork.sentMessages.length = 0;
    handle.update('updated text');
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:update' } =>
        m.type === 'spin:update',
    );
    expect(msg).toBeDefined();
    expect(msg?.text).toBe('updated text');
    expect(msg?.id).toBe(spinnerId);
  });

  test('spin:success — spinnerHandle.success() sends { type: "spin:success", id, text }', async () => {
    const handle = WL.info.spin('task');
    await flush();

    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    const spinnerId = startMsg?.id;

    fakeFork.sentMessages.length = 0;
    handle.success('done');
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:success' } =>
        m.type === 'spin:success',
    );
    expect(msg).toBeDefined();
    expect(msg?.text).toBe('done');
    expect(msg?.id).toBe(spinnerId);
    expect(msg?.id).toMatch(/^ws-\d+$/);
  });

  test('spin:fail — spinnerHandle.fail() sends { type: "spin:fail", id, text }', async () => {
    const handle = WL.warn.spin('risky task');
    await flush();

    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    const spinnerId = startMsg?.id;

    fakeFork.sentMessages.length = 0;
    handle.fail('oops');
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:fail' } =>
        m.type === 'spin:fail',
    );
    expect(msg).toBeDefined();
    expect(msg?.text).toBe('oops');
    expect(msg?.id).toBe(spinnerId);
  });

  test('spin:stop — spinnerHandle.stop() sends { type: "spin:stop", id }', async () => {
    const handle = WL.info.spin('cancellable');
    await flush();

    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    const spinnerId = startMsg?.id;

    fakeFork.sentMessages.length = 0;
    handle.stop();
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:stop' } =>
        m.type === 'spin:stop',
    );
    expect(msg).toBeDefined();
    expect(msg?.id).toBe(spinnerId);
    expect(msg?.id).toMatch(/^ws-\d+$/);
  });
});

// ── WORK-03: unserializable args ──────────────────────────────────────────────

describe('unserializable args cloning (WORK-03)', () => {
  test('function argument is serialised to a string via String()', async () => {
    const fn = () => 'hello';
    WL.info('prefix', fn);
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg).toBeDefined();
    // Functions are not structuredClone-able; cloneArg falls back to String(fn)
    expect(typeof msg?.args[1]).toBe('string');
    // The stringified function contains the arrow function body
    expect(String(msg?.args[1])).toContain('hello');
  });

  test('plain object argument is passed through structuredClone unchanged', async () => {
    const obj = { x: 42, nested: { y: 'test' } };
    WL.info('data', obj);
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg).toBeDefined();
    expect(msg?.args[1]).toEqual({ x: 42, nested: { y: 'test' } });
    // Must be a clone — not the same reference
    expect(msg?.args[1]).not.toBe(obj);
  });

  test('multiple args are each independently cloned', async () => {
    WL.info('a', 1, true, null, { z: 3 });
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg?.args).toEqual(['a', 1, true, null, { z: 3 }]);
  });
});

// ── WORK-04: message ordering ─────────────────────────────────────────────────

describe('message ordering (WORK-04)', () => {
  test('messages are delivered in call order', async () => {
    WL.info('first');
    WL.warn('second');
    WL.debug('third');
    await flush();

    const msgs = getLogMsgs();
    expect(msgs.length).toBeGreaterThanOrEqual(3);

    const lastThree = msgs.slice(-3);
    expect(lastThree[0].args[0]).toBe('first');
    expect(lastThree[1].args[0]).toBe('second');
    expect(lastThree[2].args[0]).toBe('third');
  });

  test('each log message has a ts (timestamp) field', async () => {
    WL.info('ts-test');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg).toBeDefined();
    expect(typeof msg?.ts).toBe('number');
    expect(msg?.ts).toBeGreaterThan(0);
  });
});

// ── WORK-05: scope proxy ──────────────────────────────────────────────────────

describe('scope proxy (WORK-05)', () => {
  test('WL.scope() returns a scoped logger that prefixes messages with scope name', async () => {
    const scoped = WL.scope('my-service');
    scoped.info('scoped message');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg).toBeDefined();
    expect(msg?.scope?.name).toBe('my-service');
    expect(msg?.args[0]).toBe('scoped message');
  });

  test('WL.scope() returns the same instance for the same name (cache)', () => {
    const s1 = WL.scope('cached-scope');
    const s2 = WL.scope('cached-scope');
    expect(s1).toBe(s2);
  });

  test('scoped logger sends correct level in the message', async () => {
    const scoped = WL.scope('svc-level-test');
    scoped.error('oh no');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg?.level).toBe('error');
    expect(msg?.scope?.name).toBe('svc-level-test');
  });
});

// ── WORK-06: option sync ──────────────────────────────────────────────────────

describe('option sync to worker (WORK-06)', () => {
  test('WL.level = "debug" sends { type: "opt:set", key: "level", value: "debug" }', async () => {
    (WL as unknown as { level: string }).level = 'debug';
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:set' } =>
        m.type === 'opt:set' && m.key === 'level',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe('debug');
  });

  test('WL.format = "logfmt" sends { type: "opt:format", value: "logfmt" }', async () => {
    (WL as unknown as { format: string }).format = 'logfmt';
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:format' } =>
        m.type === 'opt:format',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe('logfmt');
  });

  test('WL.exclusive = true sends { type: "opt:exclusive", value: true }', async () => {
    (WL as unknown as { exclusive: boolean }).exclusive = true;
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:exclusive' } =>
        m.type === 'opt:exclusive',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe(true);
  });

  test('WL.stack = true sends { type: "opt:set", key: "stack", value: true }', async () => {
    (WL as unknown as { stack: boolean }).stack = true;
    await flush();

    const msg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'opt:set' } =>
        m.type === 'opt:set' && m.key === 'stack',
    );
    expect(msg).toBeDefined();
    expect(msg?.value).toBe(true);
    // Restore — afterEach does not cover stack
    (WL as unknown as { stack: boolean }).stack = false;
  });
});

// ── WORK-07: rate-limiting key/max fields ─────────────────────────────────────

describe('rate-limiting key/max in WorkerMessage (WORK-07)', () => {
  test('WL.once().info() sends { key: string } with no max field', async () => {
    WL.once().info('once-message');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg).toBeDefined();
    expect(typeof msg?.key).toBe('string');
    expect(msg?.key?.length).toBeGreaterThan(0);
    // once() means max defaults to 1 — the `max` field should be absent
    expect(msg?.max).toBeUndefined();
  });

  test('WL.limit(3).info() sends { key: string, max: 3 }', async () => {
    WL.limit(3).info('limited-message');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg).toBeDefined();
    expect(typeof msg?.key).toBe('string');
    expect(msg?.max).toBe(3);
  });

  test('WL.once(explicit-key).info() forwards the explicit key', async () => {
    WL.once('my-explicit-key').info('keyed-message');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg?.key).toBe('my-explicit-key');
    expect(msg?.max).toBeUndefined();
  });

  test('WL.limit(5, explicit-key).info() forwards the explicit key with max', async () => {
    WL.limit(5, 'my-limit-key').info('keyed-limited-message');
    await flush();

    const msg = getLogMsgs().at(-1);
    expect(msg?.key).toBe('my-limit-key');
    expect(msg?.max).toBe(5);
  });
});

// ── WORK-08: spinner lifecycle messages ───────────────────────────────────────

describe('spinner lifecycle WorkerMessages (WORK-08)', () => {
  test('full success lifecycle: spin:start → spin:update → spin:success', async () => {
    const handle = WL.info.spin('loading...');
    await flush();

    // Capture the ID from spin:start to verify consistency across messages.
    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    expect(startMsg).toBeDefined();
    expect(startMsg?.id).toMatch(/^ws-\d+$/);
    const spinnerId = startMsg?.id as string;

    fakeFork.sentMessages.length = 0;
    handle.update('still loading...');
    await flush();

    const updateMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:update' } =>
        m.type === 'spin:update',
    );
    expect(updateMsg?.id).toBe(spinnerId);
    expect(updateMsg?.text).toBe('still loading...');

    fakeFork.sentMessages.length = 0;
    handle.success('done!');
    await flush();

    const successMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:success' } =>
        m.type === 'spin:success',
    );
    expect(successMsg?.id).toBe(spinnerId);
    expect(successMsg?.text).toBe('done!');
  });

  test('fail lifecycle: spin:start → spin:fail with matching ID', async () => {
    const handle = WL.error.spin('dangerous operation');
    await flush();

    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    expect(startMsg?.level).toBe('error');
    const spinnerId = startMsg?.id as string;

    fakeFork.sentMessages.length = 0;
    handle.fail('operation failed');
    await flush();

    const failMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:fail' } =>
        m.type === 'spin:fail',
    );
    expect(failMsg?.id).toBe(spinnerId);
    expect(failMsg?.text).toBe('operation failed');
  });

  test('stop lifecycle: spin:start → spin:stop with matching ID', async () => {
    const handle = WL.info.spin('cancellable');
    await flush();

    const startMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    const spinnerId = startMsg?.id as string;

    fakeFork.sentMessages.length = 0;
    handle.stop();
    await flush();

    const stopMsg = (fakeFork.sentMessages as WorkerMessage[]).find(
      (m): m is WorkerMessage & { type: 'spin:stop' } =>
        m.type === 'spin:stop',
    );
    expect(stopMsg?.id).toBe(spinnerId);
  });

  test('two concurrent spinners get distinct IDs', async () => {
    const h1 = WL.info.spin('first spinner');
    const h2 = WL.info.spin('second spinner');
    await flush();

    const starts = (fakeFork.sentMessages as WorkerMessage[]).filter(
      (m): m is WorkerMessage & { type: 'spin:start' } =>
        m.type === 'spin:start',
    );
    expect(starts.length).toBeGreaterThanOrEqual(2);
    const ids = starts.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length); // all distinct

    // Clean up handles to avoid leaking state
    h1.stop();
    h2.stop();
  });
});
