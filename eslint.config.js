// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';
import jest from 'eslint-plugin-jest';

export default [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.stylistic,

	{
		ignores: ['node_modules/', 'packages/*/build/', 'reports/', 'packages/plural'],
	},
	{
		rules: {
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					varsIgnorePattern: '^_',
					argsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
				},
			],
		},
	},
	{
		files: ['**/*.test.js', '**/*.test.ts', '**/*.spec.js', '**/*.spec.ts'],
		languageOptions: {
			globals: {
				...jest.environments.globals.globals,
			},
		},
	},
	eslintConfigPrettier,
];
