/**
 * Diagnostic script: starts the MCP server in-process and prints the JSON
 * Schema for every registered tool and prompt, so you can verify that Gemini-
 * incompatible keywords (e.g. "default", "$ref", "anyOf") are absent.
 *
 * Usage:
 *   node packages/mcp-server/scripts/dump-tool-schemas.mjs
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServers } from '../build/di/createServers.js';
import { Logger } from '../build/logging/Logger.js';

const projectDir = process.argv[2] ?? process.cwd();

// Minimal no-op logger
const logger = {
	info: () => {},
	warn: () => {},
	error: () => {},
	debug: () => {},
};

const { mcpServer } = createServers(logger, { projectDir, configFilePath: undefined });

const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

await mcpServer.connect(serverTransport);

const client = new Client({ name: 'schema-dumper', version: '1.0.0' }, { capabilities: {} });
await client.connect(clientTransport);

const { tools } = await client.listTools();
const { prompts } = await client.listPrompts();

console.log('\n=== TOOLS (%d) ===\n', tools.length);
for (const tool of tools) {
	console.log(`--- ${tool.name} ---`);
	console.log(JSON.stringify(tool.inputSchema, null, 2));
}

console.log('\n=== PROMPTS (exposed as tools by mcp-use) (%d) ===\n', prompts.length);
for (const prompt of prompts) {
	console.log(`--- ${prompt.name} ---`);
	console.log(JSON.stringify(prompt.arguments, null, 2));
}

await client.close();
process.exit(0);
