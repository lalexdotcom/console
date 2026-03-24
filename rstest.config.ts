import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';
import { withRslibConfig } from '@rstest/adapter-rslib';
import { defineConfig } from '@rstest/core';

export default defineConfig({
  projects: [
    {
      name: 'node',
      extends: withRslibConfig(),
      include: ['tests/node/**/*.test.ts', 'tests/tty/**/*.test.ts'],
      setupFiles: ['./tests/helpers/reset.ts'],
      // Disable rstest's built-in console intercept so it doesn't conflict
      // with the logger's own patch()/unpatch() console replacement.
      disableConsoleIntercept: true,
      passWithNoTests: true,
    },
    {
      name: 'browser',
      extends: withRslibConfig({
        modifyLibConfig: (config) => ({
          ...config,
          // Polyfill Node built-ins (node:util etc.) required by ttyRenderer
          // when bundling the logger source for the Playwright browser project.
          plugins: [...(config.plugins ?? []), pluginNodePolyfill()],
        }),
      }),
      include: ['tests/browser/**/*.test.ts'],
      setupFiles: ['./tests/helpers/reset.ts'],
      browser: {
        enabled: true,
        provider: 'playwright',
        headless: true,
      },
      passWithNoTests: true,
    },
  ],
});
