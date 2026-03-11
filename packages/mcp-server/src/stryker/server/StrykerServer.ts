import { JSONRPCClient } from 'json-rpc-2.0';
import { Observable, merge, from, filter, map, takeUntil, catchError, throwError } from 'rxjs';
import { Logger } from '../../logging/Logger.ts';
import { Process } from '../process/Process.ts';
import { ProcessConfig } from '../process/ProcessConfig.ts';
import { StdioTransport } from '../transport/StdioTransport.ts';
import { tokens } from '../../di/tokens.ts';
import {
	ConfigureParams,
	ConfigureResult,
	DiscoverParams,
	DiscoverResult,
	MutationTestParams,
	MutationTestResult,
} from 'mutation-server-protocol';

/**
 * StrykerServer wraps the JSON‑RPC client and exposes high level operations such
 * as `configure`, `discover` and `mutationTest`.  It is similar to the
 * `MutationServer` class in the VSCode plugin but removed VSCode concepts
 * like workspace folders.  The server requests are defined by the
 * Mutation Server Protocol (MSP).
 */
export class StrykerServer {
	static inject = [
		tokens.process,
		tokens.transport,
		tokens.logger,
		tokens.processConfig,
	] as const;

	private readonly client: JSONRPCClient;
	private initialized = false;
	private initPromise: Promise<void> | null = null;

	constructor(
		private readonly process: Process,
		private readonly transport: StdioTransport,
		private readonly logger: Logger,
		private readonly config: ProcessConfig,
	) {
		// Set up the JSON‑RPC client: it uses the transport's send method
		this.client = new JSONRPCClient((req) => {
			this.logger.info(`[JSON-RPC] Sending request: ${req.method} (id: ${req.id})`);
			this.transport.send(JSON.stringify(req));
		});
	}
	/** Start the child process and transport, then perform an initial
	 * configure call.  Throw if the protocol version mismatches.
	 * Calling init() while initialization is already in progress returns the same promise.
	 */
	async init(): Promise<void> {
		if (this.initPromise) return this.initPromise;
		this.initPromise = this.doInit();
		return this.initPromise;
	}

	/**
	 * Returns a promise that resolves when the server is initialized.
	 * Rejects immediately if init() has never been called.
	 * This allows callers to await readiness rather than failing instantly.
	 */
	waitForInit(): Promise<void> {
		return (
			this.initPromise ?? Promise.reject(new Error('Stryker server has not been started.'))
		);
	}

	private async doInit(): Promise<void> {
		const startTime = Date.now();
		this.logger.info('[StrykerServer] Starting initialization...');

		await this.process.init();
		this.logger.info(`[StrykerServer] Process initialized (${Date.now() - startTime}ms)`);

		await this.transport.init();
		this.logger.info(`[StrykerServer] Transport initialized (${Date.now() - startTime}ms)`);

		// Listen for process exit to track server crashes
		this.process.once('exit', (code, signal) => {
			this.logger.error(
				`[StrykerServer] Process exited unexpectedly (code: ${code}, signal: ${signal})`,
			);
			this.initialized = false;
			this.initPromise = null;
			// Unblock any in-flight JSON-RPC requests (e.g. a pending mutationTest).
			// The resulting rejection will surface through the observable's catchError,
			// which calls augmentErrorWithStderr to attach the relevant Stryker output.
			const exitErr = new Error(
				`Stryker process exited unexpectedly (code: ${code}, signal: ${signal})`,
			);
			this.client.rejectAllPendingRequests(exitErr.message);
			this.transport.abort(exitErr);
		});

		// Forward responses from transport to the JSON‑RPC client
		this.transport.messages.subscribe((msg) => {
			this.logger.info(
				`[JSON-RPC] Received response: ${JSON.stringify(msg).substring(0, 200)}`,
			);
			this.client.receive(msg);
		});

		// Configure with the provided config file (if any)
		const configParams: ConfigureParams = {};
		if (this.config.configFilePath) {
			configParams.configFilePath = this.config.configFilePath;
		}

		this.logger.info('[StrykerServer] Sending configure request...');
		const configStartTime = Date.now();
		const versionInfo = (await this.configure(configParams)).version;
		this.logger.info(
			`[StrykerServer] Configure completed in ${Date.now() - configStartTime}ms - version ${versionInfo}`,
		);
		this.logger.info(`Connected to Stryker server version ${versionInfo}`);

		this.logger.info(
			`[StrykerServer] Initialization complete (total: ${Date.now() - startTime}ms)`,
		);
		this.initialized = true;
	}

