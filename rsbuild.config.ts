import { defineConfig } from '@rsbuild/core';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

export default defineConfig({
  plugins: [pluginNodePolyfill()],
  source: {
    entry: {
      index: './src/play-browser.dev.ts',
    },
    define: {
      __PLAY_MODE__: JSON.stringify(process.env.PLAY_MODE ?? 'main'),
    },
  },
  server: {
    port: 3000,
  },
  dev: {
    setupMiddlewares: (middlewares) => {
      middlewares.unshift((req, res, next) => {
        if (req.url?.includes('worker')) {
          res.setHeader('Cache-Control', 'no-store');
        }
        next();
      });
    },
  },
});
