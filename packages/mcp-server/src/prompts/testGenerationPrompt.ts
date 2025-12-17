import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { PromptMessage } from "@modelcontextprotocol/sdk/types.js";


// Zod schema for the prompt arguments
const iterativeTestArgsSchema = z.object({
  projectDirectory: z.string().describe("Path to the project root"),
  maxIterations: z.coerce // Use coerce to automatically convert strings to numbers. Necessary because inspector UI turns everything into strings
    .number()
    .int()
    .positive()
    .optional()
    .default(4)
    .describe("Maximum number of mutation test iterations"),
});

export function registerTestGenerationPrompt(
  mcpServer: McpServer
) {
  mcpServer.registerPrompt(
    "strykerPrompt", 
    {title: "Iterative Unit Test Generation for JavaScript/TypeScript Projects with Stryker",
    description:
      "Generate and improve tests with Stryker. Start the mutation server, create tests, " +
      "run mutation analysis, and iteratively improve until convergence or a maximum number of iterations.",
    argsSchema: iterativeTestArgsSchema.shape
    },
    // The callback builds the messages that clients will retrieve
    async ({ projectDirectory, maxIterations }) => {
      const messages: PromptMessage[] = [
        {
          role: "user",
          content: {
            type: "text",
            text: `You are an expert test generator tasked with creating and iteratively improving unit tests for a JavaScript/TypeScript project using Stryker mutation testing.

**Project Directory**: ${projectDirectory}
**Maximum Iterations**: ${maxIterations}

**Your Workflow**:

1. **Check Stryker Server Status**
   - First, check if the Stryker mutation server is already running
   - If NOT already started, use the \`strykerStart\` tool to initialize it with:
     - cwd: ${projectDirectory}
     - configFilePath: (path to stryker.config.mjs in the project directory)
   - If already started, skip this step and proceed to discovery

2. **Discover Mutants**
   - Use the \`strykerDiscover\` tool to find all potential mutations in the source code
   - Analyze the discovered mutants to understand what code needs test coverage

3. **Generate/Improve Tests**
   - Create or enhance test files to kill the surviving mutants
   - Focus on edge cases, boundary conditions, and mutation-specific scenarios
   - Ensure tests are specific and meaningful, not just increasing coverage

4. **Run Mutation Testing**
   - Use the \`strykerMutationTest\` tool with the discovered mutants
   - Pass the mutants from the discover step to the mutation test
   - Analyze the results to identify surviving mutants

5. **Iterate**
   - Review which mutants survived and why
   - Improve tests to kill surviving mutants
   - Repeat steps 2-4 up to ${maxIterations} times or until mutation score converges (improvement < 5%)

6. **Final Report**
   - Provide a summary of:
     - Final mutation score
     - Number of iterations performed
     - Key improvements made
     - Any remaining surviving mutants and why they might be acceptable

**Important Notes**:
- Do NOT restart the Stryker server if it's already running
- Each iteration should show measurable improvement in mutation score
- Stop early if mutation score stops improving significantly
- Focus on quality tests that catch real bugs, not just satisfying mutation coverage`,
          },
        },
      ];
      return { messages };
    }
  )
}


