import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type {
	MutationTestParams,
	MutationTestResult,
	MutantResult,
} from 'mutation-server-protocol';
import type { MutationTestResult as ReportSchemaMutationTestResult } from 'mutation-testing-report-schema';
import { calculateMutationTestMetrics, type Metrics } from 'mutation-testing-metrics';

import type { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';
import type { MutantStore } from '../mutant-cache/MutantStore.ts';
import {
	MutationTestRequestSchema,
	type MutationTestRequest,
} from '../schemas/MutationTestSchema.ts';

import type { Extra } from '../util/mcpTypes.ts';
import { toMutationTestParams } from '../util/toMutationTestParams.ts';
import { SourceSnippetReader } from '../util/SourceSnippetReader.ts';

type AgentMutationMetrics = Pick<
	Metrics,
	| 'mutationScore'
	| 'mutationScoreBasedOnCoveredCode'
	| 'totalMutants'
	| 'totalDetected'
	| 'totalUndetected'
	| 'survived'
	| 'noCoverage'
>;

type UndetectedStatus = 'Survived' | 'NoCoverage';

export class StrykerMutationTestTool {
	private nextRunId = 0;

	static inject = [
		tokens.mcpServer,
		tokens.strykerServer,
		tokens.logger,
		tokens.mutantStore,
		tokens.projectDir,
	] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly strykerServer: StrykerServer,
		private readonly logger: Logger,
		private readonly mutantStore: MutantStore,
		private readonly projectDir: string,
	) {
		this.snippetReader = new SourceSnippetReader(this.projectDir, this.logger);
	}
	private readonly snippetReader: SourceSnippetReader;

	register() {
		this.mcpServer.registerTool(
			'strykerMutationTest',
			{
				description:
					'Runs Stryker mutation testing. Mode controls scope: ' +
					'all (default), files (requires files), ' +
					'survivors (requires runId, optional refs), mutants (requires runId and refs).',
				inputSchema: MutationTestRequestSchema,
			},
			(rawInput, extra) => this.handle(rawInput, extra).catch((err) => this.errorResult(err)),
		);
	}

	private async handle(rawInput: unknown, extra: Extra): Promise<CallToolResult> {
		await this.strykerServer.waitForInit();

		const parsed = MutationTestRequestSchema.safeParse(rawInput ?? { mode: 'all' });
		if (!parsed.success) {
			return {
				isError: true,
				content: [{ type: 'text', text: parsed.error.message }],
			};
		}

		const req: MutationTestRequest = parsed.data;

		let args: MutationTestParams;
		try {
			args = toMutationTestParams(req, this.mutantStore);
		} catch (err) {
			return {
				isError: true,
				content: [{ type: 'text', text: this.formatError(err) }],
			};
		}

		const progressToken = extra._meta?.progressToken;
		this.logStart(progressToken, args);

		try {
			const observable = this.strykerServer.mutationTest(args);
			const mspResult = await this.collectMspResultWithProgress(
				observable,
				progressToken,
				extra,
			);

			const runId = this.nextRunId++;

			// Store FULL result for later drill-down via strykerMutantDetails
			this.mutantStore.put(runId, mspResult);

			const metrics = this.calculateMetrics(mspResult);
			const text = await this.formatOverviewText(runId, metrics, mspResult);

			return {
				content: [{ type: 'text', text }],
			};
		} catch (err) {
			return this.errorResult(err);
		}
	}
	/** ---------- Text-first formatting ---------- */

	private async formatOverviewText(
		runId: number,
		metrics: AgentMutationMetrics,
		mspResult: MutationTestResult,
	): Promise<string> {
		const metricsText = this.formatMetricsPlainText(metrics);

		// Collect undetected mutants
		const undetected: {
			filePath: string;
			mutant: MutantResult;
			status: UndetectedStatus;
		}[] = [];

		for (const [filePath, fileResult] of Object.entries(mspResult.files ?? {})) {
			for (const mutant of fileResult.mutants ?? []) {
				if (mutant.status === 'Survived' || mutant.status === 'NoCoverage') {
					undetected.push({ filePath, mutant, status: mutant.status });
				}
			}
		}

		// NoCoverage first, then Survived
		undetected.sort((a, b) => {
			if (a.status === b.status) return 0;
			return a.status === 'NoCoverage' ? -1 : 1;
		});

		const maxMutantsShown = 20;

		const lines: string[] = [];
		lines.push(`RunId: ${runId}`);
		lines.push(metricsText);

		if (undetected.length === 0) {
			lines.push('No undetected mutants (no Survived / NoCoverage).');
			return lines.join('\n');
		}

		lines.push(`Undetected mutants: ${undetected.length}`);
		lines.push('');

		const shown = undetected.slice(0, maxMutantsShown);

		for (const { filePath, mutant, status } of shown) {
			lines.push(
				`- [${status}] ${filePath}:${mutant.location.start.line}:${mutant.location.start.column} ` +
					`(id=${mutant.id})`,
			);

			const diff = await this.snippetReader.readLineDiff(
				filePath,
				mutant.location,
				mutant.replacement,
			);
			lines.push(`  - ${diff?.original ?? '(unknown)'}`);
			lines.push(`  + ${diff?.mutated ?? '(unknown)'}`);

			lines.push('');
		}

		const remainingCount = undetected.length - shown.length;
		if (remainingCount > 0) {
			lines.push(`…and ${remainingCount} more undetected mutants not shown.`);
			lines.push('');
		}

		lines.push(
			`To drill down: call strykerMutantDetails with this runId and a list of { filePath, id }.`,
		);

		return lines.join('\n');
	}

	/** ---------- Logging / progress ---------- */

	private logStart(progressToken: unknown, args: MutationTestParams) {
		this.logger.info(
			`Starting mutation test. ProgressToken: ${String(progressToken)}, Args: ${JSON.stringify(args)}`,
		);
	}

	private async notifyProgress(extra: Extra, progressToken: unknown, progressEventCount: number) {
		if (!(typeof progressToken === 'string' || typeof progressToken === 'number')) return;
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
			this.logger.error(`sendNotification failed: ${this.formatError(err)}`);
		}
	}

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

		return {
			mutationScore: Number(fullMetrics.mutationScore.toFixed(2)),
			mutationScoreBasedOnCoveredCode: Number(
				fullMetrics.mutationScoreBasedOnCoveredCode.toFixed(2),
			),
			survived: fullMetrics.survived,
			noCoverage: fullMetrics.noCoverage,
			totalDetected: fullMetrics.totalDetected,
			totalUndetected: fullMetrics.totalUndetected,
			totalMutants: fullMetrics.totalMutants,
		};
	}

	private formatMetricsPlainText(m: AgentMutationMetrics): string {
		return [
			`Mutation score: ${m.mutationScore}%`,
			`Score (covered code): ${m.mutationScoreBasedOnCoveredCode}%`,
			`Total mutants: ${m.totalMutants}`,
		].join('\n');
	}

	/** ---------- Error formatting ---------- */

	/**
	 * Formats an error for consumption by the agent.
	 * Includes the message, cause chain, and the first few stack frames so the
	 * agent has actionable context without being overwhelmed by deep async stacks.
	 */
	private formatError(err: unknown): string {
		if (!(err instanceof Error)) return String(err);

		const parts: string[] = [];

		// Walk the cause chain
		let current: unknown = err;
		while (current instanceof Error) {
			const stackLines = (current.stack ?? '').split('\n');
			// First line of .stack is usually "ErrorType: message" — skip it and use
			// current.message directly so we don't duplicate the header.
			// Filter out library and runtime internals (node_modules + node:internal)
			// since they are usually not actionable for the agent.
			const frames = stackLines
				.slice(1)
				.filter(
					(l) =>
						l.trim().startsWith('at ') &&
						!l.includes('node_modules') &&
						!l.includes('node:internal'),
				);

			parts.push(current.message);
			if (frames.length > 0) {
				parts.push(frames.join('\n'));
			}

			current = current.cause;
			if (current instanceof Error) parts.push('Caused by:');
		}

		return parts.join('\n');
	}

	/** ---------- Results ---------- */

	private errorResult(err: unknown): CallToolResult {
		return {
			content: [{ type: 'text', text: this.formatError(err) }],
			isError: true,
		};
	}
}
