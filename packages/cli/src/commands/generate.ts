import ora from 'ora';
import { MCPAgent } from 'mcp-use';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

import { getProjectDirectory } from '../ui/requestProjectDir.ts';
import { resolveLLMConfig } from '../llm/resolveLLMConfig.ts';
import { createLLM } from '../llm/providers.ts';
import { createMCPClient } from '../mcp/createClient.ts';
import { loadStrykerPrompt } from '../mcp/loadStrykerPrompt.ts';
import { createLogger } from '../utils/logger.ts';
import { createMCPConfig } from '../mcp/config.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface GenerateOptions {
  project?: string;
  maxIterations?: string;
  provider?: 'openai' | 'anthropic' | 'google';
  model?: string;
  dryRun?: boolean;
  json?: boolean;
  verbose?: boolean;
}

export async function generateTests(options: GenerateOptions) {
  const logger = createLogger({
    json: !!options.json,
    verbose: !!options.verbose,
  });

  const spinner = options.json ? null : ora();

  let agent: MCPAgent | undefined;
  let client: ReturnType<typeof createMCPClient> | undefined;

  try {
    const projectDirectory = await getProjectDirectory(options.project);
    const maxIterations = Number.parseInt(options.maxIterations ?? '4', 10);

    logger.info('Configuration resolved', {
      projectDirectory,
      maxIterations,
      provider: options.provider,
      model: options.model,
      dryRun: options.dryRun,
    });

    spinner?.start('Initializing LLM...');
    const llmConfig = resolveLLMConfig(
      options.provider,
      options.model
    );
    const llm = createLLM(llmConfig);
    spinner?.succeed('LLM initialized');

    // From build/commands, go up to poc root: ../build ../cli ../packages ../poc
    const monorepoRoot = join(__dirname, '..', '..', '..', '..');
    const mcpConfig = createMCPConfig(projectDirectory, monorepoRoot);
    
    client = createMCPClient(mcpConfig, {
      verbose: options.verbose,
    });

    spinner?.start('Connecting MCP servers...');
    await client.createAllSessions();
    spinner?.succeed('MCP servers connected');
    
    spinner?.start('Loading prompt...');
    const prompt = await loadStrykerPrompt(
      client,
      projectDirectory,
      maxIterations
    );
    spinner?.succeed('Prompt loaded');
    
    if (options.dryRun) {
      logger.info('Dry run output', {
        llmConfig,
        mcpConfig,
        prompt,
      });
      return;
    }

    agent = new MCPAgent({
      llm,
      client,
      maxSteps: 1000,
      verbose: options.verbose,
      memoryEnabled: true,
    });
    await agent.initialize();
    logger.info('Agent started');
    
    for await (const event of agent.prettyStreamEvents({
      prompt,
      maxSteps: 1000,

    })) {
      // if (options.json) {
      //   logger.info('agent_event', event);
      // } else if (options.verbose && event) {
      //   // Log agent events in verbose mode for non-json output
      //   logger.debug('Agent event', event);
      // }
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
