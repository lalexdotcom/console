import { defineConfig } from '@rslib/core';
import { WORKER_FILENAME } from './src/worker/const.ts';

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
      bundle: false,
      format: 'esm',
      syntax: ['node 18'],
      dts: true,
      source: {
        // Glob all source files except dev playground scripts.
        // bundle:false scans the full source tree; the glob negation prevents
        // .dev.ts files from being discovered (source.exclude only affects
        // loaders, not file discovery in bundleless mode).
        entry: { index: ['src/**', '!src/**/*.dev.ts'] },
      },
    },
    // Worker proxy entry — @lalex/console/worker
    {
      bundle: false,
      format: 'esm',
      syntax: ['node 18'],
      dts: true,
      source: {
        entry: { index: './src/worker/index.ts' },
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
    // Browser-safe entry — consumed via the "browser" exports condition.
    // Targets es2020 modern browsers; no node: imports survive in this bundle.
    // dts: false — browser entry shares type declarations with lib[0].
    {
      bundle: false,
      format: 'esm',
      syntax: 'es2020',
      dts: false,
      source: {
        // Same glob exclusion as the main entry — exclude dev playground scripts.
        entry: { index: ['src/**', '!src/**/*.dev.ts'] },
      },
      output: {
        distPath: { root: './dist/browser' },
      },
    },
  ],
});
