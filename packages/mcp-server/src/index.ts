import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerStrykerRun } from "./tools/strykerRun.js";
import { registerStrykerReadJson } from "./tools/strykerReadJson.js";
import { registerStrykerMutate } from "./tools/strykerMutate.js";
import { registerStrykerRunWithArgs } from "./tools/strykerRunWithArgs.js";

const mcpServer = new McpServer({ name: "stryker-mcp", version: "0.1.0" });

// Register tools
registerStrykerRun(mcpServer);
registerStrykerRunWithArgs(mcpServer);
registerStrykerReadJson(mcpServer);
registerStrykerMutate(mcpServer);

await mcpServer.connect(new StdioServerTransport());
