import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerStrykerRun } from "./tools/strykerRun.js";
import { registerStrykerReadJson } from "./tools/strykerReadJson.js";
const server = new McpServer({ name: "stryker-mcp", version: "0.1.0" });
// Register tools
registerStrykerRun(server);
registerStrykerReadJson(server);
await server.connect(new StdioServerTransport());
