import { beforeEach } from '@rstest/core';

const REGISTRY_KEY = '$logger-registry';

/**
 * Resets the logger singleton registry to its default state.
 * Mutates the registry object in-place — the IIFE in src/logger/index.ts captures
 * the reference by closure, so deleting the key from globalThis would have no effect.
 *
 * Exported so runner.ts can call it between parity runs (main adapter run → worker
 * adapter run) to prevent option/mixin state from the first run bleeding into the second.
 *
 * Resets: scopes cache, exclusive lock, output format, root option overrides.
 */
export function resetRegistry(): void {
  const g = globalThis as Record<string, unknown>;
  const reg = g[REGISTRY_KEY] as
    | {
        scopes: Record<string, unknown>;
        exclusive?: unknown;
        format: string;
        rootOptions: Record<string, unknown>;
      }
    | undefined;

  if (reg) {
    for (const key of Object.keys(reg.scopes)) {
      delete reg.scopes[key];
    }
    delete reg.exclusive;
    reg.format = 'json';
    for (const key of Object.keys(reg.rootOptions)) {
      delete reg.rootOptions[key];
    }
  }
}

/**
 * Registers the registry reset as a beforeEach hook for test isolation.
 *
 * rstest audit (v3.0.0): No rstest 0.9.x builtin handles logger-specific
 * singleton teardown. The beforeEach hook itself uses the rstest builtin;
 * only the registry-mutation logic is custom and cannot be replaced.
 */
beforeEach(() => {
  resetRegistry();
});
