import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(__dirname, '.')
    }
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'app/**/__tests__/**/*.test.tsx'],
    setupFiles: ['vitest.setup.ts'],
    environmentMatchGlobs: [
      ['**/*.test.tsx', 'jsdom']
    ],
    css: false
  },
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'react'
  }
});
