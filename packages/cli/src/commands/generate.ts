import { MCPAgent } from 'mcp-use';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { getProjectDirectory } from '../ui/requestProjectDir.ts';
import { createLLM, type ProviderName } from '../llm/providers.ts';
import { createMCPClient } from '../mcp/createClient.ts';
import { loadStrykerPrompt } from '../mcp/loadStrykerPrompt.ts';
import { createMCPConfig } from '../mcp/config.ts';
import { createCliContext } from '../context.ts';
import { MetricsCollector } from '../metrics/MetricsCollector.ts';
import { formatTraceText } from '../metrics/formatTrace.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GenerateOptions {
	dir?: string;
	maxIterations?: string;
	outputDir?: string;
	provider: ProviderName;
	model: string;
	dryRun?: boolean;
	json?: boolean;
	verbose?: boolean;
}

export async function generateTests(options: GenerateOptions) {
	const ctx = createCliContext(options);
	const { logger, spinner } = ctx;

	let agent: MCPAgent | undefined;
	let client: ReturnType<typeof createMCPClient> | undefined;

	try {
		const projectDirectory = await getProjectDirectory(options.dir);
		const maxIterations = Number.parseInt(options.maxIterations ?? '4', 10);

		const outputDir = options.outputDir;

		logger.info('Configuration resolved', {
			projectDirectory,
			maxIterations,
			outputDir,
			provider: options.provider,
			model: options.model,
			dryRun: options.dryRun,
		});

		spinner?.start('Initializing LLM...');
		const apiKey = process.env.LLM_API_KEY;
		if (!apiKey) {
			throw new Error('LLM_API_KEY environment variable must be set');
		}
		const llmConfig = {
			provider: options.provider,
			apiKey,
			model: options.model,
			baseUrl: options.provider === 'openai' ? process.env.OPENAI_BASE_URL : undefined,
		};
		const llm = createLLM(llmConfig);
		spinner?.succeed('LLM initialized');

		// From build/commands, go up to poc root: ../build ../cli ../packages ../poc
		const monorepoRoot = join(__dirname, '..', '..', '..', '..');
		const mcpConfig = createMCPConfig(projectDirectory, monorepoRoot);

		client = createMCPClient(mcpConfig, ctx);

		spinner?.start('Connecting MCP servers...');
		await client.createAllSessions();
		spinner?.succeed('MCP servers connected');

		spinner?.start('Priming code graph (CGC)...');
		try {
			await primeCodeGraph(client, projectDirectory, logger);
			spinner?.succeed('Code graph primed');
		} catch (err) {
			spinner?.warn('Code graph priming skipped');
			logger.debug('CGC priming error', serializeError(err));
		}

		spinner?.start('Loading prompt...');
		const prompt = await loadStrykerPrompt(client, projectDirectory, maxIterations, outputDir);
		spinner?.succeed('Prompt loaded');

		if (options.dryRun) {
			logger.info('Dry run output', {
				llmConfig,
				mcpConfig,
				prompt,
			});
			return;
		}

		// Disallow tools that waste tokens or are irrelevant for test generation.
		// Filesystem exploration tools are superseded by CGC graph queries.
		const disallowedTools = [
			// Filesystem - block exploration tools; keep read_file + write_file
			'execute_command',
			'list_directory',
			'list_directory_with_sizes',
			'search_files',
			'get_file_info',
			'move_file',
			'read_media_file',
			'directory_tree',
			// CGC - block mutative/admin/viz tools; keep find_code + analyze_code_relationships
			'watch_directory',
			'unwatch_directory',
			'list_watched_paths',
			'delete_repository',
			'execute_cypher_query',
			'visualize_graph_query',
			'load_bundle',
			'search_registry_bundles',
			'add_code_to_graph',
			'check_job_status',
			'add_package_to_graph',
			'list_jobs',
		];

		agent = new MCPAgent({
			llm,
			client,
			maxSteps: 1000,
			verbose: ctx.verbose,
			memoryEnabled: true,
			disallowedTools,
		});
		await agent.initialize();
		logger.info('Agent started');

		if (options.provider === 'google' && options.model.startsWith('gemini-4')) {
			// No streaming: avoids Gemini 3 preview tool+stream issues
			const result = await agent.run({ prompt, maxSteps: 1000 });
			process.stdout.write(result);
		} else {
			const metrics = new MetricsCollector();
			const eventStream = agent.streamEvents({ prompt, maxSteps: 1000 });

			for await (const event of metrics.wrap(eventStream)) {
				if (event.event === 'on_chat_model_stream' && event.data?.chunk) {
					const text = event.data.chunk.text ?? event.data.chunk.content;
					if (typeof text === 'string' && text.length > 0) process.stdout.write(text);
				}
			}

			const trace = metrics.finalise();
			console.log(formatTraceText(trace));
		}
		logger.info('Test generation completed');
	} catch (err) {
		spinner?.fail('Generation failed');
		logger.error('Error details', serializeError(err));
		process.exitCode = 1;
	} finally {
		if (agent) await agent.close();
		if (client) await client.closeAllSessions();
	}
}

