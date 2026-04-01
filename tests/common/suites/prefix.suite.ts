import { expect } from '@rstest/core';
import { L } from '../../../src';
import type { LogOutput } from '../output';
import type { Suite } from './suite';

/**
 * Declarative suite covering level badge, date prefix, caller prefix, and scope prefix
 * (PREFIX-01 through PREFIX-04).
 *
 * The test.each badge loop is unrolled into 11 individual TestCase objects.
 * Browser guards are preserved inline per test.
 */
export const prefixSuite: Suite = {
  name: 'prefix',
  description:
    'Level badge, date, caller, and scope prefix pipeline (PREFIX-01/02/03/04)',
  tests: [
    // PREFIX-01: each level badge label appears in [LABEL] bracket in pretty format
    {
      name: 'emerg badge shows [EMERGENCY]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['emerg'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[EMERGENCY]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'alert badge shows [ALERT]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['alert'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[ALERT]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'crit badge shows [CRITICAL]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['crit'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[CRITICAL]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'error badge shows [ERROR]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['error'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[ERROR]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'warn badge shows [WARNING]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['warn'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[WARNING]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'notice badge shows [NOTICE]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['notice'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[NOTICE]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'success badge shows [SUCCESS]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)[
          'success'
        ]('x');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[SUCCESS]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'info badge shows [INFO]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['info'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[INFO]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'verb badge shows [VERBOSE]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['verb'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[VERBOSE]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'debug badge shows [DEBUG]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['debug'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[DEBUG]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'wth badge shows [WHO CARES?]',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        (L as unknown as Record<string, (...a: unknown[]) => void>)['wth'](
          'x',
        );
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[WHO CARES?]');
        expect(entries[0].raw).not.toMatch(/\x1b\[/);
      },
    },
    // PREFIX-02: date bracket in pretty and logfmt output when date=true
    {
      name: 'date bracket appears in pretty output when date=true',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.date = true;
        L.info('dated');
      },
      check(entries: LogOutput[]) {
        // getDatePrefix format: [YYYY-MM-DD HH:MM:SS.mmm]
        expect(entries[0].raw).toMatch(
          /\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/,
        );
      },
    },
    {
      name: 'no date bracket in pretty output when date=false (default)',
      run(_adapter) {
        L.format = 'pretty';
        L.pad = false;
        L.date = false;
        L.info('no-date');
      },
      check(entries: LogOutput[]) {
        expect(entries[0].raw).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    {
      name: 'date bracket appears in logfmt output when date=true',
      run(adapter) {
        // Browser always emits %c CSS format — never logfmt text.
        if (adapter.name.startsWith('browser')) return;
        // In json/logfmt, time field is always present (uses Date.now() regardless of date option).
        // When date=true, the DatePrefix item sets the captured timestamp.
        // We verify the ISO 8601 time field is always a valid timestamp.
        L.format = 'logfmt';
        L.date = true;
        L.info('ts-test');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toMatch(/time="[^"]+"/);
      },
    },
    // PREFIX-03: caller field in JSON output
    {
      name: 'caller field appears in JSON output when stack=true',
      run(adapter) {
        // Browser always emits %c CSS format — L.format='json' is a no-op in browser.
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        L.stack = true;
        L.info('traced');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries).toHaveLength(1);
        // caller format: 'filename.ts:lineNumber:columnNumber'
        expect(entries[0].caller).toMatch(/\w+\.ts:\d+:\d+/);
      },
    },
    {
      name: 'no caller field in JSON output when stack=false (default)',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        L.stack = false;
        // Non-TRACE level (info) with stack=false → no caller in prefix
        L.info('no-trace');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].caller).toBeUndefined();
      },
    },
    {
      name: 'TRACE_LEVELS always include caller in JSON even without stack=true',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        // emerg/alert/crit/error/warn push caller even when stack=false
        L.format = 'json';
        L.stack = false;
        L.error('always traced');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        // TRACE_LEVELS add caller structuredOnly — visible in JSON
        expect(typeof entries[0].caller).toBe('string');
      },
    },
    // PREFIX-04: scope prefix
    {
      name: 'scope name appears in pretty output as [LABEL <scope-name>]',
      run(adapter) {
        // Browser uses '%cINFO <my-scope>%c' — no square brackets.
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        // renderConsolePrefix: '[' + item.label + ' <' + item.scope + '>]'
        L.scope('my-scope').info('scoped msg');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).toContain('[INFO <my-scope>]');
      },
    },
    {
      name: 'scope field appears in JSON output',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        L.scope('json-scope').info('msg');
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].scope).toBe('json-scope');
      },
    },
    {
      name: 'root logger has no scope in pretty output or JSON',
      run(adapter) {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        L.info('root');       // entry 0: pretty line — no scope angle brackets
        L.format = 'json';
        L.info('root-json');  // entry 1: JSON line — scope field absent
      },
      check(entries: LogOutput[]) {
        if (entries.length === 0) return;
        expect(entries[0].raw).not.toContain('<');
        expect(entries[1].scope).toBeUndefined();
      },
    },
  ],
};
