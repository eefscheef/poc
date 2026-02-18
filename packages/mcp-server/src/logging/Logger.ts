/**
 * Very simple logger class that writes to stderr.
 * This is used to avoid corrupting the Mutation Server Protocol messages that are sent over stdout.
 */
export class Logger {
	private readonly prefix: string;
	constructor(prefix = 'MCP') {
		this.prefix = prefix;
	}
	info(message: string) {
		console.error(`[INFO] [${this.prefix}] ${message}`);
	}
	error(message: string) {
		console.error(`[ERROR] [${this.prefix}] ${message}`);
	}
}
