import { JSONRPCClient } from 'json-rpc-2.0';
import { Observable, merge, from, filter, map, takeUntil } from 'rxjs';
import { Logger } from '../logging/Logger.ts';
import { Process } from '../process/Process.ts';
import { StdioTransport } from '../transport/StdioTransport.ts';
import { tokens } from '../di/tokens.ts';

/**
 * McpServer wraps the JSON‑RPC client and exposes high level operations such
 * as `configure`, `discover` and `mutationTest`.  It is similar to the
 * `MutationServer` class in the VSCode plugin but removed VSCode concepts
 * like workspace folders.  The server requests are defined by the
 * Mutation Server Protocol (MSP); you can extend this class with more
 * methods depending on the commands you need.
 */
export class McpServer {
    static inject = [tokens.process, tokens.transport, tokens.logger] as const;
    private readonly process: Process;
    private readonly transport: StdioTransport;
    private readonly logger: Logger;
    private readonly client: JSONRPCClient;
    constructor(process: Process, transport: StdioTransport, logger: Logger) {
        this.process = process;
        this.transport = transport;
        this.logger = logger;
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
        // You can perform an initial handshake here, for example call the MSP
        // `configure` method to obtain the server version.
        const versionInfo = await this.configure();
        this.logger.info(`Connected to Stryker server version ${versionInfo.version}`);
    }
    /** Request the server to configure itself.  The parameter object follows
     * the mutation‑server‑protocol; here we support an optional `configFilePath`.
     */
    async configure(configFilePath?: string): Promise<{ version: string }> {
        const params: Record<string, unknown> = {};
        if (configFilePath) {
            params.configFilePath = configFilePath;
        }
        return this.client.request('configure', params);
    }
    /** Discover mutants in the project.  Returns a promise that resolves to
     * whatever the server returns for `discover`.  See MSP docs for shape.
     */
    async discover(params: Record<string, unknown> = {}): Promise<any> {
        return this.client.request('discover', params);
    }
    /** Run mutation tests.  Returns an observable that emits progress
     * notifications followed by the final result.  This mirrors the
     * `mutationTest` function in the VSCode plugin.
     */
    mutationTest(params: Record<string, unknown>): Observable<any> {
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
