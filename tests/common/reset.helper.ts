import { beforeEach } from '@rstest/core';

const REGISTRY_KEY = '$logger-registry';

/**
 * Resets the logger singleton registry before each test for isolation.
 * The registry object is mutated in-place (not deleted) because the IIFE in
 * src/logger/index.ts captures the reference by closure — deleting it from
 * globalThis wouldn't affect the live reference inside the module.
 *
 * rstest audit (v3.0.0): No rstest 0.9.x builtin handles logger-specific
 * singleton teardown. The beforeEach hook itself uses the rstest builtin;
 * only the registry-mutation logic is custom and cannot be replaced.
 *
 * Resets: scopes cache, exclusive lock, output format, root option overrides.
 */
beforeEach(() => {
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
});
