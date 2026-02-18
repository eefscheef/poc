import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { z } from 'zod';

/**
 * Zod schema for Stryker server startup.
 */
const ZStartStrykerInput = z.object({
	cwd: z.string(),
	configFilePath: z.string(),
});
export type StartStrykerInput = z.infer<typeof ZStartStrykerInput>;

/**
 * Register the tool to start Stryker server from a given directory.
 */
export function registerStrykerStart(mcpServer: McpServer, strykerServer: StrykerServer) {
	mcpServer.registerTool(
		'strykerStart',
		{
			inputSchema: ZStartStrykerInput.shape,
		},
		async (input: StartStrykerInput): Promise<CallToolResult> => {
			try {
				if (strykerServer.isInitialized()) {
					return {
						content: [{ type: 'text', text: 'Stryker server is already running.' }],
					};
				}

				// Update config before init
				strykerServer.updateConfig({
					path: 'npx',
					args: ['stryker', 'serve', 'stdio'],
					cwd: input.cwd,
					configFilePath: input.configFilePath,
				});

				await strykerServer.init();
				return {
					content: [
						{
							type: 'text',
							text: `Stryker server started in ${input.cwd} using config at ${input.configFilePath}.`,
						},
					],
				};
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : String(err);
				return {
					content: [{ type: 'text', text: `Failed to start Stryker server: ${msg}` }],
					isError: true,
				};
			}
		},
	);
}
