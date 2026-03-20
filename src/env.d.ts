/// <reference types="@rsbuild/core/types" />

/**
 * Worker script filename injected at build time by rslib.config.ts via source.define.
 * Resolves to a relative path like './worker.js'.
 * Declared as string so the production new URL() call stays type-correct.
 * The dev-mode guard in worker/index.ts uses `typeof` to avoid a ReferenceError
 * when tsx runs the source directly without the build-time substitution.
 */
declare const __WORKER_SCRIPT__: string;
