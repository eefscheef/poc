import { BaseTransport } from './BaseTransport.ts';
import { Logger } from '../logging/Logger.ts';
import { Process } from '../process/Process.ts';
import { tokens } from '../di/tokens.ts';

/**
 * StdioTransport reads and writes JSON‑RPC over stdio.  It depends on
 * `Process` to provide the underlying child process.  Its `init` method
 * subscribes to stdout/stderr and marks the transport as connected.
 */
export class StdioTransport extends BaseTransport {
	static inject = [tokens.process, tokens.logger] as const;
	private readonly proc: Process;
	constructor(proc: Process, logger: Logger) {
		super(logger);
		this.proc = proc;
	}
	async init(): Promise<void> {
		this.proc.on('stdout', (data: Buffer) => this.handleIncomingData(data));
		this.proc.on('stderr', (data: Buffer) => {
			this.logger.info(data.toString());
		});
		this.connected = true;
		this.logger.info('Connected to StrykerJS mutation server via stdio');
	}
	send(message: string) {
		if (!this.connected) {
			throw new Error('Transport not connected');
		}
		const content = Buffer.from(message);
		this.proc.write(`Content-Length: ${content.byteLength}\r\n\r\n${content}`);
	}
	async dispose(): Promise<void> {
		this.connected = false;
		this.completeSubjects();
	}
}
