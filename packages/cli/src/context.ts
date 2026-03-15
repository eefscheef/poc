import ora, { type Ora } from 'ora';
import { createLogger, type Logger } from './utils/logger.ts';

/**
 * Cross-cutting concerns shared across all CLI sub-modules.
 *
 * Created once at command entry and threaded through helpers so that
 * no module needs to re-derive verbose/json flags or build its own logger.
 */
export interface CliContext {
	readonly logger: Logger;
	readonly spinner: Ora | null;
	readonly verbose: boolean;
	readonly json: boolean;
}

export function createCliContext(options: { json?: boolean; verbose?: boolean }): CliContext {
	const json = !!options.json;
	const verbose = !!options.verbose;

	return {
		logger: createLogger({ json, verbose }),
		spinner: json ? null : ora({ stream: process.stderr }),
		verbose,
		json,
	};
}
