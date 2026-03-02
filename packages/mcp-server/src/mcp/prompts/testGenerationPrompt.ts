import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { tokens } from '../../di/tokens.ts';

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

registerTestGenerationPrompt.inject = [tokens.mcpServer] as const;

export function registerTestGenerationPrompt(mcpServer: McpServer) {
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
				: 'OUTPUT_DIR=<co-located with source files>';

			const outputDirRules = outputDir
				? `\n- Write ALL new test files into OUTPUT_DIR (${outputDir}). Do NOT place tests elsewhere.`
				: '';

			const messages: PromptMessage[] = [
				{
					role: 'user',
					content: {
						type: 'text',
						text: `You generate/repair JS/TS unit tests to improve Stryker mutation score.

DIR=${projectDirectory}; MAX_ITERS=${maxIterations}; ${outputDirLine}

Tools: strykerStart, strykerMutationTest.

Rules:
- All mutants returned by strykerMutationTest are undetected (Stryker: Survived + NoCoverage).
- Every returned mutant MUST be investigated and explicitly addressed.
- For each mutant, either:
  (a) add/repair tests to kill it, or
  (b) justify why it cannot reasonably be killed (e.g. equivalent mutant).
- Do NOT ignore any returned mutant.
- Ignore any pre-existing test files in the project. Write all tests from scratch.${outputDirRules}
- Timeouts count as detected; runtime/compile errors are not scored.
- Stop early if mutation score gain <5% vs previous run.

Workflow:
1) Read the source files in DIR. Write an initial test suite covering observable behavior.
2) Call strykerStart to start the mutation server.
3) Baseline: R = strykerMutationTest().
4) Loop ≤ MAX_ITERS:
   - For each mutant in R, design focused tests targeting the mutation (edge cases, boundary conditions, mutation-specific assertions).
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
