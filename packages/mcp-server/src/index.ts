import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createStrykerServer } from './stryker/createStrykerServer.ts';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { existsSync, statSync } from 'node:fs';
import { registerStrykerMutationTest } from './tools/strykerMutationTest.ts';
import { registerTestGenerationPrompt } from './prompts/testGenerationPrompt.ts';
import { Logger } from './stryker/logging/Logger.ts';

const __filename = fileURLToPath(import.meta.url);
const logger = new Logger('MCP-Server');

// Parse command-line arguments: -d <path> -c <path>
const args = process.argv.slice(2);
let projectDir: string | undefined;
let configFilePath: string | undefined;

for (let i = 0; i < args.length; i++) {
	if (args[i] === '-d' || args[i] === '--project-dir') {
		if (i + 1 >= args.length) {
			logger.error(`Missing value for ${args[i]}`);
			process.exit(1);
		}
		projectDir = args[i + 1];
		i++;
	} else if (args[i] === '-c' || args[i] === '--config') {
		if (i + 1 >= args.length) {
			logger.error(`Missing value for ${args[i]}`);
			process.exit(1);
		}
		configFilePath = args[i + 1];
		i++;
	} else {
		logger.error(`Unknown argument: ${args[i]}. Usage: -d <path> [-c <path>]`);
		process.exit(1);
	}
}

// Require -d argument
if (!projectDir) {
	logger.error('Missing required argument: -d <project-directory>');
	process.exit(1);
}

// Resolve to absolute path
projectDir = resolve(projectDir);

// Validate project directory exists
if (!existsSync(projectDir)) {
	logger.error(`Project directory does not exist: ${projectDir}`);
	process.exit(1);
}

if (!statSync(projectDir).isDirectory()) {
	logger.error(`Project directory is not a directory: ${projectDir}`);
	process.exit(1);
}

// Default config path is stryker.config.mjs in the project directory
if (!configFilePath) {
	configFilePath = join(projectDir, 'stryker.config.mjs');
} else {
	configFilePath = resolve(configFilePath);
}

// Validate config file exists
if (!existsSync(configFilePath)) {
	logger.error(`Config file does not exist: ${configFilePath}`);
	process.exit(1);
}

if (!statSync(configFilePath).isFile()) {
	logger.error(`Config path is not a file: ${configFilePath}`);
	process.exit(1);
}

const mcpServer = new McpServer({ name: 'stryker-mcp', version: '0.1.0' });
const strykerServer = createStrykerServer({
	path: 'npx',
	args: ['stryker', 'serve', 'stdio'],
	cwd: projectDir,
	configFilePath: configFilePath,
});

logger.info(`Starting with projectDir="${projectDir}" and configFilePath="${configFilePath}"`);

// Initialize Stryker server immediately on startup
await strykerServer.init();

// Register tools
registerStrykerMutationTest(mcpServer, strykerServer);
registerTestGenerationPrompt(mcpServer);

await mcpServer.connect(new StdioServerTransport());