	isInitialized(): boolean {
		return this.initialized;
	}

	/** Update the process configuration. Must be called before init(). */
	updateConfig(updates: Partial<ProcessConfig>): void {
		if (this.initialized) {
			throw new Error('Cannot update config after server is initialized');
		}
		Object.assign(this.config, updates);
	}

	/** Request the server to configure itself.  The parameter object follows
	 * the mutation‑server‑protocol; here we support an optional `configFilePath`.
	 */
	async configure(params: ConfigureParams): Promise<ConfigureResult> {
		try {
			return await this.client.request('configure', params);
		} catch (error) {
			throw this.augmentErrorWithStderr(error);
		}
	}
	/** Discover mutants in the project.  Returns a promise that resolves to
	 * DiscoverResult.
	 */
	async discover(params: DiscoverParams): Promise<DiscoverResult> {
		const startTime = Date.now();
		this.logger.info(`[StrykerServer] Starting discover request...`);
		try {
			const result = await this.client.request('discover', params);
			this.logger.info(`[StrykerServer] Discover completed in ${Date.now() - startTime}ms`);
			return result;
		} catch (error) {
			this.logger.error(
				`[StrykerServer] Discover failed after ${Date.now() - startTime}ms: ${error}`,
			);
			throw this.augmentErrorWithStderr(error);
		}
	}
	/** Run mutation tests.  Returns an observable that emits progress
	 * notifications followed by the final result.  This mirrors the
	 * `mutationTest` function in the VSCode plugin.
	 */
	mutationTest(params: MutationTestParams): Observable<MutationTestResult> {
		const final$ = from(this.client.request('mutationTest', params));
		const progress$ = this.transport.notifications.pipe(
			filter((notification) => notification.method === 'reportMutationTestProgress'),
			map((notification) => notification.params),
			takeUntil(final$),
		);
		return merge(progress$, final$).pipe(
			catchError((err) => throwError(() => this.augmentErrorWithStderr(err))),
		);
	}

	/**
	 * Replaces a generic JSON-RPC error message with the actionable Stryker
	 * stderr output (e.g. failed dry-run test details and assertion diffs).
	 */
	private augmentErrorWithStderr(err: unknown): unknown {
		const raw = this.transport.getRecentStderr().trim();
		if (!raw || !(err instanceof Error)) return err;

		const filtered = this.filterStderrLines(raw.split('\n')).join('\n').trim();
		if (!filtered) return err;

		err.message = filtered;
		return err;
	}

	/**
	 * Filters raw Stryker stderr lines down to actionable content:
	 * - Keeps ERROR/FATAL log headers (timestamp and pid stripped).
	 * - Drops the redundant top-level "There were failed tests" summary.
	 * - After an error header, captures all follow-on content (assertion
	 *   details, diffs, blank separators) while dropping runtime stack frames.
	 * - Ignores WARN/INFO/DEBUG lines and anything before the first error.
	 */
	private static readonly LOG_LINE = /^\d{2}:\d{2}:\d{2} \(\d+\) (\w+)\b/;
	private static readonly LOG_PREFIX = /^\d{2}:\d{2}:\d{2} \(\d+\)\s+/;
	private static readonly SKIP_SUMMARY =
		/^ERROR Stryker There were failed tests in the initial test run\.?$/;
	private static readonly STACK_FRAME = /^\s*at\s+/;

	private filterStderrLines(lines: string[]): string[] {
		const { LOG_LINE, LOG_PREFIX, SKIP_SUMMARY, STACK_FRAME } = StrykerServer;

		const result: string[] = [];
		let capturing = false;

		for (const line of lines) {
			const logMatch = LOG_LINE.exec(line);
			if (logMatch) {
				capturing = false;
				const level = logMatch[1];
				if (level !== 'ERROR' && level !== 'FATAL') continue;

				const normalized = line.replace(LOG_PREFIX, '');
				if (SKIP_SUMMARY.test(normalized)) continue;

				result.push(normalized);
				capturing = true;
				continue;
			}

			if (!capturing || STACK_FRAME.test(line)) continue;

			result.push(line);
		}

		return result;
	}
	/** Dispose the transport and child process. */
	async dispose(): Promise<void> {
		await this.transport.dispose();
		this.process.dispose();
		this.initialized = false;
	}
}
