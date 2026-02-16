import { MCPClient, Logger as McpUseLogger } from 'mcp-use';
import type { MCPConfig } from './config.ts';
import type { CliContext } from '../context.ts';

export function createMCPClient(config: MCPConfig, ctx: CliContext): MCPClient {
	// Bridge our verbose flag to mcp-use's global logger
	if (ctx.verbose) {
		McpUseLogger.configure({ level: 'debug' });
	}

	ctx.logger.debug('Creating MCP client', config);

	return new MCPClient({
		mcpServers: config,
	});
}
