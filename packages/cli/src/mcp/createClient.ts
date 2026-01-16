import { MCPClient, Logger } from 'mcp-use';
import { MCPConfig } from './config.ts';
import type { Notification } from 'mcp-use';

export interface CreateMCPClientOptions {
	verbose?: boolean;
	onNotification?: (serverName: string, notification: Notification) => void;
}

export function createMCPClient(config: MCPConfig, options?: CreateMCPClientOptions): MCPClient {
	// Configure mcp-use logging based on verbose flag
	if (options?.verbose) {
		Logger.configure({ level: 'debug' });
	}

	const client = new MCPClient({
		mcpServers: config,
	});

	return client;
}
