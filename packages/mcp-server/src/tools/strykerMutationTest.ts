import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import type { StrykerServer } from '../stryker/server/StrykerServer.js';
import { MutationTestParams, MutationTestResult } from 'mutation-server-protocol';
import { calculateMutationTestMetrics } from 'mutation-testing-metrics';
import type { MutationTestResult as ReportSchemaMutationTestResult } from 'mutation-testing-report-schema';
import { lastValueFrom } from 'rxjs';

export function registerStrykerMutationTest(mcpServer: McpServer, strykerServer: StrykerServer) {
	mcpServer.registerTool(
		'strykerMutationTest',
		{
			title: 'Stryker Mutation Test',
			description: 'Run mutation testing via Stryker and stream progress.',
			inputSchema: MutationTestParams.shape,
			outputSchema: MutationTestResult.shape,
		},
		(rawInput, extra) => strykerMutationTestHandler(rawInput, strykerServer, extra),
	);
}

async function strykerMutationTestHandler(
	args: MutationTestParams,
	strykerServer: StrykerServer,
	extra: RequestHandlerExtra<ServerRequest, ServerNotification>,
): Promise<CallToolResult> {
	if (!strykerServer.isInitialized()) {
		return {
			content: [
				{
					type: 'text',
					text: 'Stryker server is not initialized. Call strykerStart first.',
				},
			],
			isError: true,
		};
	}

	try {
		const progressToken = extra._meta?.progressToken;
		console.error(
			`[strykerMutationTest] Starting mutation test. ProgressToken: ${progressToken}, Args:`,
			JSON.stringify(args),
		);

		// Start the observable — this will emit both progress and final
		const observable = strykerServer.mutationTest(args);

		let progressEventCount = 0;

		// Build MutationTestResult (MSP format) incrementally as observables come in
		const mspResult: MutationTestResult = {
			files: {},
		};

		// Subscribe for progress updates
		const progressSub = observable.subscribe({
			next(progressNotification: MutationTestResult) {
				progressEventCount++;

				// Aggregate file results in MSP format
				if (progressNotification.files) {
					for (const [filePath, fileResult] of Object.entries(
						progressNotification.files,
					)) {
						if (!mspResult.files[filePath]) {
							mspResult.files[filePath] = { mutants: [] };
						}

						// Merge mutants arrays, avoiding duplicates by ID
						const existingIds = new Set(
							mspResult.files[filePath].mutants.map((m) => m.id),
						);
						for (const mutant of fileResult.mutants) {
							if (!existingIds.has(mutant.id)) {
								mspResult.files[filePath].mutants.push(mutant);
							}
						}
					}
				}

				if (progressToken !== undefined) {
					extra
						.sendNotification({
							method: 'notifications/progress',
							params: {
								progressToken,
								message: `Mutation testing event #${progressEventCount}`,
								progress: progressEventCount,
							},
						})
						.catch((err) => {
							console.error('[strykerMutationTest] sendNotification failed', err);
						});
				} else {
					console.error(
						'[strykerMutationTest] No progressToken - skipping MCP notification',
					);
				}
			},
			complete() {
				console.error('[strykerMutationTest] observable complete');
			},
		});

		// Await completion of observable
		await lastValueFrom(observable);

		progressSub.unsubscribe();

		// Convert to report schema format for metrics calculation
		const reportSchemaResult: ReportSchemaMutationTestResult = {
			schemaVersion: '1',
			thresholds: {
				high: 80,
				low: 60,
			},
			files: Object.fromEntries(
				Object.entries(mspResult.files).map(([filePath, fileResult]) => [
					filePath,
					{
						language:
							filePath.endsWith('.ts') || filePath.endsWith('.tsx')
								? 'typescript'
								: 'javascript',
						mutants: fileResult.mutants,
						source: '', // Source not needed for metrics calculation
					},
				]),
			),
		};

		// Calculate metrics from the report schema result
		const metrics =
			calculateMutationTestMetrics(reportSchemaResult).systemUnderTestMetrics.metrics;

		// Return metrics as text and MSP result as structured content
		return {
			content: [
				{
					type: 'text',
					text: JSON.stringify(metrics, null, 2),
				},
			],
			structuredContent: mspResult,
		};
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			content: [
				{
					type: 'text',
					text: `Error running mutation test: ${msg}`,
				},
			],
			isError: true,
		};
	}
}
