import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import path from 'node:path';
import { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';

const ZStartStrykerInput = z
	.object({
		cwd: z.string().min(1),
		configFilePath: z.string().min(1),
	})
	.strict();

export type StartStrykerInput = z.infer<typeof ZStartStrykerInput>;

type StartResult =
	| { status: 'started'; cwd: string; configFilePath: string }
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
				description: 'Start Stryker mutation server (stdio) for a project. Idempotent.',
				inputSchema: ZStartStrykerInput.shape,
			},
			(input: StartStrykerInput) => this.handle(input),
		);
	}

	private async handle(input: StartStrykerInput): Promise<CallToolResult> {
		try {
			if (this.strykerServer.isInitialized()) {
				return this.successResult({ status: 'already_running' });
			}

			const cwd = path.resolve(input.cwd);
			const configFilePath = path.resolve(input.configFilePath);

			this.strykerServer.updateConfig({
				path: 'npx',
				args: ['stryker', 'serve', 'stdio'],
				projectDir: cwd,
				configFilePath,
			});

			await this.strykerServer.init();

			this.logger.info(`Stryker started. cwd=${cwd}, configFilePath=${configFilePath}`);

			return this.successResult({
				status: 'started',
				cwd,
				configFilePath,
			});
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
