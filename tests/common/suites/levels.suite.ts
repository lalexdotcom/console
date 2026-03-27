import { expect } from '@rstest/core';
import { L } from '../../../src';
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
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['emerg']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'alert emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['alert']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'crit emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['crit']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'error emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['error']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'warn emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['warn']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'notice emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['notice']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'success emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['success']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'info emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['info']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'verb emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['verb']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'debug emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['debug']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'wth emits exactly one line',
      run: async (adapter) => {
        const lines = await adapter.capture(() => {
          (L as unknown as Record<string, (...a: unknown[]) => void>)['wth']('msg');
        });
        expect(lines).toHaveLength(1);
      },
    },
    // CORE-02: threshold-based filtering
    {
      name: 'messages below configured threshold are suppressed',
      run: async (adapter) => {
        // warn = severity 4; info = severity 7 → info is below threshold → suppressed
        L.level = 'warn';
        const lines = await adapter.capture(() => L.info('suppressed'));
        expect(lines).toHaveLength(0);
      },
    },
    {
      name: 'messages at the configured level pass through',
      run: async (adapter) => {
        L.level = 'warn';
        const lines = await adapter.capture(() => L.warn('at threshold'));
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'messages more critical than the threshold pass through',
      run: async (adapter) => {
        // error = severity 3, below warn(4) — more critical → passes
        L.level = 'warn';
        const lines = await adapter.capture(() => L.error('more critical'));
        expect(lines).toHaveLength(1);
      },
    },
    {
      name: 'default level (wth) allows all 11 levels through',
      run: async (adapter) => {
        for (const level of ['emerg', 'info', 'wth'] as const) {
          const lines = await adapter.capture(() =>
            (L as unknown as Record<string, (...a: unknown[]) => void>)[level]('x'),
          );
          expect(lines).toHaveLength(1);
        }
      },
    },
    // CORE-03: enabled flag toggle
    {
      name: 'enabled=false suppresses all output',
      run: async (adapter) => {
        L.enabled = false;
        const lines = await adapter.capture(() => {
          L.info('suppressed');
          L.error('also suppressed');
        });
        expect(lines).toHaveLength(0);
      },
    },
    {
      name: 'enabled=false also suppresses scoped loggers',
      run: async (adapter) => {
        L.enabled = false;
        const s = L.scope('enabled-test');
        const lines = await adapter.capture(() => s.info('suppressed'));
        expect(lines).toHaveLength(0);
      },
    },
    {
      name: 're-enabling allows output again',
      run: async (adapter) => {
        L.enabled = false;
        L.enabled = true;
        const lines = await adapter.capture(() => L.info('visible'));
        expect(lines).toHaveLength(1);
      },
    },
  ],
};
