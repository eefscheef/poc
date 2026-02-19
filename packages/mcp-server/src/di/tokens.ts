/*
 * Tokens for the DI system.  Each key here represents a named
 * dependency; the values are literal strings used by typed‑inject to map
 * constructor parameters to concrete implementations.
 */
export const tokens = {
	logger: 'logger',
	processConfig: 'processConfig',
	process: 'process',
	transport: 'transport',
	mcpServer: 'mcpServer',
	strykerServer: 'strykerServer',
	mutantStore: 'mutantStore',
	projectDir: 'projectDir',
} as const;
