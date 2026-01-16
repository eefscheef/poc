/*
 * Define tokens for the DI system.  Each key here represents a named
 * dependency; the values are literal strings used by typed‑inject to map
 * constructor parameters to concrete implementations.  See the usage
 * example in the typed‑inject README where tokens like `'logger'` and
 * `'httpClient'` are used.
 */
export const tokens = {
	logger: 'logger',
	processConfig: 'processConfig',
	process: 'process',
	transport: 'transport',
	mcpServer: 'mcpServer',
} as const;
