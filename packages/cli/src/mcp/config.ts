import { join } from 'path';
import { existsSync } from 'fs';

interface MCPServerConfig {
  command: string;
  args: string[];
}

export interface MCPConfig {
  stryker: MCPServerConfig;
  filesystem: MCPServerConfig;
}

export function createMCPConfig(
  projectDirectory: string,
  monorepoRoot: string
): MCPConfig {
  const mcpServerPath = join(
    monorepoRoot,
    'packages',
    'mcp-server',
    'build',
    'index.js'
  );

  if (!existsSync(mcpServerPath)) {
    throw new Error(
      `Stryker MCP server not found at: ${mcpServerPath}`
    );
  }

  return {
    stryker: {
      command: 'node',
      args: [mcpServerPath],
    },
    filesystem: {
      command: 'npx',
      args: [
        '-y',
        '@modelcontextprotocol/server-filesystem',
        projectDirectory,
      ],
    },
  };
}
