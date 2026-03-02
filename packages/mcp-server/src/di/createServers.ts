import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createInjector } from 'typed-inject';
import { tokens } from './tokens.ts';
import { Logger } from '../logging/Logger.ts';
import { ProcessConfig } from '../stryker/process/ProcessConfig.ts';
import { Process } from '../stryker/process/Process.ts';
import { StdioTransport } from '../stryker/transport/StdioTransport.ts';
import { StrykerServer } from '../stryker/server/StrykerServer.ts';

import { StrykerMutationTestTool } from '../mcp/tools/StrykerMutationTestTool.ts';
import { registerTestGenerationPrompt } from '../mcp/prompts/testGenerationPrompt.ts';
import { InMemoryMutantStore } from '../mcp/mutant-cache/InMemoryMutantStore.ts';
import { StrykerMutantDetailsTool } from '../mcp/tools/StrykerMutantDetailsTool.ts';
import { StrykerStartTool } from '../mcp/tools/StrykerStartTool.ts';

export function createServers(logger: Logger, config: ProcessConfig) {
	const mcpServer = new McpServer({ name: 'stryker-mcp', version: '0.1.0' });

	const injector = createInjector()
		.provideValue(tokens.logger, logger)
		.provideValue(tokens.processConfig, config)
		.provideClass(tokens.process, Process)
		.provideClass(tokens.transport, StdioTransport)
		.provideClass(tokens.strykerServer, StrykerServer)
		.provideClass(tokens.mutantStore, InMemoryMutantStore)
		.provideValue(tokens.mcpServer, mcpServer)
		.provideValue(tokens.projectDir, config.projectDir);

	const strykerServer = injector.resolve(tokens.strykerServer);

	injector.injectClass(StrykerStartTool).register();
	injector.injectClass(StrykerMutationTestTool).register();
	injector.injectClass(StrykerMutantDetailsTool).register();

	injector.injectFunction(registerTestGenerationPrompt);

	return {
		injector,
		mcpServer,
		strykerServer,
	};
}
