import { BaseTransport } from './BaseTransport.ts';
import { Logger } from '../../logging/Logger.ts';
import { Process } from '../process/Process.ts';
import { tokens } from '../../di/tokens.ts';

/**
 * StdioTransport reads and writes JSON‑RPC over stdio.  It depends on
 * `Process` to provide the underlying child process.  Its `init` method
 * subscribes to stdout/stderr and marks the transport as connected.
 */
export class StdioTransport extends BaseTransport {
	static inject = [tokens.process, tokens.logger] as const;
	private readonly proc: Process;
	private readonly stderrLines: string[] = [];
	private readonly maxStderrLines = 200;
	constructor(proc: Process, logger: Logger) {
		super(logger);
		this.proc = proc;
	}
	async init(): Promise<void> {
		this.proc.on('stdout', (data: Buffer) => this.handleIncomingData(data));
		this.proc.on('stderr', (data: Buffer) => {
			const text = data.toString();
			this.logger.info(text);
			const incoming = text.split('\n');
			this.stderrLines.push(...incoming);
			if (this.stderrLines.length > this.maxStderrLines) {
				// Drop oldest lines from the front so we always retain the last
				// maxStderrLines entries. A single data event may deliver many
				// lines at once, so the excess can be > 1; splice handles any size.
				this.stderrLines.splice(0, this.stderrLines.length - this.maxStderrLines);
			}
		});
		this.connected = true;
		this.logger.info('Connected to StrykerJS mutation server via stdio');
	}

	/** Returns recent stderr output from the Stryker process (up to the last 200 lines). */
	getRecentStderr(): string {
		return this.stderrLines.join('\n');
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