async function primeCodeGraph(
	client: NonNullable<ReturnType<typeof createMCPClient>>,
	projectDirectory: string,
	logger: ReturnType<typeof createCliContext>['logger'],
) {
	const session = client.getSession('cgc');
	if (!session) {
		logger.debug('CGC session not available; skipping graph priming');
		return;
	}

	const tools = await session.listTools();
	const toolNames = new Set(tools.map((t) => t.name));
	if (!toolNames.has('add_code_to_graph')) {
		logger.debug('CGC add_code_to_graph tool not available; skipping graph priming');
		return;
	}

	const addResult = await session.callTool('add_code_to_graph', {
		path: projectDirectory,
		is_dependency: false,
	});

	const jobId = extractJobId(addResult);
	if (!jobId) {
		logger.debug('CGC indexing started without a job id; continuing without polling');
		return;
	}

	if (!toolNames.has('check_job_status')) {
		logger.debug('CGC check_job_status tool not available; continuing without polling');
		return;
	}

	const pollDelayMs = 1500;
	const maxPolls = 60; // ~90 seconds
	for (let i = 0; i < maxPolls; i++) {
		const statusResult = await session.callTool('check_job_status', { job_id: jobId });
		const status = extractJobStatus(statusResult);

		if (status === 'completed') {
			logger.debug('CGC indexing completed', { jobId, polls: i + 1 });
			return;
		}

		if (status === 'failed') {
			throw new Error(`CGC indexing failed for job ${jobId}`);
		}

		await sleep(pollDelayMs);
	}

	logger.debug('CGC indexing still running after timeout; continuing anyway', { jobId });
}

function extractJobId(result: unknown): string | undefined {
	const obj = extractStructuredPayload(result);
	const fromStructured =
		obj?.job_id ?? obj?.jobId ?? (typeof obj?.id === 'string' ? obj.id : undefined);
	if (typeof fromStructured === 'string' && fromStructured.length > 0) {
		return fromStructured;
	}

	const text = extractTextPayload(result);
	if (!text) return undefined;

	const fromRegex =
		text.match(/"job_id"\s*:\s*"([^"]+)"/i)?.[1] ??
		text.match(/job[_\s-]?id\s*[:=]\s*([a-z0-9._-]+)/i)?.[1];

	return fromRegex;
}

function extractJobStatus(result: unknown): 'completed' | 'failed' | 'running' | undefined {
	const obj = extractStructuredPayload(result);
	const value =
		typeof obj?.status === 'string'
			? obj.status
			: typeof obj?.state === 'string'
				? obj.state
				: undefined;

	const normalized = value?.toLowerCase();
	if (!normalized) return undefined;
	if (
		['completed', 'complete', 'done', 'finished', 'success', 'succeeded'].includes(normalized)
	) {
		return 'completed';
	}
	if (['failed', 'error', 'errored'].includes(normalized)) {
		return 'failed';
	}
	if (
		['running', 'pending', 'queued', 'processing', 'in_progress', 'in-progress'].includes(
			normalized,
		)
	) {
		return 'running';
	}

	return undefined;
}

function extractStructuredPayload(result: unknown): Record<string, string> | undefined {
	if (!result || typeof result !== 'object') return undefined;
	const maybe = result as { structuredContent?: unknown };
	if (maybe.structuredContent && typeof maybe.structuredContent === 'object') {
		return maybe.structuredContent as Record<string, string>;
	}

	const text = extractTextPayload(result);
	if (!text) return undefined;

	try {
		const parsed = JSON.parse(text) as unknown;
		if (parsed && typeof parsed === 'object') return parsed as Record<string, string>;
	} catch {
		// Ignore non-JSON payloads
	}

	return undefined;
}

function extractTextPayload(result: unknown): string | undefined {
	if (!result || typeof result !== 'object') return undefined;
	const maybe = result as { content?: unknown };
	if (!Array.isArray(maybe.content)) return undefined;

	for (const item of maybe.content) {
		if (!item || typeof item !== 'object') continue;
		const text = (item as { text?: unknown }).text;
		if (typeof text === 'string' && text.length > 0) return text;
	}

	return undefined;
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Serializes an error for logging, capturing all own properties (including
 * non-enumerable ones like `message` and `stack`) plus the full cause chain.
 * This surfaces response bodies from HTTP errors.
 */
function serializeError(err: unknown, depth = 7): unknown {
	if (!(err instanceof Error)) return err;
	const props = Object.fromEntries(
		Object.getOwnPropertyNames(err)
			.filter((k) => k !== 'cause')
			.map((k) => [k, (err as unknown as Record<string, unknown>)[k]]),
	);
	return {
		...props,
		...(err.cause !== undefined && { cause: serializeError(err.cause, depth - 1) }),
	};
}
