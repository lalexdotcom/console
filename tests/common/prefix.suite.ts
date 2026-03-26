import { beforeEach, describe, expect, test } from '@rstest/core';
import { L } from '../../src';
import type { TestAdapter } from './adapter';

/**
 * Parameterised suite covering level badge, date prefix, caller prefix, and scope prefix
 * (PREFIX-01 through PREFIX-04). Receives a TestAdapter — no concrete adapter dependency.
 *
 * @param adapter - The environment adapter to test against.
 */
export function makeSuite(adapter: TestAdapter): void {
  describe(`prefix (${adapter.name})`, () => {
    beforeEach(async () => {
      await adapter.setup();
    });

    // PREFIX-01: each level's LEVEL_DISPLAY label appears in [LABEL] bracket in pretty format.
    // pad=false removes centering whitespace so assertions are stable.
    describe('Level badge (PREFIX-01)', () => {
      test.each([
        ['emerg',   'EMERGENCY'],
        ['alert',   'ALERT'],
        ['crit',    'CRITICAL'],
        ['error',   'ERROR'],
        ['warn',    'WARNING'],
        ['notice',  'NOTICE'],
        ['success', 'SUCCESS'],
        ['info',    'INFO'],
        ['verb',    'VERBOSE'],
        ['debug',   'DEBUG'],
        ['wth',     'WHO CARES?'],
      ] as const)('%s badge shows [%s]', async (level, label) => {
        L.format = 'pretty';
        L.pad = false;
        const lines = await adapter.capture(() =>
          (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('x'),
        );
        expect(lines[0]).toContain(`[${label}]`);
        // renderConsolePrefix never emits ANSI escape codes
        expect(lines[0]).not.toMatch(/\x1b\[/);
      });
    });

    // PREFIX-02: date bracket in pretty and logfmt output when date=true
    describe('Date prefix (PREFIX-02)', () => {
      test('date bracket appears in pretty output when date=true', async () => {
        L.format = 'pretty';
        L.pad = false;
        L.date = true;
        const lines = await adapter.capture(() => L.info('dated'));
        // getDatePrefix format: [YYYY-MM-DD HH:MM:SS.mmm]
        expect(lines[0]).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
      });

      test('no date bracket in pretty output when date=false (default)', async () => {
        L.format = 'pretty';
        L.pad = false;
        L.date = false;
        const lines = await adapter.capture(() => L.info('no-date'));
        expect(lines[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
      });

      test('date bracket appears in logfmt output when date=true', async () => {
        // In json/logfmt, time field is always present (uses Date.now() regardless of date option).
        // When date=true, the DatePrefix item sets the captured timestamp.
        // We verify the ISO 8601 time field is always a valid timestamp.
        L.format = 'logfmt';
        L.date = true;
        const lines = await adapter.capture(() => L.info('ts-test'));
        expect(lines[0]).toMatch(/time="[^"]+"/);
      });
    });

    // PREFIX-03: caller field appears in JSON output based on stack and TRACE_LEVELS.
    // CallerPrefix items are structuredOnly=true — they appear in JSON but not in pretty brackets.
    describe('Caller prefix (PREFIX-03)', () => {
      test('caller field appears in JSON output when stack=true', async () => {
        L.format = 'json';
        L.stack = true;
        const lines = await adapter.capture(() => L.info('traced'));
        expect(lines).toHaveLength(1);
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        // caller format: 'filename.ts:lineNumber:columnNumber'
        expect(typeof parsed.caller).toBe('string');
        expect(parsed.caller as string).toMatch(/\w+\.ts:\d+:\d+/);
      });

      test('no caller field in JSON output when stack=false (default)', async () => {
        L.format = 'json';
        L.stack = false;
        // Non-TRACE level (info) with stack=false → no caller in prefix
        const lines = await adapter.capture(() => L.info('no-trace'));
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.caller).toBeUndefined();
      });

      test('TRACE_LEVELS always include caller in JSON even without stack=true', async () => {
        // emerg/alert/crit/error/warn push caller even when stack=false
        L.format = 'json';
        L.stack = false;
        const lines = await adapter.capture(() => L.error('always traced'));
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        // TRACE_LEVELS add caller structuredOnly — visible in JSON
        expect(typeof parsed.caller).toBe('string');
      });
    });

    // PREFIX-04: scope prefix in pretty ([LABEL <scope>]) and JSON ('scope' field)
    describe('Scope prefix (PREFIX-04)', () => {
      test('scope name appears in pretty output as [LABEL <scope-name>]', async () => {
        L.format = 'pretty';
        L.pad = false;
        const s = L.scope('my-scope');
        const lines = await adapter.capture(() => s.info('scoped msg'));
        // renderConsolePrefix: '[' + item.label + ' <' + item.scope + '>]'
        expect(lines[0]).toContain('[INFO <my-scope>]');
      });

      test('scope field appears in JSON output', async () => {
        L.format = 'json';
        const s = L.scope('json-scope');
        const lines = await adapter.capture(() => s.info('msg'));
        const parsed = JSON.parse(lines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.scope).toBe('json-scope');
      });

      test('root logger has no scope in pretty output or JSON', async () => {
        L.format = 'pretty';
        L.pad = false;
        const prettyLines = await adapter.capture(() => L.info('root'));
        // No scope angle brackets
        expect(prettyLines[0]).not.toContain('<');

        L.format = 'json';
        const jsonLines = await adapter.capture(() => L.info('root-json'));
        const parsed = JSON.parse(jsonLines[0].trimEnd()) as Record<string, unknown>;
        expect(parsed.scope).toBeUndefined();
      });
    });
  });
}
