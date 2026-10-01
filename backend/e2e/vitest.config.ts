/// <reference types="vitest" />
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['e2e/**/*.e2e-spec.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: [],
    teardownTimeout: 10000,
    pool: 'forks',
    fileParallelism: false,
    singleFork: true,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, '../src'),
    },
  },
});
