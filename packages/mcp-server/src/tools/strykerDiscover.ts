import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { StrykerServer } from '../stryker/server/StrykerServer.ts';
import { DiscoverParams, DiscoverResult } from 'mutation-server-protocol';

export function registerStrykerDiscover(mcpServer: McpServer, strykerServer: StrykerServer) {
	mcpServer.registerTool(
		'strykerDiscover',
		{
			inputSchema: DiscoverParams.shape,
			outputSchema: DiscoverResult.shape,
		},
		(rawInput) => strykerDiscoverHandler(rawInput, strykerServer),
	);
}

async function strykerDiscoverHandler(
	args: DiscoverParams,
	strykerServer: StrykerServer,
): Promise<CallToolResult> {
	try {
		console.error(`[strykerDiscover] Received request with input: ${JSON.stringify(args)}`);
		if (!strykerServer.isInitialized()) {
			return {
				content: [
					{
						type: 'text',
						text: 'Stryker server has not started. Please call `strykerStart` first.',
					},
				],
				isError: true,
			};
		}
		if (args.files) {
			console.error(
				`[strykerDiscover] Processing ${args.files.length} file path(s)/pattern(s)`,
			);
			args.files.forEach((file) => {
				console.error(`[strykerDiscover] Path/pattern: "${file.path}"`);
			});
		} else {
			console.error(
				`[strykerDiscover] No files specified, discovering all mutants in project`,
			);
		}

		console.error(
			`[strykerDiscover] Calling strykerServer.discover with params: ${JSON.stringify(args)}`,
		);
		const discovery: DiscoverResult = await strykerServer.discover(args);
		console.error(`[strykerDiscover] Discovery completed successfully`);

		// Format the discovery result as readable text
		const fileCount = Object.keys(discovery.files).length;
		let totalMutants = 0;
		const fileDetails: string[] = [];

		for (const [filePath, fileData] of Object.entries(discovery.files)) {
			const mutantCount = fileData.mutants.length;
			totalMutants += mutantCount;
			fileDetails.push(`  ${filePath}: ${mutantCount} mutant(s)`);
		}

		console.error(`[strykerDiscover] Found ${totalMutants} mutant(s) in ${fileCount} file(s)`);

		const summary = `Discovered ${totalMutants} mutant(s) in ${fileCount} file(s)\n\n${fileDetails.join('\n')}`;

		return {
			content: [
				{
					type: 'text',
					text: summary,
				},
			],
			structuredContent: discovery,
		};
	} catch (err: Error | unknown) {
		console.error(`[strykerDiscover] Error occurred: ${err}`);

		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : undefined;

		if (errorStack) {
			console.error(`[strykerDiscover] Stack trace: ${errorStack}`);
		}

		const truncatedMsg = errorMsg.length > 1200 ? errorMsg.slice(-1200) : errorMsg;

		return {
			content: [
				{
					type: 'text',
					text: `Error discovering mutants: ${truncatedMsg.trim()}`,
				},
			],
			isError: true,
		};
	}
}
