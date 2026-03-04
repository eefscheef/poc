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

		// Disallow tools that are unlikely to be useful to tokens
		const disallowedTools = [
			'execute_command',
			'list_directory_with_sizes',
			'get_file_info',
			'move_file',
			'read_media_file',
			'directory_tree',
			// 'strykerPrompt', // Prompt doesn't get filtered by disallowedTools. TODO: explore if beneficial to move this to tool.
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

		if (options.provider === 'google' && options.model.startsWith('gemini-3')) {
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
		if (err instanceof Error) {
			logger.error('Error details', {
				message: err.message,
				stack: err.stack,
			});
		} else {
			logger.error('Unknown error', err);
		}
		process.exitCode = 1;
	} finally {
		if (agent) await agent.close();
		if (client) await client.closeAllSessions();
	}
}
