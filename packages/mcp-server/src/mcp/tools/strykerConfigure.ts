import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ConfigureParams, ConfigureResult } from 'mutation-server-protocol';

import type { StrykerServer } from '../../stryker/server/StrykerServer.js';
import { Logger } from '../../logging/Logger.js';
import { tokens } from '../../di/tokens.js';

export class StrykerConfigureTool {
	static inject = [tokens.mcpServer, tokens.strykerServer, tokens.logger] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly strykerServer: StrykerServer,
		private readonly logger: Logger,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerConfigure',
			{
				inputSchema: ConfigureParams.shape,
				outputSchema: ConfigureResult.shape,
			},
			(rawInput) => this.handle(rawInput),
		);
	}

	private async handle(args: ConfigureParams): Promise<CallToolResult> {
		try {
			this.logger.info(`[strykerConfigure] Received request: ${JSON.stringify(args)}`);

			if (!this.strykerServer.isInitialized()) {
				return this.notInitializedResult();
			}

			this.logger.info(
				`[strykerConfigure] Calling strykerServer.configure with params: ${JSON.stringify(args)}`,
			);

			// If configure is synchronous, await is harmless; if async, it works too.
			const result: ConfigureResult = await Promise.resolve(
				this.strykerServer.configure(args),
			);

			this.logger.info(
				`[strykerConfigure] Configure completed successfully. MSP version: ${result.version}`,
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
		} catch (err) {
			return this.errorResult(err);
		}
	}

	private notInitializedResult(): CallToolResult {
		return {
			content: [{ type: 'text', text: "Server hasn't started. Call strykerStart first." }],
			isError: true,
		};
	}

	private errorResult(err: unknown): CallToolResult {
		const errorMsg = err instanceof Error ? err.message : String(err);
		const errorStack = err instanceof Error ? err.stack : undefined;

		this.logger.error(`[strykerConfigure] Error occurred: ${errorMsg}`);
		if (errorStack) {
			this.logger.error(`[strykerConfigure] Stack trace: ${errorStack}`);
		}

		const truncatedMsg =
			errorMsg.length > 1200 ? `${errorMsg.slice(0, 1200).trim()}...` : errorMsg.trim();

		return {
			content: [{ type: 'text', text: `Error configuring Stryker server: ${truncatedMsg}` }],
			isError: true,
		};
	}
}
