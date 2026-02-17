import { z } from 'zod';
import { readFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { MutationTestResult } from 'mutation-testing-report-schema';
import { calculateMutationTestMetrics, type Metrics } from 'mutation-testing-metrics';
import { schema } from 'mutation-testing-report-schema';
import { Ajv, type ValidateFunction } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: false });
const validateReport: ValidateFunction<MutationTestResult> =
	ajv.compile<MutationTestResult>(schema);

// ✅ Runtime validator -> TypeScript type guard
function isMutationTestResult(data: unknown): data is MutationTestResult {
	return !!validateReport(data);
}

// Read and validate Stryker JSON report, return raw contents + metrics calculated by Stryker metrics API
export function registerStrykerReadJson(server: McpServer) {
	server.registerTool(
		'strykerReadJson',
		{
			inputSchema: {
				cwd: z.string().describe('Project directory'),
				path: z
					.string()
					.optional()
					.describe('Path to report JSON (defaults to reports/mutation/mutation.json)'),
			},
		},
		async ({ cwd, path }) => {
			try {
				const root = resolve(process.cwd(), cwd);
				const reportPath = resolve(
					root,
					path ?? join('reports', 'mutation', 'mutation.json'),
				);
				await access(reportPath);
				const raw = await readFile(reportPath, 'utf8');

				const parsed = JSON.parse(raw) as unknown;
				if (!isMutationTestResult(parsed)) {
					const errors =
						(validateReport.errors ?? [])
							.map((e) => `${e.instancePath} ${e.message}`)
							.join('\n') || 'Unknown schema validation error';
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

				const report = parsed as MutationTestResult;

				// Small metrics overview from Stryker API
				const metrics: Metrics =
					calculateMutationTestMetrics(report).systemUnderTestMetrics.metrics;

				return {
					content: [
						{ type: 'text', text: JSON.stringify({ reportPath, metrics }, null, 2) },
						{ type: 'text', text: raw },
					],
					isError: false,
				};
			} catch (e: unknown) {
				const msg = e instanceof Error ? e.message : String(e);
				const truncatedMsg = msg.length > 500 ? msg.slice(-500) : msg;
				return {
					content: [{ type: 'text', text: `Error: ${truncatedMsg}` }],
					isError: true,
				};
			}
		},
	);
}
