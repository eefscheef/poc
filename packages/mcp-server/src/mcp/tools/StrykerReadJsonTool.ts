import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MutationTestResult } from 'mutation-testing-report-schema';
import { calculateMutationTestMetrics, type Metrics } from 'mutation-testing-metrics';
import { schema } from 'mutation-testing-report-schema';
import { Ajv, type ValidateFunction } from 'ajv';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { z } from 'zod';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateReport: ValidateFunction<MutationTestResult> =
	ajv.compile<MutationTestResult>(schema);

const ZStrykerReadJsonInput = z.object({
	cwd: z.string().describe('Project directory'),
	path: z
		.string()
		.optional()
		.describe('Path to report JSON (defaults to reports/mutation/mutation.json)'),
});

type StrykerReadJsonInput = z.infer<typeof ZStrykerReadJsonInput>;

function isMutationTestResult(data: unknown): data is MutationTestResult {
	return !!validateReport(data);
}

export class StrykerReadJsonTool {
	static inject = [tokens.mcpServer, tokens.logger] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly logger: Logger,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerReadJson',
			{
				inputSchema: ZStrykerReadJsonInput.shape,
			},
			(input: StrykerReadJsonInput) => this.handle(input),
		);
	}

	private async handle({ cwd, path }: StrykerReadJsonInput): Promise<CallToolResult> {
		try {
			const root = resolve(process.cwd(), cwd);
			const reportPath = resolve(root, path ?? join('reports', 'mutation', 'mutation.json'));

			await access(reportPath);
			const raw = await readFile(reportPath, 'utf8');
			const parsed = JSON.parse(raw) as unknown;

			if (!isMutationTestResult(parsed)) {
				return this.schemaErrorResult();
			}

			const report = parsed as MutationTestResult;
			const metrics: Metrics =
				calculateMutationTestMetrics(report).systemUnderTestMetrics.metrics;

			this.logger.info(`Read mutation report from ${reportPath}`);

			return {
				content: [
					{ type: 'text', text: JSON.stringify({ reportPath, metrics }, null, 2) },
					{ type: 'text', text: raw },
				],
			};
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : String(e);
			const truncatedMsg = msg.length > 500 ? msg.slice(-500) : msg;
			this.logger.error(`Failed to read mutation report: ${truncatedMsg}`);
			return {
				content: [{ type: 'text', text: `Error: ${truncatedMsg}` }],
				isError: true,
			};
		}
	}

	private schemaErrorResult(): CallToolResult {
		const errors =
			(validateReport.errors ?? []).map((e) => `${e.instancePath} ${e.message}`).join('\n') ||
			'Unknown schema validation error';

		return {
			content: [
				{
					type: 'text',
					text: `Error: The report does not match the schema.\n${errors.slice(0, 5000)}`,
				},
			],
			isError: true,
		};
	}
}
