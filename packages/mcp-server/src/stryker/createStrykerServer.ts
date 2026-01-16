/*
 * Minimal MCP server setup inspired by the StrykerJS VSCode plugin.
 * This example demonstrates how to use the typed‑inject dependency injection
 * framework to manage the lifetime of a child process, a stdio transport and
 * an RPC server abstraction.
 * See the README of
 * typed‑inject for full details on dependency injection.
 */
import { createInjector } from 'typed-inject';
import { tokens } from './di/tokens.ts';
import { Logger } from './logging/Logger.ts';
import { ProcessConfig } from './process/ProcessConfig.ts';
import { Process } from './process/Process.ts';
import { StdioTransport } from './transport/StdioTransport.ts';
import { StrykerServer } from './server/StrykerServer.ts';

/*
 * Bringing it all together: create a root injector, provide values and classes
 * then construct the MCP server.  In a real application you would call
 * `server.init()` and then use its methods to interact with Stryker.  The
 * injector will guarantee that all dependencies are correctly wired and will
 * throw at compile time if you misconfigure the tokens.
 */
export function createStrykerServer(config: ProcessConfig): StrykerServer {
	const injector = createInjector()
		.provideValue(tokens.logger, new Logger('MCP'))
		.provideValue(tokens.processConfig, config)
		.provideClass(tokens.process, Process)
		.provideClass(tokens.transport, StdioTransport)
		.provideClass(tokens.mcpServer, StrykerServer);
	return injector.injectClass(StrykerServer);
}
