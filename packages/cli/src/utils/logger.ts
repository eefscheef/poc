import chalk from 'chalk';

/** Structured logger that all CLI modules can depend on. */
export interface Logger {
	info(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
	debug(message: string, data?: unknown): void;
}

export interface LoggerOptions {
	json: boolean;
	verbose: boolean;
}

export function createLogger(opts: LoggerOptions): Logger {
	function log(level: 'info' | 'error' | 'debug', message: string, data?: unknown) {
		if (level === 'debug' && !opts.verbose) return;

		if (opts.json) {
			console.log(
				JSON.stringify({
					level,
					message,
					...(data !== undefined && { data }),
				}),
			);
		} else {
			const prefix = {
				info: chalk.green('[INFO]'),
				error: chalk.red('[ERROR]'),
				debug: chalk.gray('[DEBUG]'),
			}[level];

			console.log(prefix, message);
			// Always show data for errors, only show for other levels when verbose
			if ((level === 'error' || opts.verbose) && data) {
				console.log(chalk.gray(JSON.stringify(data, null, 2)));
			}
		}
	}

	return {
		info: (m: string, d?: unknown) => log('info', m, d),
		error: (m: string, d?: unknown) => log('error', m, d),
		debug: (m: string, d?: unknown) => log('debug', m, d),
	};
}
