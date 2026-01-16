// @ts-check
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
	packageManager: 'npm',
	reporters: ['json', 'progress'],
	testRunner: 'command',
	coverageAnalysis: 'off', // faster for now

	// Very permissive pattern - allows discovery of any files
	// Actual file selection is done per-request via DiscoverParams, MutationTestParams
	mutate: [
		'**/*.js',
		'**/*.ts',
		'!node_modules/**',
		'!**/node_modules/**',
		'!build/**',
		'!dist/**',
		'!**/*.test.js',
		'!**/*.test.ts',
		'!**/*.spec.js',
		'!**/*.spec.ts',
	],

	// Use a simple command test runner since we're primarily interested in discovery
	// This can be customized to run actual tests if needed
	commandRunner: {
		command: 'npm test',
	},

	timeoutMS: 10000,
	timeoutFactor: 1.5,

	concurrency: 2,

	thresholds: {
		high: 80,
		low: 60,
		break: 0, // Don't break on low scores, just report
	},

	// Incremental mode will be useful for our test iteration
	incremental: true,
	incrementalFile: '.stryker-tmp/incremental.json',
};
