import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { DiscoverParams, DiscoverResult } from 'mutation-server-protocol';

import { StrykerServer } from '../../stryker/server/StrykerServer.js';
import { Logger } from '../../logging/Logger.js';
import { tokens } from '../../di/tokens.js';

export class StrykerDiscoverTool {
	static inject = [tokens.mcpServer, tokens.strykerServer, tokens.logger] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly strykerServer: StrykerServer,
		private readonly logger: Logger,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerDiscover',
			{
				inputSchema: DiscoverParams.shape,
				outputSchema: DiscoverResult.shape,
			},
			(rawInput) => this.handle(rawInput),
		);
	}

	private async handle(args: DiscoverParams): Promise<CallToolResult> {
		try {
			this.logger.info(`[strykerDiscover] Received request: ${JSON.stringify(args)}`);

			if (!this.strykerServer.isInitialized()) {
				return this.notInitializedResult();
			}

			this.logFileSelection(args);

			this.logger.info(
				`[strykerDiscover] Calling strykerServer.discover with params: ${JSON.stringify(args)}`,
			);

			const discovery = await this.strykerServer.discover(args);

			this.logger.info('[strykerDiscover] Discovery completed successfully');

			const summary = this.buildSummary(discovery);
			this.logger.info(
				`[strykerDiscover] ${summary.split('\n')[0]}`, // first line only
			);

			return {
				content: [{ type: 'text', text: summary }],
				structuredContent: discovery,
			};
		} catch (err) {
			return this.errorResult(err);
		}
	}

	private logFileSelection(args: DiscoverParams) {
		if (args.files?.length) {
			this.logger.info(
				`[strykerDiscover] Processing ${args.files.length} file path(s)/pattern(s)`,
			);
			for (const file of args.files) {
				this.logger.info(`[strykerDiscover] Path/pattern: "${file.path}"`);
			}
		} else {
			this.logger.info(
				'[strykerDiscover] No files specified, discovering all mutants in project',
			);
		}
	}

	private buildSummary(discovery: DiscoverResult): string {
		const fileEntries = Object.entries(discovery.files);
		const fileCount = fileEntries.length;

		let totalMutants = 0;
		const fileDetails: string[] = [];

		for (const [filePath, fileData] of fileEntries) {
			const mutantCount = fileData.mutants.length;
			totalMutants += mutantCount;
			fileDetails.push(`  ${filePath}: ${mutantCount} mutant(s)`);
		}

		return `Discovered ${totalMutants} mutant(s) in ${fileCount} file(s)\n\n${fileDetails.join('\n')}`;
	}

	private notInitializedResult(): CallToolResult {
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

	private errorResult(err: unknown): CallToolResult {
		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : undefined;

		this.logger.error(`[strykerDiscover] Error occurred: ${errorMsg}`);
		if (errorStack) {
			this.logger.error(`[strykerDiscover] Stack trace: ${errorStack}`);
		}

		// Keep response reasonably sized
		const truncatedMsg = errorMsg.length > 1200 ? errorMsg.slice(-1200) : errorMsg;

		return {
			content: [{ type: 'text', text: `Error discovering mutants: ${truncatedMsg.trim()}` }],
			isError: true,
		};
	}
}
