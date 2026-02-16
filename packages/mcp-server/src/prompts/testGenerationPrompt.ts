import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { PromptMessage } from '@modelcontextprotocol/sdk/types.js';

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
});

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
		async ({ projectDirectory, maxIterations }) => {
			const messages: PromptMessage[] = [
				{
					role: 'user',
					content: {
						type: 'text',
						text: `You generate/repair JS/TS unit tests to improve Stryker mutation score.

DIR=${projectDirectory}; MAX_ITERS=${maxIterations}

Tools: strykerStart({cwd, configFilePath}), strykerDiscover, strykerMutationTest.

Rules:
- Start Stryker server only if not already running; never restart a running server.
- Read DIR/stryker.config.mjs to choose the project's test runner; if no tests exist, use Mocha.
- Target undetected mutants (Stryker: Survived + NoCoverage). Timeouts count as detected; runtime/compile errors are not scored.
- Stop early if mutation score gain <5% vs previous run.

Workflow:
1) Ensure server running (only if needed): strykerStart(cwd=DIR, configFilePath=DIR/stryker.config.mjs).
2) Mutants: M = strykerDiscover().
3) Baseline: R = strykerMutationTest(M).
4) Loop ≤ MAX_ITERS:
   - Add focused tests to kill undetected mutants in R (edge cases, boundary conditions, mutation-specific assertions).
   - R = strykerMutationTest(remaining-undetected-mutants if supported; else M).
   - Stop if no undetected mutants remain or gain <5%.

Final report: final score, iterations, key test changes, remaining undetected mutants + rationale.
`,
					},
				},
			];
			return { messages };
		},
	);
}
