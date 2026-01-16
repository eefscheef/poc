// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	packageManager: 'npm',
	testRunner: 'jest',
	mutate: ['src/**/*.js'], // mutate your source
	reporters: ['json'],
	coverageAnalysis: 'perTest',
	jsonReporter: { fileName: 'stryker-report.json' },
	jest: {
		configFile: 'jest.config.mjs', // your Jest config
		projectType: 'custom', // respects your Jest config
		enableFindRelatedTests: false, // run all tests for each mutant
		config: {
			testEnvironment: 'node',
		},
	},
	testRunnerNodeArgs: ['--experimental-vm-modules'],
	tempDirName: 'stryker-tmp', // avoid hidden temp dirs
};
