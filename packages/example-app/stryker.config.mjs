/** @type {import('@stryker-mutator/api/core').StrykerOptions} */
export default {
  packageManager: 'npm',
  reporters: ['clear-text', 'progress', 'html'],
  testRunner: 'jest',
  coverageAnalysis: 'perTest',
  mutate: ['src/**/*.js'],
  testRunnerNodeArgs: ['--experimental-vm-modules'],
  jest: {
    // Use your jest.config.mjs
    configFile: 'jest.config.mjs',
    // Set to 'custom' to respect your config file; works well for small samples
    projectType: 'custom'
  },
  thresholds: {
    high: 80,
    low: 60,
    break: 0
  }
};
