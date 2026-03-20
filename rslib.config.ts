import { defineConfig } from '@rslib/core';

const WORKER_FILENAME = 'worker';

export default defineConfig({
  // Exclude dev playground files from all build entries.
  source: {
    exclude: [/\.dev\.ts$/],
  },
  // Root-level Rspack config — applies to every lib entry compilation.
  // chunkFilename is set here (not per-lib) because esm1 and esm2 share
  // dist/worker/ and may run in the same Rspack compilation, causing per-lib
  // tools.rspack functions to be ignored.
  tools: {
    rspack(config) {
      config.optimization ??= {};
      // Use module-path-derived names instead of numeric chunk IDs.
      config.optimization.chunkIds = 'named';
      config.output ??= {};
      config.output.chunkFilename = '[name].js';
      return config;
    },
  },
  lib: [
    // Main entry — @lalex/console
    {
      format: 'esm',
      syntax: ['node 18'],
      dts: true,
    },
    // Worker proxy entry — @lalex/console/worker
    {
      format: 'esm',
      syntax: ['node 18'],
      dts: true,
      source: {
        entry: { index: './src/worker/index.ts' },
        // Inject the worker script filename as a compile-time constant so
        // new URL() calls in index.ts stay in sync with the esm2 entry name.
        define: {
          __WORKER_SCRIPT__: JSON.stringify(`./${WORKER_FILENAME}.js`),
        },
      },
      output: {
        distPath: { root: './dist/worker' },
      },
    },
    // Worker script — loaded by the fork/Web Worker at runtime.
    // Entry kept explicit: Rslib does not auto-split new URL('./worker.ts').
    {
      format: 'esm',
      syntax: ['node 18'],
      dts: false,
      source: {
        entry: { [WORKER_FILENAME]: './src/worker/worker.ts' },
      },
      output: {
        distPath: { root: './dist/worker' },
      },
    },
  ],
});
