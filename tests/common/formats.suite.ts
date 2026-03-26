import { beforeEach, describe, expect, test } from '@rstest/core';
import { L } from '../../src';
import type { TestAdapter } from './adapter';
import { parseLogfmt } from './logfmt.helper';

/**
 * Parameterised suite covering JSON, logfmt, and pretty format output (CORE-04/05/06).
 * Each test explicitly sets L.format — the suite is self-contained with respect to format.
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  describe(`formats (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
    });

    // CORE-04: JSON format output
    describe('JSON format (CORE-04)', () => {
      test('info call produces parseable JSON with all required fields', async () => {
        L.format = 'json';
        const lines = await adapter.capture(() => L.info('hello'));
        expect(lines).toHaveLength(1);
        const line = lines[0].trimEnd();
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

      test('emerg produces level="error" and severity="emerg"', async () => {
        // emerg → console.error → LEVEL_METHODS[emerg].name = 'error'
        L.format = 'json';
        const lines = await adapter.capture(() => L.emerg('critical'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.level).toBe('error');    // console.error.name
        expect(parsed.severity).toBe('emerg'); // actual log level
        expect(parsed.msg).toBe('critical');
      });

      test('warn produces level="warn" severity="warn"', async () => {
        L.format = 'json';
        const lines = await adapter.capture(() => L.warn('warning msg'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.level).toBe('warn');
        expect(parsed.severity).toBe('warn');
      });

      test('debug produces level="debug" severity="debug"', async () => {
        // debug → console.debug → name = 'debug'
        L.format = 'json';
        const lines = await adapter.capture(() => L.debug('verbose'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.level).toBe('debug');
        expect(parsed.severity).toBe('debug');
      });

      test('scope name appears in JSON output as "scope" field', async () => {
        L.format = 'json';
        const s = L.scope('json-scope-test');
        const lines = await adapter.capture(() => s.info('scoped msg'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.scope).toBe('json-scope-test');
        expect(parsed.severity).toBe('info');
        expect(parsed.msg).toBe('scoped msg');
      });

      test('JSON fields appear in canonical order: time level severity msg', async () => {
        L.format = 'json';
        const lines = await adapter.capture(() => L.info('order'));
        const line = lines[0].trimEnd();
        // Verify field order by checking index positions in the raw JSON string
        expect(line.indexOf('"time"')).toBeLessThan(line.indexOf('"level"'));
        expect(line.indexOf('"level"')).toBeLessThan(line.indexOf('"severity"'));
        expect(line.indexOf('"severity"')).toBeLessThan(line.indexOf('"msg"'));
      });
    });

    // CORE-05: logfmt format output
    describe('logfmt format (CORE-05)', () => {
      test('info call produces key=value pairs with correct fields', async () => {
        L.format = 'logfmt';
        const lines = await adapter.capture(() => L.info('hello world'));
        expect(lines).toHaveLength(1);
        const line = lines[0].trimEnd();
        const parsed = parseLogfmt(line);
        expect(parsed.level).toBe('info');
        expect(parsed.severity).toBe('info');
        expect(parsed.msg).toBe('hello world'); // parseLogfmt unquotes via JSON.parse
        expect(new Date(parsed.time).toISOString()).toBe(parsed.time);
        // Normalise the dynamic timestamp to a stable placeholder before snapshotting.
        const stableLine = line.replace(/time="[^"]*"/, 'time="<ts>"');
        expect(stableLine).toMatchInlineSnapshot(`"time="<ts>" level=info severity=info msg="hello world""`);
      });

      test('fields appear in the correct order: time level severity msg', async () => {
        L.format = 'logfmt';
        const lines = await adapter.capture(() => L.info('order-test'));
        const line = lines[0].trimEnd();
        expect(line.indexOf('time=')).toBeLessThan(line.indexOf('level='));
        expect(line.indexOf('level=')).toBeLessThan(line.indexOf('severity='));
        expect(line.indexOf('severity=')).toBeLessThan(line.indexOf('msg='));
      });

      test('emerg produces level=error severity=emerg', async () => {
        L.format = 'logfmt';
        const lines = await adapter.capture(() => L.emerg('crit msg'));
        expect(lines).toHaveLength(1);
        const parsed = parseLogfmt(lines[0].trimEnd());
        expect(parsed.level).toBe('error');
        expect(parsed.severity).toBe('emerg');
      });
    });

    // CORE-06: pretty format output — set pad=false for deterministic label width
    describe('pretty format (CORE-06)', () => {
      test('info call produces [INFO] badge without ANSI codes', async () => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.info('msg'));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('[INFO]');
        // renderConsolePrefix never emits ANSI escape sequences
        expect(lines[0]).not.toMatch(/\x1b\[/);
        expect(lines[0].trimEnd()).toMatchInlineSnapshot(`"[INFO] msg"`);
      });

      test('error level routes to stderr and contains [ERROR] badge', async () => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.error('err'));
        // At least one line for the main log; additional entries may be the stack trace
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain('[ERROR]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      });

      test('debug produces [DEBUG] badge', async () => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.debug('dbg'));
        expect(lines[0]).toContain('[DEBUG]');
      });

      test('wth produces [WHO CARES?] badge', async () => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.wth('shrug'));
        expect(lines[0]).toContain('[WHO CARES?]');
      });

      test('warn produces [WARNING] badge', async () => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.warn('caution'));
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain('[WARNING]');
      });
    });
  });
}
