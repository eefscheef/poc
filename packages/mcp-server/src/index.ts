import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {createStrykerServer} from "./stryker/createStrykerServer.ts";
import { registerStrykerDiscover } from "./tools/strykerDiscover.ts";
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const configPath = join(__dirname, '..', 'stryker.config.mjs');

const mcpServer = new McpServer({ name: "stryker-mcp", version: "0.1.0" });
const strykerServer = createStrykerServer({ 
    path: 'npx',
    args: ['stryker', 'serve', 'stdio'],
    configFilePath: configPath 
});
await strykerServer.init();

// Register tools
registerStrykerDiscover(mcpServer, strykerServer);

await mcpServer.connect(new StdioServerTransport());
