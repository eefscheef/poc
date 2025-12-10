/**
 * A very simple logger.  In a real implementation you would want a more
 * sophisticated logger that supports log levels and contexts.  For this
 * example the API matches the interface used in the VSCode plugin: it
 * implements an `info` and `error` method.  The class does not need an
 * `inject` property because it has no dependencies.
 */
export class Logger {
    private readonly prefix: string;
    constructor(prefix = 'MCP') {
        this.prefix = prefix;
    }
    info(message: string) {
        // Write to stderr instead of stdout to avoid corrupting Mutation Server Protocol
        console.error(`[INFO] [${this.prefix}] ${message}`);
    }
    error(message: string) {
        console.error(`[ERROR] [${this.prefix}] ${message}`);
    }
}
