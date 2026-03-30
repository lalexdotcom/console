import {
  afterEach,
  beforeEach,
  describe,
  expect,
  rs,
  test,
} from '@rstest/core';
import { L } from '../../src';
import { BROWSER_SPINNER_INTERVAL } from '../../src/logger/mixins/spinner/browser/const';
import { SPINNER_INTERVAL_JITTER } from '../../src/logger/mixins/spinner/const';

// reset.ts is registered globally — no import needed.
// No process.stdout in browser — use rs.spyOn for all capture (D-07 strict).

// Minimum time to guarantee at least one browser spinner tick fires.
const BROWSER_TICK_ADVANCE =
  BROWSER_SPINNER_INTERVAL + SPINNER_INTERVAL_JITTER + 10;

// ── CORE-07: %c CSS format strings ────────────────────────────────────────────

describe('browser %c CSS format strings (CORE-07)', () => {
  let logSpy: ReturnType<typeof rs.spyOn>;
  let debugSpy: ReturnType<typeof rs.spyOn>;

  beforeEach(() => {
    logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    debugSpy = rs.spyOn(console, 'debug').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    debugSpy.mockRestore();
  });

  test('info level: first arg of console.log contains %c (CSS format string)', () => {
    L.info('test');
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });

  test('debug level: output contains %c CSS format string', () => {
    // LEVEL_METHODS.debug is captured at module load time. When rs.spyOn replaces
    // console.debug, the identity check (method !== activeConsole.debug) becomes
    // true and emitConsole routes to console.log instead. Either path still
    // emits a %c format string — verify via logSpy.
    L.debug('test');
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });

  test('notice level: first arg of console.log contains %c', () => {
    L.notice('test');
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });

  test.each([
    'success',
    'notice',
    'info',
  ] as const)('%s level: console.log first arg contains %c CSS format string', (level) => {
    logSpy.mockClear();
    (L as unknown as Record<string, (msg: string) => void>)[level]('test');
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });
});

// ── CORE-08: groupCollapsed/groupEnd for TRACE_LEVELS ────────────────────────

describe('TRACE_LEVELS use groupCollapsed/groupEnd (CORE-08)', () => {
  let groupCollapsedSpy: ReturnType<typeof rs.spyOn>;
  let groupEndSpy: ReturnType<typeof rs.spyOn>;
  let errorSpy: ReturnType<typeof rs.spyOn>;

  beforeEach(() => {
    groupCollapsedSpy = rs
      .spyOn(console, 'groupCollapsed')
      .mockImplementation(() => {});
    groupEndSpy = rs.spyOn(console, 'groupEnd').mockImplementation(() => {});
    errorSpy = rs.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    groupCollapsedSpy.mockRestore();
    groupEndSpy.mockRestore();
    errorSpy.mockRestore();
  });

  test('error level uses groupCollapsed and groupEnd (not direct console.error)', () => {
    L.error('oops');
    expect(groupCollapsedSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(groupEndSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    // TRACE_LEVELS path does NOT call console.error directly
    expect(errorSpy.mock.calls.length).toBe(0);
  });

  test('groupCollapsed first arg also contains %c CSS format string', () => {
    L.error('oops');
    expect((groupCollapsedSpy.mock.calls[0][0] as string).includes('%c')).toBe(
      true,
    );
  });

  test('warn level uses groupCollapsed and groupEnd', () => {
    L.warn('warning');
    expect(groupCollapsedSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(groupEndSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test.each([
    'emerg',
    'alert',
    'crit',
    'error',
    'warn',
  ] as const)('%s level (TRACE_LEVELS) emits groupCollapsed + groupEnd sequence', (level) => {
    groupCollapsedSpy.mockClear();
    groupEndSpy.mockClear();
    (L as unknown as Record<string, (msg: string) => void>)[level]('test');
    expect(groupCollapsedSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(groupEndSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
  });

  test('non-TRACE level (info) does NOT use groupCollapsed', () => {
    const lSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
    L.info('msg');
    expect(groupCollapsedSpy.mock.calls.length).toBe(0);
    lSpy.mockRestore();
  });
});

// ── SPIN-09: Browser spinner CSS-styled output ────────────────────────────────

describe('browser spinner CSS-styled output (SPIN-09)', () => {
  let logSpy: ReturnType<typeof rs.spyOn>;

  beforeEach(() => {
    logSpy = rs.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  test('browser spinner start emits an immediate %c-prefixed console.log call', () => {
    L.scope('spin-09-start').info.spin('loading');
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });

  test('browser spinner tick emits %c-prefixed console.log call after timer advance', () => {
    rs.useFakeTimers();
    L.scope('spin-09-tick').info.spin('tick test');
    logSpy.mockClear(); // discard start call
    rs.advanceTimersByTime(BROWSER_TICK_ADVANCE);
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });

  test('browser spinner success call emits %c-prefixed console.log call', () => {
    L.scope('spin-09-success').info.spin('task');
    logSpy.mockClear(); // discard start call
    // success() renders synchronously — no timer advance needed
    // (stop sets stopped=true; success renders inline)
    const sp = L.scope('spin-09-success-b').info.spin('task');
    logSpy.mockClear();
    sp.success('done');
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });

  test('browser spinner with progress: true emits %c CSS output on tick', () => {
    rs.useFakeTimers();
    const sp = L.scope('spin-09-prog').info.spin('load', { progress: true });
    sp.update('loading', { progress: 0.5 });
    logSpy.mockClear();
    rs.advanceTimersByTime(BROWSER_TICK_ADVANCE);
    expect(logSpy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect((logSpy.mock.calls[0][0] as string).includes('%c')).toBe(true);
  });
});
