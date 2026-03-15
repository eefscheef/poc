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
				? `\n- Write ALL new test files into ${outputDir}. Do NOT place tests elsewhere.`
				: '';

			// Dynamically resolve the correct import path so the agent doesn't have to guess
			let importHint = '';
			try {
				const pkgPath = path.join(projectDir, 'package.json');
				const pkg = JSON.parse(await readFile(pkgPath, 'utf-8'));
				const mainEntry =
					pkg.main ?? pkg.exports?.['.']?.default ?? pkg.exports?.['.'] ?? null;
				if (mainEntry) {
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

			const messages: PromptMessage[] = [
				{
					role: 'user',
					content: {
						type: 'text',
						text: `You generate/repair JS/TS unit tests to improve Stryker mutation score.

DIR=${projectDirectory}; MAX_ITERS=${maxIterations}; ${outputDirLine}

Tools:
- strykerMutationTest, strykerMutantDetails — run and inspect mutation tests.
- find_code, analyze_code_relationships — query the code graph (CodeGraphContext).
- read_file, write_file — read source files when needed and write test files.

Rules:
- Use ONLY Mocha & Node.js built-ins (assert, node:assert) for tests.
- Do NOT require/import chai, sinon, proxyquire, jest, vitest, or any other package. If you are unsure whether a package is installed, do not use it.
- NEVER use mocking libraries. Do the best you can with what you have: Mocha and Node.js built-ins. Prefer making real requests if necessary.
- All mutants returned by strykerMutationTest are undetected (Stryker: Survived + NoCoverage).
- Every returned mutant MUST be investigated and explicitly addressed.
- For each mutant, either:
  (a) add/repair tests to kill it, or
  (b) justify why it cannot reasonably be killed (e.g. equivalent mutant).
- Do NOT ignore any returned mutant.
- Ignore any pre-existing test files in the project. Write all tests from scratch.${outputDirRules}
- Timeouts count as detected; runtime/compile errors are not scored.
- Stop early if mutation score gain <5% vs previous run.
- Do NOT narrate waiting/progress chatter (for example "still running" or "I'll check again"). Use tools directly and only report meaningful state changes.
- IMPORT PATHS: Do NOT guess import paths.${importHint}
  If the pre-computed path is provided above, use it exactly. Otherwise, before writing any test file:
  1. Read the project's package.json to find the "main" or "exports" entry point.
  2. Use find_code to locate the relevant source modules and their exports.
  3. Compute the correct relative path from the test file location to the module entry point or individual source files.
  4. If existing test files exist in the project, read one to see what import pattern the project uses. Prefer the same pattern.
  5. Verify: after writing the first test file, if strykerMutationTest reports "Cannot find module" errors, read the error and fix the path immediately before continuing.
- This is a FULLY AUTOMATED run. There is NO human available to respond. NEVER ask the user or anyone else to install packages, change configuration, or take any action. If you cannot proceed, write the final report immediately and stop.

Workflow:
1) Index & explore:
	a) The code graph has already been primed before this workflow starts.
	b) Use find_code to discover the main exported functions and modules.
	c) Use analyze_code_relationships (find_callees, call_chain) to understand how functions relate.
	d) If graph results are sparse, fall back to targeted read_file calls for only the needed files.
	e) Determine the correct relative import path from OUTPUT_DIR to source files.
2) Write an initial test suite covering the discovered functions in OUTPUT_DIR.
3) Baseline: R = strykerMutationTest().
4) Loop ≤ MAX_ITERS:
   - For each mutant in R, use find_code or read_file to understand the mutated code, then design focused tests targeting the mutation (edge cases, boundary conditions, mutation-specific assertions).
   - Apply test changes.
   - R = strykerMutationTest(remaining-undetected-mutants if supported; else full run).
   - Stop if no mutants are returned or gain <5%.

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
