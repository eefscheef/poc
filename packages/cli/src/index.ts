#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';

import { generateTests } from './commands/generate.ts';

const program = new Command();

program
	.name('testinator')
	.description('Automated test generation using Stryker mutation testing and MCP agents')
	.version('1.1.0');

program
	.command('generate')
	.description('Generate tests for a JavaScript/TypeScript project')
	.option('-d, --dir <path>', 'Path to the project directory')
	.option('-m, --max-iterations <number>', 'Maximum mutation test iterations', '4')
	.option('-o, --output-dir <path>', 'Directory where the agent should write test files')
	.requiredOption('--provider <name>', 'LLM provider (openai | anthropic | google)')
	.requiredOption('--model <name>', 'LLM model name')
	.option('--dry-run', 'Print prompt and MCP config without running agent')
	.option('--json', 'Output machine-readable JSON')
	.option('--verbose', 'Enable verbose logging')
	.action(async (options) => {
		try {
			await generateTests(options);
		} catch (err) {
			console.error(chalk.red('Fatal error:'), err instanceof Error ? err.message : err);
			process.exit(1);
		}
	});

program.parseAsync(process.argv);
