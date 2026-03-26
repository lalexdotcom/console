import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../common/capture.helper';
import { parseLogfmt } from '../../common/logfmt.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles.

describe('JSON format (CORE-04)', () => {
  // Use non-TRACE levels (info, debug) to avoid extra stdout lines from the
  // TRACE_LEVELS stack-trace path in pretty mode (not relevant here, but good hygiene).
  test('info call produces parseable JSON with all required fields', () => {
    L.format = 'json';
    const { stdout, stderr } = captureAll(() => L.info('hello'));
    expect(stderr).toHaveLength(0);
    expect(stdout).toHaveLength(1);
    const line = stdout[0].trimEnd();
    const parsed = JSON.parse(line) as Record<string, unknown>;
    // level = console method name; info → console.info → name = 'info'
    expect(parsed.level).toBe('info');
    expect(parsed.severity).toBe('info');
    expect(parsed.msg).toBe('hello');
    // time must be a valid ISO 8601 string
    expect(typeof parsed.time).toBe('string');
    expect(new Date(parsed.time as string).toISOString()).toBe(parsed.time);
    // Replace dynamic timestamp with stable placeholder so the snapshot validates
    // field names and ordering without coupling to wall-clock time.
    const stableJson = line.replace(/"time":"[^"]*"/, '"time":"<ts>"');
    expect(stableJson).toMatchInlineSnapshot(`"{"time":"<ts>","level":"info","severity":"info","msg":"hello"}"`);
  });

  test('emerg produces level="error" and severity="emerg" on stderr', () => {
    // emerg → console.error → LEVEL_METHODS[emerg].name = 'error'
    L.format = 'json';
    const { stdout, stderr } = captureAll(() => L.emerg('critical'));
    expect(stderr).toHaveLength(1);
    expect(stdout).toHaveLength(0);
    const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.level).toBe('error');    // console.error.name
    expect(parsed.severity).toBe('emerg'); // actual log level
    expect(parsed.msg).toBe('critical');
  });

  test('warn produces level="warn" severity="warn" on stderr', () => {
    L.format = 'json';
    const { stderr } = captureAll(() => L.warn('warning msg'));
    expect(stderr).toHaveLength(1);
    const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.level).toBe('warn');
    expect(parsed.severity).toBe('warn');
  });

  test('debug produces level="debug" severity="debug" on stdout', () => {
    // debug → console.debug → name = 'debug'
    L.format = 'json';
    const { stdout } = captureAll(() => L.debug('verbose'));
    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.level).toBe('debug');
    expect(parsed.severity).toBe('debug');
  });

  test('scope name appears in JSON output as "scope" field', () => {
    L.format = 'json';
    const s = L.scope('json-scope-test');
    const { stdout } = captureAll(() => s.info('scoped msg'));
    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.scope).toBe('json-scope-test');
    expect(parsed.severity).toBe('info');
    expect(parsed.msg).toBe('scoped msg');
  });

  test('JSON fields appear in canonical order: time level severity msg', () => {
    L.format = 'json';
    const { stdout } = captureAll(() => L.info('order'));
    const line = stdout[0].trimEnd();
    // Verify field order by checking index positions in the raw JSON string
    expect(line.indexOf('"time"')).toBeLessThan(line.indexOf('"level"'));
    expect(line.indexOf('"level"')).toBeLessThan(line.indexOf('"severity"'));
    expect(line.indexOf('"severity"')).toBeLessThan(line.indexOf('"msg"'));
  });
});

describe('logfmt format (CORE-05)', () => {
  test('info call produces key=value pairs with correct fields', () => {
    L.format = 'logfmt';
    const { stdout, stderr } = captureAll(() => L.info('hello world'));
    expect(stderr).toHaveLength(0);
    expect(stdout).toHaveLength(1);
    const line = stdout[0].trimEnd();
    const parsed = parseLogfmt(line);
    expect(parsed.level).toBe('info');
    expect(parsed.severity).toBe('info');
    expect(parsed.msg).toBe('hello world'); // parseLogfmt unquotes via JSON.parse
    expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
    // Normalise the dynamic timestamp to a stable placeholder before snapshotting.
    const stableLine = line.replace(/time="[^"]*"/, 'time="<ts>"');
    expect(stableLine).toMatchInlineSnapshot(`"time="<ts>" level=info severity=info msg="hello world""`);
  });

  test('fields appear in the correct order: time level severity msg', () => {
    L.format = 'logfmt';
    const { stdout } = captureAll(() => L.info('order-test'));
    const line = stdout[0].trimEnd();
    expect(line.indexOf('time=')).toBeLessThan(line.indexOf('level='));
    expect(line.indexOf('level=')).toBeLessThan(line.indexOf('severity='));
    expect(line.indexOf('severity=')).toBeLessThan(line.indexOf('msg='));
  });

  test('emerg produces level=error severity=emerg on stderr', () => {
    L.format = 'logfmt';
    const { stderr } = captureAll(() => L.emerg('crit msg'));
    expect(stderr).toHaveLength(1);
    const parsed = parseLogfmt(stderr[0].trimEnd());
    expect(parsed.level).toBe('error');
    expect(parsed.severity).toBe('emerg');
  });
});

describe('pretty format (CORE-06)', () => {
  // Set pad=false for deterministic label width (avoid centering whitespace in snapshots).
  // renderConsolePrefix always produces plain text — no ANSI codes regardless of color setting.

  test('info call produces [INFO] badge without ANSI codes', () => {
    L.format = 'pretty';
    L.pad = false;
    const { stdout, stderr } = captureAll(() => L.info('msg'));
    expect(stderr).toHaveLength(0);
    expect(stdout).toHaveLength(1);
    expect(stdout[0]).toContain('[INFO]');
    // renderConsolePrefix never emits ANSI escape sequences
    expect(stdout[0]).not.toMatch(/\x1b\[/);
    expect(stdout[0].trimEnd()).toMatchInlineSnapshot(`"[INFO] msg"`);
  });

  test('error level routes to stderr and contains [ERROR] badge', () => {
    L.format = 'pretty';
    L.pad = false;
    const { stderr } = captureAll(() => L.error('err'));
    // stderr[0] is the main log line; additional entries may be the stack trace
    expect(stderr.length).toBeGreaterThanOrEqual(1);
    expect(stderr[0]).toContain('[ERROR]');
    expect(stderr[0]).not.toMatch(/\x1b\[/);
  });

  test('debug produces [DEBUG] badge on stdout', () => {
    L.format = 'pretty';
    L.pad = false;
    const { stdout } = captureAll(() => L.debug('dbg'));
    expect(stdout[0]).toContain('[DEBUG]');
  });

  test('wth produces [WHO CARES?] badge', () => {
    L.format = 'pretty';
    L.pad = false;
    const { stdout } = captureAll(() => L.wth('shrug'));
    expect(stdout[0]).toContain('[WHO CARES?]');
  });

  test('warn produces [WARNING] badge on stderr', () => {
    L.format = 'pretty';
    L.pad = false;
    const { stderr } = captureAll(() => L.warn('caution'));
    expect(stderr.length).toBeGreaterThanOrEqual(1);
    expect(stderr[0]).toContain('[WARNING]');
  });
});
