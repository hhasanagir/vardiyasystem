export default {
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/__tests__/**/*.spec.ts'],
    testTimeout: 15000,
  },
};
