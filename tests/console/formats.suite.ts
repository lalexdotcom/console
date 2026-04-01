import { expect } from '@rstest/core';
import { L } from '../../src';
import type { LogOutput } from '../common/output';
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
      run(_adapter) {
        L.format = 'json';
        L.info('hello');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        // level = console method name; info → console.info → severity = 'info'
        expect(entries[0].level).toBe('info');
        expect(entries[0].msg).toBe('hello');
        // time must be a valid ISO 8601 string
        expect(entries[0].date).toBeDefined();
        expect(new Date(entries[0].date!).toISOString()).toBe(entries[0].date);
        // Verify field order in raw output
        const line = entries[0].raw.trimEnd();
        expect(line.indexOf('"time"')).toBeLessThan(line.indexOf('"level"'));
      },
    },
    {
      name: 'emerg produces level="error" and severity="emerg"',
      run(_adapter) {
        // emerg → console.error → LEVEL_METHODS[emerg].name = 'error'
        L.format = 'json';
        L.emerg('critical');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe('emerg'); // p.severity
        expect(entries[0].raw).toContain('"level":"error"'); // console method routing
        expect(entries[0].msg).toBe('critical');
      },
    },
    {
      name: 'warn produces level="warn" severity="warn"',
      run(_adapter) {
        L.format = 'json';
        L.warn('warning msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe('warn');
        expect(entries[0].msg).toBe('warning msg');
      },
    },
    {
      name: 'debug produces level="debug" severity="debug"',
      run(_adapter) {
        // debug → console.debug → name = 'debug'
        L.format = 'json';
        L.debug('verbose');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe('debug');
      },
    },
    {
      name: 'scope name appears in JSON output as "scope" field',
      run(_adapter) {
        L.format = 'json';
        L.scope('json-scope-test').info('scoped msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].scope).toBe('json-scope-test');
        expect(entries[0].level).toBe('info');
        expect(entries[0].msg).toBe('scoped msg');
      },
    },
    {
      name: 'JSON fields appear in canonical order: time level severity msg',
      run(_adapter) {
        L.format = 'json';
        L.info('order');
      },
      check(entries: LogOutput[]) {
        const line = entries[0].raw.trimEnd();
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
      run(_adapter) {
        L.format = 'logfmt';
        L.info('hello world');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe('info');
        expect(entries[0].msg).toBe('hello world');
        // time field always present as ISO 8601
        expect(entries[0].date).toBeDefined();
        expect(new Date(entries[0].date!).toISOString()).toBe(entries[0].date);
      },
    },
    {
      name: 'fields appear in the correct order: time level severity msg',
      run(_adapter) {
        L.format = 'logfmt';
        L.info('order-test');
      },
      check(entries: LogOutput[]) {
        const line = entries[0].raw.trimEnd();
        expect(line.indexOf('time=')).toBeLessThan(line.indexOf('level='));
        expect(line.indexOf('level=')).toBeLessThan(line.indexOf('severity='));
        expect(line.indexOf('severity=')).toBeLessThan(line.indexOf('msg='));
      },
    },
    {
      name: 'emerg produces level=error severity=emerg',
      run(_adapter) {
        L.format = 'logfmt';
        L.emerg('crit msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].level).toBe('emerg'); // p.severity
        expect(entries[0].raw).toContain('level=error'); // console method routing
      },
    },
    // CORE-06: pretty format output — set pad=false for deterministic label width
    {
      name: 'info call produces [INFO] badge without ANSI codes',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.info('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
        expect(entries[0].raw).toContain('[INFO]');
        // renderConsolePrefix never emits ANSI escape sequences
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
        expect(entries[0].level).toBe('info');
        expect(entries[0].msg).toBe('msg');
      },
    },
    {
      name: 'error level routes to stderr and contains [ERROR] badge',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.error('err');
      },
      check(entries: LogOutput[]) {
        // At least one line for the main log; additional entries may be the stack trace
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0].raw).toContain('[ERROR]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'debug produces [DEBUG] badge',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.debug('dbg');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).toContain('[DEBUG]');
      },
    },
    {
      name: 'wth produces [WHO CARES?] badge',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.wth('shrug');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).toContain('[WHO CARES?]');
      },
    },
    {
      name: 'warn produces [WARNING] badge',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.warn('caution');
      },
      check(entries: LogOutput[]) {
        expect(entries.length).toBeGreaterThanOrEqual(1);
        expect(entries[0].raw).toContain('[WARNING]');
      },
    },
  ],
};
