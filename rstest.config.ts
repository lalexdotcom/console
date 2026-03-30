import path from 'node:path';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { withRslibConfig } from '@rstest/adapter-rslib';
import { defineConfig } from '@rstest/core';

// Three independent rstest projects. defineConfig wrapper is required because rsbuild's
// loadConfig (used by rstest internally) rejects bare array exports — must be an object.
// Each project inherits rslib config via withRslibConfig() which propagates plugins,
// source.define, resolve, and tools fields from rslib.config.ts.
export default defineConfig({
  projects: [
    {
      name: 'browser',
      extends: withRslibConfig({
        modifyLibConfig: (config) => ({
          ...config,
          // Polyfill Node built-ins required by ttyRenderer when bundling for Playwright.
          plugins: [...(config.plugins ?? []), pluginNodePolyfill()],
        }),
      }),
      include: ['tests/browser/**/*.test.ts'],
      setupFiles: ['./tests/common/reset.helper.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        headless: true,
      },
      passWithNoTests: true,
    },
    {
      name: 'node-console',
      extends: withRslibConfig(),
      include: ['tests/console/**/*.test.ts', 'tests/node/**/*.test.ts', 'tests/common/**/*.test.ts'],
      setupFiles: ['./tests/common/reset.helper.ts'],
      // Disable rstest's built-in console intercept so it doesn't conflict with the
      // logger's own patch()/unpatch() console replacement.
      disableConsoleIntercept: true,
      passWithNoTests: true,
    },
    {
      name: 'node-tty',
      extends: withRslibConfig(),
      // resolve.alias substitutes src/utils/env with the TTY stub at rspack bundle time,
      // making isNodeTTY=true a compile-time constant for all code in this project.
      // source.alias is NOT in RstestConfig.source — only resolve.alias works here.
      resolve: {
        alias: {
          [path.resolve(import.meta.dirname, 'src/utils/env')]:
            path.resolve(import.meta.dirname, 'tests/tty/env.ts'),
        },
      },
      include: ['tests/tty/**/*.test.ts', 'tests/common/**/*.test.ts'],
      setupFiles: ['./tests/common/reset.helper.ts'],
      disableConsoleIntercept: true,
      passWithNoTests: true,
    },
  ],
});
