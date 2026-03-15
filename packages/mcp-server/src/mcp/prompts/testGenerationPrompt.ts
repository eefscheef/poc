import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { tokens } from '../../di/tokens.ts';

/**
 * Recursively list a directory up to `maxDepth` levels, returning an
 * indented tree of .js files and subdirectory names relative to `baseDir`.
 */
async function listDir(
	dir: string,
	maxDepth: number,
	baseDir: string,
	indent = '    ',
): Promise<string> {
	const entries = await readdir(dir, { withFileTypes: true });
	const lines: string[] = [];
	for (const entry of entries) {
		const rel = path.relative(baseDir, path.join(dir, entry.name)).replaceAll('\\', '/');
		if (entry.isDirectory()) {
			lines.push(`${indent}${rel}/`);
			if (maxDepth > 1) {
				lines.push(
					await listDir(path.join(dir, entry.name), maxDepth - 1, baseDir, indent + '  '),
				);
			}
		} else if (entry.name.endsWith('.js')) {
			lines.push(`${indent}${rel}`);
		}
	}
	return lines.filter(Boolean).join('\n');
}

// Zod schema for the prompt arguments
const iterativeTestArgsSchema = z.object({
	projectDirectory: z.string().describe('Path to the project root'),
	maxIterations: z.coerce // Use coerce to automatically convert strings to numbers. Necessary because inspector UI turns everything into strings
		.number()
		.int()
		.positive()
		.optional()
		.default(4)
		.describe('Maximum number of mutation test iterations'),
	outputDir: z
		.string()
		.optional()
		.describe(
			'Directory where the agent should write test files. If omitted, tests are co-located with source files.',
		),
});

registerTestGenerationPrompt.inject = [tokens.mcpServer, tokens.projectDir] as const;

export function registerTestGenerationPrompt(mcpServer: McpServer, projectDir: string) {
	mcpServer.registerPrompt(
		'strykerPrompt',
		{
			title: 'Iterative Unit Test Generation for JavaScript/TypeScript Projects with Stryker',
			description:
				'Generate and improve tests with Stryker. Start the mutation server, create tests, ' +
				'run mutation analysis, and iteratively improve until convergence or a maximum number of iterations.',
			argsSchema: iterativeTestArgsSchema.shape,
		},
		// The callback builds the messages that clients will retrieve
		async ({ projectDirectory, maxIterations, outputDir }) => {
			const outputDirLine = outputDir
				? `OUTPUT_DIR=${outputDir}`
				: 'OUTPUT_DIR=stryker-tests/';

			const outputDirRules = outputDir
				? `\n\t- Write ALL new test files into ${outputDir}. Do NOT place tests elsewhere.`
				: '';

			// Dynamically resolve the correct import path so the agent doesn't have to guess
			let importHint = '';
			let hasResolvedImportHint = false;
			try {
				const pkgPath = path.join(projectDir, 'package.json');
				const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
				const mainEntry =
					pkg.main ?? pkg.exports?.['.']?.default ?? pkg.exports?.['.'] ?? null;
				if (mainEntry) {
					hasResolvedImportHint = true;
					const entryDir = path.dirname(path.resolve(projectDir, mainEntry));

					// List the directory tree (2 levels deep) around the entry point
					const listing = await listDir(entryDir, 2, projectDir);

					if (outputDir) {
						const absEntry = path.resolve(projectDir, mainEntry);
						const relPath = path.relative(outputDir, absEntry).replaceAll('\\', '/');
						const relDir = path.relative(outputDir, entryDir).replaceAll('\\', '/');
						importHint =
							`\n- IMPORT PATHS (pre-computed): The project entry point is \`${mainEntry}\`. ` +
							`From OUTPUT_DIR the correct require path is: require("${relPath}"). ` +
							`The entry point directory relative to OUTPUT_DIR is "${relDir}". ` +
							`To import submodules, use require("${relDir}/<subpath>"). ` +
							`Do NOT add or remove path segments. Do NOT guess paths.\n` +
							`  Available modules in the entry point directory:\n${listing}`;
					} else {
						importHint =
							`\n- IMPORT PATHS: The project entry point is \`${mainEntry}\`. ` +
							`Compute the correct relative require() path from your test file location to \`${mainEntry}\` in the project root. ` +
							`To import submodules, use the same base path.\n` +
							`  Available modules relative to project root:\n${listing}`;
					}
				}
			} catch {
				// package.json unreadable — the agent will have to discover paths itself
			}

			const importFallbackHint = hasResolvedImportHint
				? ''
				: `
	  IMPORT PATHS (resolution fallback): pre-computed import paths were not available.
	  Before writing any test file:
	  1. Explore the file structure to find the correct import target (source/dist entry).
	  2. List the directory structure to understand where source/dist files live relative to OUTPUT_DIR.
	  3. Compute the correct relative path from the test file location to the module entry point or individual source files.
	  4. If existing test files exist in the project, read one to see what import pattern the project uses. Prefer the same pattern.
	  5. Verify: after writing the first test file, if strykerMutationTest reports "Cannot find module" errors, read the error, list the directory, and fix the path immediately before continuing.`;

			const messages: PromptMessage[] = [
				{
					role: 'user',
					content: {
						type: 'text',
						text: `Goal:
	- Generate/repair JS/TS unit tests to improve Stryker mutation score.
	- Context: DIR=${projectDirectory}; MAX_ITERS=${maxIterations}; ${outputDirLine}

	Hard constraints:
	- No third-party assertion/mocking libs - Node built-ins only.
	- Use Mocha with Node built-ins only (node:*, assert).
	- Every returned mutant MUST be investigated and explicitly addressed.
	- For each mutant, either:
		(a) add/repair tests to kill it, or
		(b) justify why it cannot reasonably be killed (e.g. equivalent mutant).
	- Ignore any pre-existing test files in the project. Write all tests from scratch.${outputDirRules}
	
	- IMPORT PATHS: Do NOT guess import paths.${importHint}${importFallbackHint}
	- This is a FULLY AUTOMATED run. There is NO human available to respond. NEVER ask the user or anyone else to install packages, change configuration, or take any action. If you cannot proceed, write the final report immediately and stop.

	Tools:
	- strykerMutationTest
	- Filesystem MCP tools available in this run:
	  - read_text_file (preferred) / read_file
	  - read_multiple_files
	  - list_directory
	  - search_files
	  - list_allowed_directories
	  - write_file
	  - edit_file
	  - create_directory

	Stryker info:
	- All mutants returned by strykerMutationTest are undetected (Stryker: Survived + NoCoverage).
			

	Workflow:
	1. Explore DIR: check package.json for main/exports; if none is usable, inspect the file structure to identify the correct module entry point(s). Determine the correct relative import path from OUTPUT_DIR to the source/dist files. Then write an initial test suite covering observable behavior in OUTPUT_DIR using the discovered import paths.
	2. Baseline: R = strykerMutationTest().
	3. Loop while iteration <= MAX_ITERS:
		- For each mutant in R, design focused tests targeting the mutation (edge cases, boundary conditions, mutation-specific assertions).
		- Apply test changes.
		- R = strykerMutationTest(survivors).
		- Stop early if:
			(a) no new mutants are killed in an iteration, 
			(b) mutation score gain is below threshold (default 5%),
			(c) undetected-mutant count drops by less than 5%.

	Final report:
	- Final mutation score.
	- Number of iterations.
	- Summary of key test changes.
	- For every remaining mutant: explanation why it remains undetected.
	`,
					},
				},
			];
			return { messages };
		},
	);
}
