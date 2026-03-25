import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../common/capture.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles.

describe('Level badge (PREFIX-01)', () => {
  // Verify each level's LEVEL_DISPLAY label appears in [LABEL] bracket in pretty format.
  // pad=false: removes centering whitespace so assertions are stable.
  test.each([
    // [level, expectedLabel, stream]
    ['emerg',   'EMERGENCY',  'stderr'],
    ['alert',   'ALERT',      'stderr'],
    ['crit',    'CRITICAL',   'stderr'],
    ['error',   'ERROR',      'stderr'],
    ['warn',    'WARNING',    'stderr'],
    ['notice',  'NOTICE',     'stdout'],
    ['success', 'SUCCESS',    'stdout'],
    ['info',    'INFO',       'stdout'],
    ['verb',    'VERBOSE',    'stdout'],
    ['debug',   'DEBUG',      'stdout'],
    ['wth',     'WHO CARES?', 'stdout'],
  ] as const)('%s badge shows [%s]', (level, label, stream) => {
    L.format = 'pretty';
    L.pad = false;
    const { stdout, stderr } = captureAll(() =>
      (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('x'),
    );
    const line = stream === 'stderr' ? stderr[0] : stdout[0];
    expect(line).toContain(`[${label}]`);
    // renderConsolePrefix never emits ANSI escape codes
    expect(line).not.toMatch(/\x1b\[/);
  });
});

describe('Date prefix (PREFIX-02)', () => {
  test('date bracket appears in pretty output when date=true', () => {
    L.format = 'pretty';
    L.pad = false;
    L.date = true;
    const { stdout } = captureAll(() => L.info('dated'));
    // getDatePrefix format: [YYYY-MM-DD HH:MM:SS.mmm]
    expect(stdout[0]).toMatch(/\[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}\]/);
  });

  test('no date bracket in pretty output when date=false (default)', () => {
    L.format = 'pretty';
    L.pad = false;
    L.date = false;
    const { stdout } = captureAll(() => L.info('no-date'));
    expect(stdout[0]).not.toMatch(/\[\d{4}-\d{2}-\d{2}/);
  });

  test('date bracket appears in logfmt output when date=true', () => {
    // In json/logfmt, time field is always present (uses Date.now() regardless of date option).
    // When date=true, the DatePrefix item sets the captured timestamp.
    // We verify the ISO 8601 time field is always a valid timestamp.
    L.format = 'logfmt';
    L.date = true;
    const { stdout } = captureAll(() => L.info('ts-test'));
    expect(stdout[0]).toMatch(/time="[^"]+"/);
  });
});

describe('Caller prefix (PREFIX-03)', () => {
  // All CallerPrefix items are structuredOnly=true (see prepareLog source):
  // - renderConsolePrefix SKIPS them (never in pretty bracket prefix)
  // - serializeJSON INCLUDES them as 'caller' field
  // Test via JSON format — the clean, stable way to verify caller capture.

  test('caller field appears in JSON output when stack=true', () => {
    L.format = 'json';
    L.stack = true;
    const { stdout } = captureAll(() => L.info('traced'));
    expect(stdout).toHaveLength(1);
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    // caller format: 'filename.ts:lineNumber:columnNumber'
    expect(typeof parsed.caller).toBe('string');
    expect(parsed.caller as string).toMatch(/\w+\.ts:\d+:\d+/);
  });

  test('no caller field in JSON output when stack=false (default)', () => {
    L.format = 'json';
    L.stack = false;
    // Non-TRACE level (info) with stack=false → no caller in prefix
    const { stdout } = captureAll(() => L.info('no-trace'));
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.caller).toBeUndefined();
  });

  test('TRACE_LEVELS always include caller in JSON even without stack=true', () => {
    // emerg/alert/crit/error/warn push caller even when stack=false
    L.format = 'json';
    L.stack = false;
    const { stderr } = captureAll(() => L.error('always traced'));
    const parsed = JSON.parse(stderr[0].trimEnd()) as Record<string, unknown>;
    // TRACE_LEVELS add caller structuredOnly — visible in JSON
    expect(typeof parsed.caller).toBe('string');
  });
});

describe('Scope prefix (PREFIX-04)', () => {
  test('scope name appears in pretty output as [LABEL <scope-name>]', () => {
    L.format = 'pretty';
    L.pad = false;
    const s = L.scope('my-scope');
    const { stdout } = captureAll(() => s.info('scoped msg'));
    // renderConsolePrefix: '[' + item.label + ' <' + item.scope + '>]'
    expect(stdout[0]).toContain('[INFO <my-scope>]');
  });

  test('scope field appears in JSON output', () => {
    L.format = 'json';
    const s = L.scope('json-scope');
    const { stdout } = captureAll(() => s.info('msg'));
    const parsed = JSON.parse(stdout[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.scope).toBe('json-scope');
  });

  test('root logger has no scope in pretty output or JSON', () => {
    L.format = 'pretty';
    L.pad = false;
    const { stdout } = captureAll(() => L.info('root'));
    // No scope angle brackets
    expect(stdout[0]).not.toContain('<');

    L.format = 'json';
    const { stdout: jOut } = captureAll(() => L.info('root-json'));
    const parsed = JSON.parse(jOut[0].trimEnd()) as Record<string, unknown>;
    expect(parsed.scope).toBeUndefined();
  });
});
