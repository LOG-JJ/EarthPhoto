import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import cesium from 'vite-plugin-cesium';
import electron from 'vite-plugin-electron/simple';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const aliases = {
  '@main': path.resolve(__dirname, 'main'),
  '@renderer': path.resolve(__dirname, 'renderer'),
  '@shared': path.resolve(__dirname, 'shared'),
};

export default defineConfig({
  base: './',
  plugins: [
    react(),
    cesium(),
    electron({
      main: {
        entry: 'main/main.ts',
        vite: {
          resolve: {
            alias: aliases,
          },
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              external: [
                'electron',
                'better-sqlite3',
                'sharp',
                'ffmpeg-static',
                '@ffmpeg-installer/ffmpeg',
                'heic-decode',
                'exiftool-vendored',
                'fast-glob',
                'mime-types',
                'chokidar',
                'supercluster',
                'lodash.debounce',
              ],
              output: {
                entryFileNames: 'main.js',
                format: 'cjs',
              },
            },
          },
        },
      },
      preload: {
        input: path.join(__dirname, 'main/preload.ts'),
        vite: {
          resolve: {
            alias: aliases,
          },
          build: {
            outDir: 'dist-electron',
            emptyOutDir: false,
            rollupOptions: {
              external: ['electron'],
              output: {
                entryFileNames: 'preload.js',
                format: 'cjs',
              },
            },
          },
        },
      },
    }),
  ],
  resolve: {
    alias: aliases,
    preserveSymlinks: true,
  },
  server: {
    fs: {
      strict: false,
    },
  },
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        app: 'index.html',
      },
    },
  },
});
