import { cpus } from 'node:os';

export default {
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.spec.ts'],
    testTimeout: 15000,
    // The pool is capped rather than left at one worker per core. Unbounded
    // forks starve the box during start-up, and vitest then reports a worker
    // timeout as a failed run: the suite is green but the gate is red. Half the
    // cores keeps it parallel without that failure mode.
    maxWorkers: Math.max(1, Math.min(4, Math.floor(cpus().length / 2))),
  },
};
