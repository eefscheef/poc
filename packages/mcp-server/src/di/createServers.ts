import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createInjector } from 'typed-inject';
import { tokens } from './tokens.ts';
import { Logger } from '../logging/Logger.ts';
import { ProcessConfig } from '../stryker/process/ProcessConfig.ts';
import { Process } from '../stryker/process/Process.ts';
import { StdioTransport } from '../stryker/transport/StdioTransport.ts';
import { StrykerServer } from '../stryker/server/StrykerServer.ts';

import { registerStrykerMutationTest } from '../mcp/tools/strykerMutationTest.ts';
import { registerTestGenerationPrompt } from '../mcp/prompts/testGenerationPrompt.ts';

export function createServers(logger: Logger, config: ProcessConfig) {
	const mcpServer = new McpServer({ name: 'stryker-mcp', version: '0.1.0' });

	const injector = createInjector()
		.provideValue(tokens.logger, logger)
		.provideValue(tokens.processConfig, config)
		.provideClass(tokens.process, Process)
		.provideClass(tokens.transport, StdioTransport)
		.provideClass(tokens.strykerServer, StrykerServer)
		.provideValue(tokens.mcpServer, mcpServer);

	injector.injectFunction(registerStrykerMutationTest);
	injector.injectFunction(registerTestGenerationPrompt);

	return {
		injector,
		mcpServer,
		strykerServer: injector.resolve(tokens.strykerServer),
	};
}
