import { JSONRPCClient } from 'json-rpc-2.0';
import { Observable, merge, from, filter, map, takeUntil } from 'rxjs';
import { Logger } from '../logging/Logger.ts';
import { Process } from '../process/Process.ts';
import { ProcessConfig } from '../process/ProcessConfig.ts';
import { StdioTransport } from '../transport/StdioTransport.ts';
import { tokens } from '../di/tokens.ts';
import { ConfigureParams, ConfigureResult, DiscoverParams, DiscoverResult, MutationTestParams, MutationTestResult } from 'mutation-server-protocol';

/**
 * StrykerServer wraps the JSON‑RPC client and exposes high level operations such
 * as `configure`, `discover` and `mutationTest`.  It is similar to the
 * `MutationServer` class in the VSCode plugin but removed VSCode concepts
 * like workspace folders.  The server requests are defined by the
 * Mutation Server Protocol (MSP); you can extend this class with more
 * methods depending on the commands you need.
 */
export class StrykerServer {
    static inject = [tokens.process, tokens.transport, tokens.logger, tokens.processConfig] as const;
    private readonly process: Process;
    private readonly transport: StdioTransport;
    private readonly logger: Logger;
    private readonly client: JSONRPCClient;
    private readonly config: ProcessConfig;
    constructor(process: Process, transport: StdioTransport, logger: Logger, config: ProcessConfig) {
        this.process = process;
        this.transport = transport;
        this.logger = logger;
        this.config = config;
        // Set up the JSON‑RPC client: it uses the transport's send method
        this.client = new JSONRPCClient((req) => {
            this.transport.send(JSON.stringify(req));
        });
    }
    /** Start the child process and transport, then perform an initial
     * configure call.  Throw if the protocol version mismatches.
     */
    async init(): Promise<void> {
        await this.process.init();
        await this.transport.init();
        // Forward responses from transport to the JSON‑RPC client
        this.transport.messages.subscribe((msg) => this.client.receive(msg));
        // Configure with the provided config file (if any)
        const configParams: ConfigureParams = {};
        if (this.config.configFilePath) {
            configParams.configFilePath = this.config.configFilePath;
        }
        const versionInfo = (await this.configure(configParams)).version;
        this.logger.info(`Connected to Stryker server version ${versionInfo}`);
    }
    /** Request the server to configure itself.  The parameter object follows
     * the mutation‑server‑protocol; here we support an optional `configFilePath`.
     */
    async configure(params: ConfigureParams): Promise<ConfigureResult> {
        return this.client.request('configure', params);
    }
    /** Discover mutants in the project.  Returns a promise that resolves to
     * DiscoverResult.
     */
    async discover(params: DiscoverParams): Promise<DiscoverResult> {
        return this.client.request('discover', params);
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
        return merge(progress$, final$);
    }
    /** Dispose the transport and child process. */
    async dispose(): Promise<void> {
        await this.transport.dispose();
        this.process.dispose();
    }
}
