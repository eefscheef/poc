import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type {
	CallToolResult,
	ServerNotification,
	ServerRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js';
import { MutantResult, MutationTestParams, MutationTestResult } from 'mutation-server-protocol';
import type { MutationTestResult as ReportSchemaMutationTestResult } from 'mutation-testing-report-schema';
import { calculateMutationTestMetrics } from 'mutation-testing-metrics';
import type { StrykerServer } from '../../stryker/server/StrykerServer.ts';
import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';

type Extra = RequestHandlerExtra<ServerRequest, ServerNotification>;

registerStrykerMutationTest.inject = [
	tokens.mcpServer,
	tokens.strykerServer,
	tokens.logger,
] as const;

export function registerStrykerMutationTest(
	mcpServer: McpServer,
	strykerServer: StrykerServer,
	logger: Logger,
) {
	mcpServer.registerTool(
		'strykerMutationTest',
		{
			inputSchema: MutationTestParams.shape,
			outputSchema: MutationTestResult.shape,
		},
		(rawInput, extra) => strykerMutationTestHandler(rawInput, strykerServer, logger, extra),
	);
}

async function strykerMutationTestHandler(
	args: MutationTestParams,
	strykerServer: StrykerServer,
	logger: Logger,
	extra: Extra,
): Promise<CallToolResult> {
	if (!strykerServer.isInitialized()) return notInitializedResult();

	const progressToken = extra._meta?.progressToken;
	logStart(logger, progressToken, args);

	try {
		const observable = strykerServer.mutationTest(args);

		const mspResult = await collectMspResultWithProgress(
			observable,
			logger,
			progressToken,
			extra,
		);

		const metrics = calculateMetrics(mspResult);
		const filteredResult = filterUndetectedMutants(mspResult);

		return successResult(metrics, filteredResult);
	} catch (err) {
		logger.error(
			`Error running mutation test: ${err instanceof Error ? err.message : String(err)}`,
		);
		return errorResult(err);
	}
}

/** ---------- Logging / progress ---------- */

function logStart(logger: Logger, progressToken: unknown, args: MutationTestParams) {
	logger.info(
		`Starting mutation test. ProgressToken: ${String(progressToken)}, Args: ${JSON.stringify(args)}`,
	);
}

async function notifyProgress(
	extra: Extra,
	logger: Logger,
	progressToken: unknown,
	progressEventCount: number,
) {
	if (!(typeof progressToken === 'string' || typeof progressToken === 'number')) {
		logger.info('No valid progressToken - skipping MCP progress notification');
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
		logger.error(
			`sendNotification failed: ${err instanceof Error ? err.message : String(err)}`,
		);
	}
}

/** ---------- Observable collection / merging ---------- */

async function collectMspResultWithProgress(
	observable: ReturnType<StrykerServer['mutationTest']>,
	logger: Logger,
	progressToken: unknown,
	extra: Extra,
): Promise<MutationTestResult> {
	let progressEventCount = 0;
	const mspResult: MutationTestResult = { files: {} };

	await new Promise<void>((resolve, reject) => {
		const sub = observable.subscribe({
			next(progress) {
				progressEventCount++;
				mergeProgressIntoResult(mspResult, progress);
				void notifyProgress(extra, logger, progressToken, progressEventCount);
			},
			error(err) {
				sub.unsubscribe();
				reject(err);
			},
			complete() {
				sub.unsubscribe();
				logger.info(`Mutation test observable complete. Events: ${progressEventCount}`);
				resolve();
			},
		});
	});

	return mspResult;
}

// Assumes Stryker Server emits unique mutants per progress update.
// If this is wrong (e.g., same id updated later), switch to overwrite-by-id merge logic.
function mergeProgressIntoResult(
	aggregateResult: MutationTestResult,
	progress: MutationTestResult,
) {
	if (!progress.files) return;

	for (const [filePath, { mutants }] of Object.entries(progress.files)) {
		(aggregateResult.files[filePath] ??= { mutants: [] }).mutants.push(...mutants);
	}
}

/** ---------- Metrics ---------- */

function inferLanguage(filePath: string): 'typescript' | 'javascript' {
	return filePath.endsWith('.ts') || filePath.endsWith('.tsx') ? 'typescript' : 'javascript';
}

function calculateMetrics(mspResult: MutationTestResult) {
	const reportSchemaResult: ReportSchemaMutationTestResult = {
		schemaVersion: '1',
		thresholds: { high: 80, low: 60 },
		files: Object.fromEntries(
			Object.entries(mspResult.files).map(([filePath, fileResult]) => [
				filePath,
				{
					language: inferLanguage(filePath),
					mutants: fileResult.mutants,
					source: '',
				},
			]),
		),
	};

	return calculateMutationTestMetrics(reportSchemaResult).systemUnderTestMetrics.metrics;
}

/** ---------- Filtering ---------- */

function filterUndetectedMutants(mspResult: MutationTestResult): MutationTestResult {
	const isUndetected = (m: MutantResult) => m.status === 'Survived' || m.status === 'NoCoverage';

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

/** ---------- Results ---------- */

function notInitializedResult(): CallToolResult {
	return {
		content: [
			{ type: 'text', text: 'Stryker server is not initialized. Call strykerStart first.' },
		],
		isError: true,
	};
}

function successResult(metrics: unknown, filtered: MutationTestResult): CallToolResult {
	return {
		content: [{ type: 'text', text: JSON.stringify(metrics, null, 2) }],
		structuredContent: filtered,
	};
}

function errorResult(err: unknown): CallToolResult {
	const msg = err instanceof Error ? err.message : String(err);
	return {
		content: [{ type: 'text', text: `Error running mutation test: ${msg}` }],
		isError: true,
	};
}
