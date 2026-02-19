import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { MutantResult, MutationTestParams, MutationTestResult } from 'mutation-server-protocol';
import type { MutationTestResult as ReportSchemaMutationTestResult } from 'mutation-testing-report-schema';
import { calculateMutationTestMetrics, Metrics } from 'mutation-testing-metrics';
import type { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

/**
 * Cherry-picked set of mutation testing metrics. We emit only the most relevant
 * metrics to save tokens.
 */
type AgentMutationMetrics = Pick<
	Metrics,
	| 'mutationScore'
	| 'mutationScoreBasedOnCoveredCode'
	| 'survived'
	| 'noCoverage'
	| 'totalMutants'
	| 'totalCovered'
>;

export class StrykerMutationTestTool {
	static inject = [tokens.mcpServer, tokens.strykerServer, tokens.logger] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly strykerServer: StrykerServer,
		private readonly logger: Logger,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerMutationTest',
			{
				inputSchema: MutationTestParams.shape,
				outputSchema: MutationTestResult.shape,
			},
			(rawInput, extra) => this.handle(rawInput, extra),
		);
	}

	private async handle(args: MutationTestParams, extra: Extra): Promise<CallToolResult> {
		if (!this.strykerServer.isInitialized()) return this.notInitializedResult();

		const progressToken = extra._meta?.progressToken;
		this.logStart(progressToken, args);

		try {
			const observable = this.strykerServer.mutationTest(args);

			const mspResult = await this.collectMspResultWithProgress(
				observable,
				progressToken,
				extra,
			);

			const plaintextMetrics = this.formatMetricsPlainText(this.calculateMetrics(mspResult));
			const filteredResult = this.filterUndetectedMutants(mspResult);

			return this.successResult(plaintextMetrics, filteredResult);
		} catch (err) {
			return this.errorResult(err);
		}
	}

	/** ---------- Logging / progress ---------- */

	private logStart(progressToken: unknown, args: MutationTestParams) {
		this.logger.info(
			`Starting mutation test. ProgressToken: ${String(progressToken)}, Args: ${JSON.stringify(args)}`,
		);
	}

	private async notifyProgress(extra: Extra, progressToken: unknown, progressEventCount: number) {
		if (!(typeof progressToken === 'string' || typeof progressToken === 'number')) {
			this.logger.info('No valid progressToken - skipping MCP progress notification');
			return;
		}

		try {
			await extra.sendNotification({
				method: 'notifications/progress',
				params: {
					progressToken,
					message: `Mutation testing event #${progressEventCount}`,
					progress: progressEventCount,
				},
			});
		} catch (err) {
			this.logger.error(
				`sendNotification failed: ${err instanceof Error ? err.message : String(err)}`,
			);
		}
	}

	/** ---------- Observable collection / merging ---------- */

	private async collectMspResultWithProgress(
		observable: ReturnType<StrykerServer['mutationTest']>,
		progressToken: unknown,
		extra: Extra,
	): Promise<MutationTestResult> {
		let progressEventCount = 0;
		const mspResult: MutationTestResult = { files: {} };

		await new Promise<void>((resolve, reject) => {
			const sub = observable.subscribe({
				next: (progress) => {
					try {
						progressEventCount++;
						this.mergeProgressIntoResult(mspResult, progress);
						void this.notifyProgress(extra, progressToken, progressEventCount);
					} catch (e) {
						sub.unsubscribe();
						reject(e);
					}
				},
				error: (err) => {
					sub.unsubscribe();
					reject(err);
				},
				complete: () => {
					sub.unsubscribe();
					this.logger.info(
						`Mutation test observable complete. Events: ${progressEventCount}`,
					);
					resolve();
				},
			});
		});

		return mspResult;
	}

	// Assumes Stryker Server emits unique mutants per progress update.
	// If this is wrong (e.g., same id updated later), switch to overwrite-by-id merge logic.
	private mergeProgressIntoResult(
		aggregateResult: MutationTestResult,
		progress: MutationTestResult,
	) {
		if (!progress.files) return;

		for (const [filePath, { mutants }] of Object.entries(progress.files)) {
			(aggregateResult.files[filePath] ??= { mutants: [] }).mutants.push(...mutants);
		}
	}

	/** ---------- Metrics ---------- */

	private inferLanguage(filePath: string): 'typescript' | 'javascript' {
		return filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript';
	}

	private calculateMetrics(mspResult: MutationTestResult): AgentMutationMetrics {
		const reportSchemaResult: ReportSchemaMutationTestResult = {
			schemaVersion: '1',
			thresholds: { high: 80, low: 60 },
			files: Object.fromEntries(
				Object.entries(mspResult.files).map(([filePath, fileResult]) => [
					filePath,
					{
						language: this.inferLanguage(filePath),
						mutants: fileResult.mutants,
						source: '',
					},
				]),
			),
		};

		const fullMetrics =
			calculateMutationTestMetrics(reportSchemaResult).systemUnderTestMetrics.metrics;

		const agentMetrics: AgentMutationMetrics = {
			mutationScore: Number(fullMetrics.mutationScore.toFixed(2)),
			mutationScoreBasedOnCoveredCode: Number(
				fullMetrics.mutationScoreBasedOnCoveredCode.toFixed(2),
			),
			survived: fullMetrics.survived,
			noCoverage: fullMetrics.noCoverage,
			totalMutants: fullMetrics.totalMutants,
			totalCovered: fullMetrics.totalCovered,
		};

		return agentMetrics;
	}

	/** ---------- Filtering ---------- */

	private filterUndetectedMutants(mspResult: MutationTestResult): MutationTestResult {
		const isUndetected = (m: MutantResult) =>
			m.status === 'Survived' || m.status === 'NoCoverage';

		return {
			files: Object.entries(mspResult.files).reduce<MutationTestResult['files']>(
				(acc, [filePath, fileResult]) => {
					const undetected = fileResult.mutants.filter(isUndetected);
					if (undetected.length) acc[filePath] = { mutants: undetected };
					return acc;
				},
				{},
			),
		};
	}

	/** ---------- Formatting ---------- */

	private formatMetricsPlainText(m: AgentMutationMetrics): string {
		return [
			`Mutation score: ${m.mutationScore}%`,
			`Score (covered code): ${m.mutationScoreBasedOnCoveredCode}%`,
			`Survived: ${m.survived}`,
			`No coverage: ${m.noCoverage}`,
			`Total mutants: ${m.totalMutants}`,
			`Covered mutants: ${m.totalCovered}`,
		].join('\n');
	}

	/** ---------- Results ---------- */

	private notInitializedResult(): CallToolResult {
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

	private successResult(metrics: unknown, filtered: MutationTestResult): CallToolResult {
		return {
			content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }],
			structuredContent: filtered,
		};
	}

	private errorResult(err: unknown): CallToolResult {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			content: [{ type: 'text', text: `Error running mutation test: ${msg}` }],
			isError: true,
		};
	}
}
