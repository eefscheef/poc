import { join } from 'path';
import { existsSync } from 'fs';

interface MCPServerConfig {
	command: string;
	args: string[];
}

export interface MCPConfig {
	stryker: MCPServerConfig;
	filesystem: MCPServerConfig;
	cgc: MCPServerConfig;
}

export function createMCPConfig(projectDirectory: string, monorepoRoot: string): MCPConfig {
	const mcpServerPath = join(monorepoRoot, 'packages', 'mcp-server', 'build', 'index.js');

	if (!existsSync(mcpServerPath)) {
		throw new Error(`Stryker MCP server not found at: ${mcpServerPath}`);
	}

	return {
		stryker: {
			command: 'node',
			args: [mcpServerPath, '-d', projectDirectory],
		},
		filesystem: {
			command: 'npx',
			args: ['-y', '@modelcontextprotocol/server-filesystem', projectDirectory],
		},
		cgc: {
			// cgc is installed under Python 3.13 (kuzu has no wheel for 3.14 yet).
			// Use the py launcher to target the correct interpreter explicitly.
			command: 'py',
			args: ['-3.13', '-m', 'codegraphcontext', 'mcp', 'start'],
		},
	};
}
