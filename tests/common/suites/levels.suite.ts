import { expect } from '@rstest/core';
import { L } from '../../../src';
import type { LogOutput } from '../output';
import type { Suite } from './suite';

/**
 * Declarative suite covering level dispatch, filtering, and toggle (CORE-01/02/03).
 * setup() forces L.format = 'json' so TRACE_LEVELS never emit a stack-trace line.
 */
export const levelsSuite: Suite = {
  name: 'levels',
  description: 'Level dispatch, filtering, and enabled toggle (CORE-01/02/03)',
  setup: async () => {
    // Force JSON format so TRACE_LEVELS (emerg/alert/crit/error/warn) never emit a
    // separate stack-trace line to stdout. The format is also ignored by browser tests
    // (browser always uses %c CSS), so this guard only affects node adapters.
    L.format = 'json';
  },
  tests: [
    // CORE-01: each level emits exactly one output line
    {
      name: 'emerg emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['emerg']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'alert emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['alert']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'crit emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['crit']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'error emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['error']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'warn emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['warn']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'notice emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['notice']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'success emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['success']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'info emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['info']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'verb emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['verb']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'debug emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['debug']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'wth emits exactly one line',
      run(_adapter) {
        (L as unknown as Record<string, (...a: unknown[]) => void>)['wth']('msg');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    // CORE-02: threshold-based filtering
    {
      name: 'messages below configured threshold are suppressed',
      run(_adapter) {
        // warn = severity 4; info = severity 7 → info is below threshold → suppressed
        L.level = 'warn';
        L.info('suppressed');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(0);
      },
    },
    {
      name: 'messages at the configured level pass through',
      run(_adapter) {
        L.level = 'warn';
        L.warn('at threshold');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'messages more critical than the threshold pass through',
      run(_adapter) {
        // error = severity 3, below warn(4) — more critical → passes
        L.level = 'warn';
        L.error('more critical');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
    {
      name: 'default level (wth) allows all 11 levels through',
      run(_adapter) {
        // Emit 3 representative levels — all should pass with default wth threshold
        for (const level of ['emerg', 'info', 'wth'] as const) {
          (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('x');
        }
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(3);
      },
    },
    // CORE-03: enabled flag toggle
    {
      name: 'enabled=false suppresses all output',
      run(_adapter) {
        L.enabled = false;
        L.info('suppressed');
        L.error('also suppressed');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(0);
      },
    },
    {
      name: 'enabled=false also suppresses scoped loggers',
      run(_adapter) {
        L.enabled = false;
        const s = L.scope('enabled-test');
        s.info('suppressed');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(0);
      },
    },
    {
      name: 're-enabling allows output again',
      run(_adapter) {
        L.enabled = false;
        L.enabled = true;
        L.info('visible');
      },
      check(entries: LogOutput[]) {
        expect(entries).toHaveLength(1);
      },
    },
  ],
};
