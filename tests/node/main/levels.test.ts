import { describe, expect, test } from '@rstest/core';
import { L } from '../../../src';
import { captureAll } from '../../common/capture.helper';

// reset.ts is registered globally via rstest.config.ts setupFiles — no import needed.

describe('Level dispatch (CORE-01)', () => {
  // Use json format: avoids the pretty-mode TRACE_LEVELS stdout trace spillover
  // (emerg/alert/crit/error/warn in pretty mode emit a stack trace to stdout after
  // the main line on stderr — json format returns early with exactly one stderr line).
  test.each([
    ['emerg', 'stderr'],
    ['alert', 'stderr'],
    ['crit', 'stderr'],
    ['error', 'stderr'],
    ['warn', 'stderr'],
    ['notice', 'stdout'],
    ['success', 'stdout'],
    ['info', 'stdout'],
    ['verb', 'stdout'],
    ['debug', 'stdout'],
    ['wth', 'stdout'],
  ] as const)('%s routes to %s', (level, stream) => {
    L.format = 'json';
    const { stdout, stderr } = captureAll(() =>
      (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('msg'),
    );
    if (stream === 'stderr') {
      expect(stderr).toHaveLength(1);
      expect(stdout).toHaveLength(0);
    } else {
      expect(stdout).toHaveLength(1);
      expect(stderr).toHaveLength(0);
    }
  });
});

describe('Level filtering (CORE-02)', () => {
  test('messages below configured threshold are suppressed', () => {
    // warn = severity 4; info = severity 7 → info is below threshold → suppressed
    L.format = 'json';
    L.level = 'warn';
    const { stdout, stderr } = captureAll(() => L.info('suppressed'));
    expect(stdout).toHaveLength(0);
    expect(stderr).toHaveLength(0);
  });

  test('messages at the configured level pass through', () => {
    L.format = 'json';
    L.level = 'warn';
    const { stderr } = captureAll(() => L.warn('at threshold'));
    expect(stderr).toHaveLength(1);
  });

  test('messages more critical than the threshold pass through', () => {
    // error = severity 3, which is below warn(4) — more critical → passes
    L.format = 'json';
    L.level = 'warn';
    const { stderr } = captureAll(() => L.error('more critical'));
    expect(stderr).toHaveLength(1);
  });

  test('default level (wth) allows all 11 levels through', () => {
    // After reset, rootOptions has no level → defaults to most permissive ('wth' = 10)
    L.format = 'json';
    for (const [level, stream] of [
      ['emerg', 'stderr'],
      ['info', 'stdout'],
      ['wth', 'stdout'],
    ] as const) {
      const { stdout, stderr } = captureAll(() =>
        (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('x'),
      );
      if (stream === 'stderr') {
        expect(stderr).toHaveLength(1);
      } else {
        expect(stdout).toHaveLength(1);
      }
    }
  });
});

describe('Logger.enabled toggle (CORE-03)', () => {
  test('enabled=false suppresses all output regardless of level', () => {
    L.format = 'json';
    L.enabled = false;
    const { stdout, stderr } = captureAll(() => {
      L.info('suppressed');
      L.error('also suppressed');
    });
    expect(stdout).toHaveLength(0);
    expect(stderr).toHaveLength(0);
  });

  test('enabled=true (default after reset) allows output through', () => {
    L.format = 'json';
    expect(L.enabled).toBe(true); // confirmed default
    const { stdout } = captureAll(() => L.info('shown'));
    expect(stdout).toHaveLength(1);
  });

  test('scope output also suppressed when root enabled=false', () => {
    L.format = 'json';
    L.enabled = false;
    const s = L.scope('enabled-scope');
    const { stdout, stderr } = captureAll(() => s.info('muted'));
    expect(stdout).toHaveLength(0);
    expect(stderr).toHaveLength(0);
  });
});
