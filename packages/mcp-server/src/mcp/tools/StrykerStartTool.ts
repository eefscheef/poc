import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';

type StartResult =
	| { status: 'started' }
	| { status: 'already_running' }
	| { status: 'error'; message: string };

export class StrykerStartTool {
	static inject = [tokens.mcpServer, tokens.strykerServer, tokens.logger] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly strykerServer: StrykerServer,
		private readonly logger: Logger,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerStart',
			{
				description:
					'Start the Stryker mutation server. Must be called before strykerMutationTest. ' +
					'Uses the project directory and config file provided at MCP server launch. Idempotent.',
			},
			() => this.handle(),
		);
	}

	private async handle(): Promise<CallToolResult> {
		try {
			if (this.strykerServer.isInitialized()) {
				return this.successResult({ status: 'already_running' });
			}

			await this.strykerServer.init();

			this.logger.info('Stryker server started successfully.');

			return this.successResult({ status: 'started' });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : String(err);
			this.logger.error(`Failed to start Stryker: ${message}`);
			return this.errorResult(message);
		}
	}

	private successResult(
		result: Exclude<StartResult, { status: 'error'; message: string }>,
	): CallToolResult {
		return {
			content: [{ type: 'text', text: result.status }],
			structuredContent: result,
		};
	}

	private errorResult(message: string): CallToolResult {
		const structuredContent: StartResult = { status: 'error', message };
		return {
			content: [{ type: 'text', text: `error: ${message}` }],
			structuredContent,
			isError: true,
		};
	}
}
