import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { StrykerServer } from '../stryker/server/StrykerServer.ts';
import { ConfigureParams, ConfigureResult } from 'mutation-server-protocol';

export function registerStrykerConfigure(mcpServer: McpServer, strykerServer: StrykerServer) {
	mcpServer.registerTool(
		'strykerConfigure',
		{
			title: '(re)configure Stryker',
			// description:
			// 	'Configures the Stryker mutation server using the Mutation Server Protocol (MSP). ' +
			// 	'Use this to (re)configure the server with a specific config file.',
			inputSchema: ConfigureParams.shape,
			outputSchema: ConfigureResult.shape,
		},
		(rawInput) => strykerConfigureHandler(rawInput, strykerServer),
	);
}

async function strykerConfigureHandler(
	args: ConfigureParams,
	strykerServer: StrykerServer,
): Promise<CallToolResult> {
	try {
		console.error(`[strykerConfigure] Received request with input: ${JSON.stringify(args)}`);

		if (!strykerServer.isInitialized()) {
			return {
				content: [
					{
						type: 'text',
						text: "Server hasn't started. Call strykerStart first.",
					},
				],
				isError: true,
			};
		}

		console.error(
			`[strykerConfigure] Calling strykerServer.configure with params: ${JSON.stringify(args)}`,
		);
		const result: ConfigureResult = await strykerServer.configure(args);
		console.error(
			`[strykerConfigure] Configure completed successfully. Server MSP version: ${result.version}`,
		);

		const text = [
			'Stryker server successfully configured.',
			'',
			`Mutation Server Protocol version: ${result.version}`,
		].join('\n');

		return {
			content: [{ type: 'text', text }],
			structuredContent: result,
		};
	} catch (err: unknown) {
		console.error(`[strykerConfigure] Error occurred: ${err}`);
		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : undefined;

		if (errorStack) {
			console.error(`[strykerConfigure] Stack trace: ${errorStack}`);
		}

		const truncatedMsg = errorMsg.length > 1200 ? errorMsg.slice(0, 1200) + '...' : errorMsg;
		return {
			content: [
				{
					type: 'text',
					text: `Error configuring Stryker server: ${truncatedMsg.trim()}`,
				},
			],
			isError: true,
		};
	}
}
