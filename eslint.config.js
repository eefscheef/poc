// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import eslintConfigPrettier from 'eslint-config-prettier';

export default [
	eslint.configs.recommended,
	...tseslint.configs.recommended,
	...tseslint.configs.stylistic,

	{
		ignores: ['node_modules/', 'packages/*/build/', 'reports/'],
	},
	eslintConfigPrettier,
];
