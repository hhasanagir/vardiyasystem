export default {
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/__tests__/**/*.spec.ts'],
    testTimeout: 15000,
  },
};