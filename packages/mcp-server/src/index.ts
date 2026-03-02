import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { resolve, join } from 'node:path';
import { existsSync, statSync } from 'node:fs';

import { Logger } from './logging/Logger.ts';
import { createServers } from './di/createServers.ts';

const logger = new Logger('MCP-Server');

function exitWithError(message: string): never {
	logger.error(message);
	process.exit(1);
}

function parseAndValidateCli() {
	const args = process.argv.slice(2);
	let projectDir: string | undefined;
	let configFilePath: string | undefined;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === '-d' || args[i] === '--project-dir') {
			if (i + 1 >= args.length) exitWithError(`Missing value for ${args[i]}`);
			projectDir = args[++i];
		} else if (args[i] === '-c' || args[i] === '--config') {
			if (i + 1 >= args.length) exitWithError(`Missing value for ${args[i]}`);
			configFilePath = args[++i];
		} else {
			exitWithError(`Unknown argument: ${args[i]}. Usage: -d <path> [-c <path>]`);
		}
	}

	if (!projectDir) exitWithError('Missing required argument: -d <project-directory>');
	projectDir = resolve(projectDir);

	if (!existsSync(projectDir)) exitWithError(`Project directory does not exist: ${projectDir}`);
	if (!statSync(projectDir).isDirectory())
		exitWithError(`Project directory is not a directory: ${projectDir}`);

	configFilePath = configFilePath
		? resolve(configFilePath)
		: join(projectDir, 'stryker.config.mjs');

	if (!existsSync(configFilePath)) exitWithError(`Config file does not exist: ${configFilePath}`);
	if (!statSync(configFilePath).isFile())
		exitWithError(`Config path is not a file: ${configFilePath}`);

	return { projectDir, configFilePath };
}

async function main() {
	const { projectDir, configFilePath } = parseAndValidateCli();

	logger.info(`Starting with projectDir="${projectDir}" and configFilePath="${configFilePath}"`);

	const { mcpServer } = createServers(logger, {
		path: 'npx',
		args: ['-y', '-p', '@stryker-mutator/core', 'stryker', 'serve', 'stdio'],
		projectDir: projectDir,
		configFilePath,
	});

	await mcpServer.connect(new StdioServerTransport());
}

main().catch((err) => {
	logger.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
	process.exit(1);
});
