import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { MutationTestParams, MutationTestResult, MutantResult } from 'mutation-server-protocol';
import type { MutationTestResult as ReportSchemaMutationTestResult } from 'mutation-testing-report-schema';
import { calculateMutationTestMetrics, Metrics } from 'mutation-testing-metrics';

import type { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';
import type { MutantStore } from '../mutant-cache/MutantStore.ts';
import {
	MutationTestOverviewSchema,
	type MutationTestOverview,
} from '../schemas/MutationTestOverviewSchema.ts';
import { Extra } from './mcpTypes.ts';
import { SourceSnippet } from '../schemas/MutantDetailsSchema.ts';

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
	] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly strykerServer: StrykerServer,
		private readonly logger: Logger,
		private readonly mutantStore: MutantStore,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerMutationTest',
			{
				inputSchema: MutationTestParams.shape,
				outputSchema: MutationTestOverviewSchema,
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

			const runId = this.nextRunId++;

			// Store FULL result for later drill-down via strykerMutantDetails
			this.mutantStore.put(runId, mspResult);

			const metrics = this.calculateMetrics(mspResult);

			// Small overview in structured content
			const overview = this.buildOverview(runId, mspResult);

			// Text-first output (includes snippets by default, bounded)
			const text = await this.formatOverviewText(runId, metrics, mspResult);

			return {
				content: [{ type: 'text', text }],
				structuredContent: { overview },
				// structuredContent: {},
			};
		} catch (err) {
			return this.errorResult(err);
		}
	}
	/** ---------- Minimal structured content ---------- */

	private buildOverview(runId: number, mspResult: MutationTestResult): MutationTestOverview {
		const undetected: MutationTestOverview['undetected'] = [];

		for (const [filePath, fileResult] of Object.entries(mspResult.files ?? {})) {
			for (const m of fileResult.mutants ?? []) {
				if (m.status === 'Survived' || m.status === 'NoCoverage') {
					undetected.push({
						filePath,
						id: m.id,
						status: m.status,
					});
				}
			}
		}

		return { runId, undetected };
	}

	/** ---------- Text-first formatting (bounded) ---------- */

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

		const maxMutantsShown = 10;
		const snippetContextLines = 3;
		const maxTotalSnippetChars = 2000;

		let usedSnippetChars = 0;

		const lines: string[] = [];
		lines.push(metricsText);
		lines.push(`RunId: ${runId}`);
		lines.push('');

		if (undetected.length === 0) {
			lines.push('✅ No undetected mutants (no Survived / NoCoverage).');
			return lines.join('\n');
		}

		lines.push(`Undetected mutants: ${undetected.length}`);
		lines.push('');

		const shown = undetected.slice(0, maxMutantsShown);

		for (const { filePath, mutant, status } of shown) {
			lines.push(
				`- [${status}] ${filePath}:${mutant.location.start.line}:${mutant.location.start.column} ` +
					`(id=${mutant.id}, mutator=${mutant.mutatorName})`,
			);

			// Snippet enabled by default, but bounded
			if (usedSnippetChars < maxTotalSnippetChars) {
				const snippet = await this.readSnippetSafe(filePath, mutant, snippetContextLines);
				if (snippet) {
					const snippetText =
						`  Snippet (L${snippet.startLine}-L${snippet.endLine}):\n` +
						snippet.text
							.split('\n')
							.map((l) => `    ${l}`)
							.join('\n');

					const remaining = maxTotalSnippetChars - usedSnippetChars;
					const clipped =
						snippetText.length > remaining
							? snippetText.slice(0, remaining - 1) + '…'
							: snippetText;

					usedSnippetChars += clipped.length;
					lines.push(clipped);
				}
			}

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

	private async readSnippetSafe(
		filePath: string,
		mutant: MutantResult,
		contextLines: number,
	): Promise<SourceSnippet | undefined> {
		try {
			const text = await readFile(filePath, 'utf8');
			const lines = text.split(/\r?\n/);

			if (lines.length === 0) return undefined;

			const mutantStart = Math.max(1, mutant.location.start.line);
			const mutantEnd = Math.min(lines.length, mutant.location.end.line);

			const startLine = Math.max(1, mutantStart - contextLines);
			const endLine = Math.min(lines.length, mutantEnd + contextLines);

			if (startLine > endLine) {
				return { startLine, endLine, text: '[Invalid mutant location range]' };
			}

			const snippet = lines.slice(startLine - 1, endLine).join('\n');
			return { startLine, endLine, text: snippet };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Failed to read snippet for ${filePath}: ${msg}`);
			return undefined;
		}
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
			this.logger.error(
				`sendNotification failed: ${err instanceof Error ? err.message : String(err)}`,
			);
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
			`Survived: ${m.survived}`,
			`Detected mutants: ${m.totalDetected}`,
			`Undetected mutants: ${m.totalUndetected}`,
			`No coverage: ${m.noCoverage}`,
			`Total mutants: ${m.totalMutants}`,
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

	private errorResult(err: unknown): CallToolResult {
		const msg = err instanceof Error ? err.message : String(err);
		return {
			content: [{ type: 'text', text: `Error running mutation test: ${msg}` }],
			isError: true,
		};
	}
}
