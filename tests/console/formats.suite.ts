import { expect } from '@rstest/core';
import { L } from '../../src';
import { parseLogfmt } from '../common/logfmt.helper';
import type { Suite } from '../common/suites/suite';

/**
 * Declarative suite covering JSON, logfmt, and pretty format output (CORE-04/05/06).
 * Each test explicitly sets L.format — no suite-level setup needed.
 */
export const formatsSuite: Suite = {
  name: 'formats',
  description: 'JSON, logfmt, and pretty format output (CORE-04/05/06)',
  tests: [
    // CORE-04: JSON format output
    {
      name: 'info call produces parseable JSON with all required fields',
      run: async (adapter) => {
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
        expect(stableJson).toMatchInlineSnapshot(
          `"{"time":"<ts>","level":"info","severity":"info","msg":"hello"}"`,
        );
      },
    },
    {
      name: 'emerg produces level="error" and severity="emerg"',
      run: async (adapter) => {
        // emerg → console.error → LEVEL_METHODS[emerg].name = 'error'
        L.format = 'json';
        const lines = await adapter.capture(() => L.emerg('critical'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<
          string,
          unknown
        >;
        expect(parsed.level).toBe('error'); // console.error.name
        expect(parsed.severity).toBe('emerg'); // actual log level
        expect(parsed.msg).toBe('critical');
      },
    },
    {
      name: 'warn produces level="warn" severity="warn"',
      run: async (adapter) => {
        L.format = 'json';
        const lines = await adapter.capture(() => L.warn('warning msg'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<
          string,
          unknown
        >;
        expect(parsed.level).toBe('warn');
        expect(parsed.severity).toBe('warn');
      },
    },
    {
      name: 'debug produces level="debug" severity="debug"',
      run: async (adapter) => {
        // debug → console.debug → name = 'debug'
        L.format = 'json';
        const lines = await adapter.capture(() => L.debug('verbose'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<
          string,
          unknown
        >;
        expect(parsed.level).toBe('debug');
        expect(parsed.severity).toBe('debug');
      },
    },
    {
      name: 'scope name appears in JSON output as "scope" field',
      run: async (adapter) => {
        L.format = 'json';
        const s = L.scope('json-scope-test');
        const lines = await adapter.capture(() => s.info('scoped msg'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<
          string,
          unknown
        >;
        expect(parsed.scope).toBe('json-scope-test');
        expect(parsed.severity).toBe('info');
        expect(parsed.msg).toBe('scoped msg');
      },
    },
    {
      name: 'JSON fields appear in canonical order: time level severity msg',
      run: async (adapter) => {
        L.format = 'json';
        const lines = await adapter.capture(() => L.info('order'));
        const line = lines[0].trimEnd();
        // Verify field order by checking index positions in the raw JSON string
        expect(line.indexOf('"time"')).toBeLessThan(line.indexOf('"level"'));
        expect(line.indexOf('"level"')).toBeLessThan(
          line.indexOf('"severity"'),
        );
        expect(line.indexOf('"severity"')).toBeLessThan(line.indexOf('"msg"'));
      },
    },
    // CORE-05: logfmt format output
    {
      name: 'info call produces key=value pairs with correct fields',
      run: async (adapter) => {
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
        expect(stableLine).toMatchInlineSnapshot(
          `"time="<ts>" level=info severity=info msg="hello world""`,
        );
      },
    },
    {
      name: 'fields appear in the correct order: time level severity msg',
      run: async (adapter) => {
        L.format = 'logfmt';
        const lines = await adapter.capture(() => L.info('order-test'));
        const line = lines[0].trimEnd();
        expect(line.indexOf('time=')).toBeLessThan(line.indexOf('level='));
        expect(line.indexOf('level=')).toBeLessThan(line.indexOf('severity='));
        expect(line.indexOf('severity=')).toBeLessThan(line.indexOf('msg='));
      },
    },
    {
      name: 'emerg produces level=error severity=emerg',
      run: async (adapter) => {
        L.format = 'logfmt';
        const lines = await adapter.capture(() => L.emerg('crit msg'));
        expect(lines).toHaveLength(1);
        const parsed = parseLogfmt(lines[0].trimEnd());
        expect(parsed.level).toBe('error');
        expect(parsed.severity).toBe('emerg');
      },
    },
    // CORE-06: pretty format output — set pad=false for deterministic label width
    {
      name: 'info call produces [INFO] badge without ANSI codes',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.info('msg'));
        expect(lines).toHaveLength(1);
        expect(lines[0]).toContain('[INFO]');
        // renderConsolePrefix never emits ANSI escape sequences
        expect(lines[0]).not.toMatch(/\x1b\[/);
        expect(lines[0].trimEnd()).toMatchInlineSnapshot(`"[INFO] msg"`);
      },
    },
    {
      name: 'error level routes to stderr and contains [ERROR] badge',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.error('err'));
        // At least one line for the main log; additional entries may be the stack trace
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain('[ERROR]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'debug produces [DEBUG] badge',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.debug('dbg'));
        expect(lines[0]).toContain('[DEBUG]');
      },
    },
    {
      name: 'wth produces [WHO CARES?] badge',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.wth('shrug'));
        expect(lines[0]).toContain('[WHO CARES?]');
      },
    },
    {
      name: 'warn produces [WARNING] badge',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() => L.warn('caution'));
        expect(lines.length).toBeGreaterThanOrEqual(1);
        expect(lines[0]).toContain('[WARNING]');
      },
    },
  ],
};
