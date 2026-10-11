import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Three independent builds, because Electron runs three different things:
 *
 *   main     — the Node process. Owns the filesystem, git, PTYs, windows.
 *   preload  — the only script that sees both worlds. Bridges them, narrowly.
 *   renderer — the Chromium page. React, CodeMirror, zero Node access.
 *
 * `externalizeDepsPlugin` keeps `dependencies` out of the main/preload bundles
 * so native modules (node-pty, when it lands) are loaded from node_modules at
 * runtime rather than being inlined by the bundler, which would break them.
 * That is why runtime packages belong in `dependencies` and everything the
 * renderer imports belongs in `devDependencies` — Vite bundles the renderer
 * wholesale, so its packages must not be externalized.
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
        '@main': resolve('src/main'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    // Forced to CommonJS. electron-vite would otherwise read `"type":
    // "module"` from package.json and emit ESM, but Electron's *sandboxed*
    // preload loader only understands CJS — an ESM preload fails to load with
    // `Cannot use import statement outside a module`, the bridge never
    // reaches the renderer, and `window.api` is undefined. The documented
    // alternative is `sandbox: false`, which is not on the table here.
    build: {
      rollupOptions: {
        input: resolve('src/preload/index.ts'),
        output: {
          format: 'cjs',
          entryFileNames: 'index.cjs',
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '~': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
  },
});
