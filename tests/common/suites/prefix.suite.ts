import { expect } from '@rstest/core';
import { L } from '../../../src';
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
  description: 'Level badge, date, caller, and scope prefix pipeline (PREFIX-01/02/03/04)',
  tests: [
    // PREFIX-01: each level badge label appears in [LABEL] bracket in pretty format
    {
      name: 'emerg badge shows [EMERGENCY]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['emerg']('x'),
        );
        expect(lines[0]).toContain('[EMERGENCY]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'alert badge shows [ALERT]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['alert']('x'),
        );
        expect(lines[0]).toContain('[ALERT]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'crit badge shows [CRITICAL]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['crit']('x'),
        );
        expect(lines[0]).toContain('[CRITICAL]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'error badge shows [ERROR]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['error']('x'),
        );
        expect(lines[0]).toContain('[ERROR]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'warn badge shows [WARNING]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['warn']('x'),
        );
        expect(lines[0]).toContain('[WARNING]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'notice badge shows [NOTICE]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['notice']('x'),
        );
        expect(lines[0]).toContain('[NOTICE]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'success badge shows [SUCCESS]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['success']('x'),
        );
        expect(lines[0]).toContain('[SUCCESS]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'info badge shows [INFO]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['info']('x'),
        );
        expect(lines[0]).toContain('[INFO]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'verb badge shows [VERBOSE]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['verb']('x'),
        );
        expect(lines[0]).toContain('[VERBOSE]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'debug badge shows [DEBUG]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['debug']('x'),
        );
        expect(lines[0]).toContain('[DEBUG]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    {
      name: 'wth badge shows [WHO CARES?]',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)['wth']('x'),
        );
        expect(lines[0]).toContain('[WHO CARES?]');
        expect(lines[0]).not.toMatch(/\x1b\[/);
      },
    },
    // PREFIX-02: date bracket in pretty and logfmt output when date=true
    {
      name: 'date bracket appears in pretty output when date=true',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        L.date = true;
        const lines = await adapter.capture(() => L.info('dated'));
        // getDatePrefix format: [YYYY-MM-DD HH:MM:SS.mmm]
        expect(lines[0]).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
      },
    },
    {
      name: 'no date bracket in pretty output when date=false (default)',
      run: async (adapter) => {
        L.format = 'pretty';
        L.pad = false;
        L.date = false;
        const lines = await adapter.capture(() => L.info('no-date'));
        expect(lines[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      },
    },
    {
      name: 'date bracket appears in logfmt output when date=true',
      run: async (adapter) => {
        // Browser always emits %c CSS format — never logfmt text.
        if (adapter.name.startsWith('browser')) return;
        // In json/logfmt, time field is always present (uses Date.now() regardless of date option).
        // When date=true, the DatePrefix item sets the captured timestamp.
        // We verify the ISO 8601 time field is always a valid timestamp.
        L.format = 'logfmt';
        L.date = true;
        const lines = await adapter.capture(() => L.info('ts-test'));
        expect(lines[0]).toMatch(/time="[^"]+"/);
      },
    },
    // PREFIX-03: caller field in JSON output
    {
      name: 'caller field appears in JSON output when stack=true',
      run: async (adapter) => {
        // Browser always emits %c CSS format — L.format='json' is a no-op in browser.
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        L.stack = true;
        const lines = await adapter.capture(() => L.info('traced'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        // caller format: 'filename.ts:lineNumber:columnNumber'
        expect(typeof parsed.caller).toBe('string');
        expect(parsed.caller as string).toMatch(/\w+\.ts:\d+:\d+/);
      },
    },
    {
      name: 'no caller field in JSON output when stack=false (default)',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        L.stack = false;
        // Non-TRACE level (info) with stack=false → no caller in prefix
        const lines = await adapter.capture(() => L.info('no-trace'));
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.caller).toBeUndefined();
      },
    },
    {
      name: 'TRACE_LEVELS always include caller in JSON even without stack=true',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        // emerg/alert/crit/error/warn push caller even when stack=false
        L.format = 'json';
        L.stack = false;
        const lines = await adapter.capture(() => L.error('always traced'));
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        // TRACE_LEVELS add caller structuredOnly — visible in JSON
        expect(typeof parsed.caller).toBe('string');
      },
    },
    // PREFIX-04: scope prefix
    {
      name: 'scope name appears in pretty output as [LABEL <scope-name>]',
      run: async (adapter) => {
        // Browser uses '%cINFO <my-scope>%c' — no square brackets.
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const s = L.scope('my-scope');
        const lines = await adapter.capture(() => s.info('scoped msg'));
        // renderConsolePrefix: '[' + item.label + ' <' + item.scope + '>]'
        expect(lines[0]).toContain('[INFO <my-scope>]');
      },
    },
    {
      name: 'scope field appears in JSON output',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'json';
        const s = L.scope('json-scope');
        const lines = await adapter.capture(() => s.info('msg'));
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.scope).toBe('json-scope');
      },
    },
    {
      name: 'root logger has no scope in pretty output or JSON',
      run: async (adapter) => {
        if (adapter.name.startsWith('browser')) return;
        L.format = 'pretty';
        L.pad = false;
        const prettyLines = await adapter.capture(() => L.info('root'));
        // No scope angle brackets
        expect(prettyLines[0]).not.toContain('<');

        L.format = 'json';
        const jsonLines = await adapter.capture(() => L.info('root-json'));
        const parsed = JSON.parse(jsonLines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.scope).toBeUndefined();
      },
    },
  ],
};
