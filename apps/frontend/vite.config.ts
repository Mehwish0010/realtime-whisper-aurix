import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              // Keep some heavy/native Node modules external so Electron
              // loads them at runtime instead of Vite bundling them.
              external: [
                'ws',
                'bufferutil',
                'utf-8-validate',
                'groq-sdk',
                '@deepgram/sdk',
                // Important: keep firebase-admin as a Node dependency so its
                // internal use of __dirname works correctly.
                'firebase-admin',
                'firebase-admin/app',
                'firebase-admin/firestore',
                'cohere-ai',
                '@qdrant/js-client-rest',
              ],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(options) {
          options.reload();
        },
        vite: {
          build: {
            outDir: 'dist-electron',
            rollupOptions: {
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  base: './',
  build: {
    outDir: 'dist',
  },
});
