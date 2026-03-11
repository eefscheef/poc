import { Subject } from 'rxjs';
import { JSONRPCResponse, JSONRPCRequest } from 'json-rpc-2.0';
import { Logger } from '../../logging/Logger.ts';

/**
 * BaseTransport manages the low‑level handling of JSON‑RPC messages.  It
 * exposes two RxJS subjects: `notifications` (requests without an ID) and
 * `messages` (responses to requests).  Child classes override `init`,
 * `send` and `dispose`.  This design mirrors the VSCode plugin base
 * transport.
 */
export abstract class BaseTransport {
	protected connected = false;
	public readonly notifications = new Subject<JSONRPCRequest>();
	public readonly messages = new Subject<JSONRPCResponse>();
	protected readonly logger: Logger;
	private buffer = Buffer.alloc(0);
	private contentLength: number | null = null;

	constructor(logger: Logger) {
		this.logger = logger;
	}
	abstract init(): Promise<void>;
	abstract send(message: string): void;
	abstract dispose(): Promise<void>;
	protected handleIncomingData(data: Buffer) {
		this.buffer = Buffer.concat([this.buffer, data]);
		this.logger.info(`[Transport] Received ${data.length} bytes`);

		// Process as many complete messages as are available in the buffer
		while (this.buffer.length > 0) {
			// Step 1: Parse header if we haven't yet
			if (this.contentLength === null) {
				const headerEnd = this.buffer.indexOf('\r\n\r\n');
				if (headerEnd < 0) {
					this.logger.info('[Transport] No header delimiter found, buffering...');
					return;
				}

				const header = this.buffer.subarray(0, headerEnd).toString();
				this.logger.info(`[Transport] Header: ${header}`);
				const match = header.match(/Content-Length:\s*(\d+)/i);
				if (!match) {
					this.logger.error(`[Transport] Missing Content-Length in header: ${header}`);
					// Discard the malformed header and continue
					this.buffer = this.buffer.subarray(headerEnd + 4);
					continue;
				}
				this.contentLength = parseInt(match[1], 10);
				this.buffer = this.buffer.subarray(headerEnd + 4);
			}

			// Step 2: Wait until the full body has arrived
			if (this.buffer.length < this.contentLength) {
				this.logger.info(
					`[Transport] Waiting for body: have ${this.buffer.length}/${this.contentLength} bytes`,
				);
				return;
			}

			// Step 3: Extract and parse the body
			const body = this.buffer.subarray(0, this.contentLength).toString();
			this.buffer = this.buffer.subarray(this.contentLength);
			this.contentLength = null;

			this.logger.info(
				`[Transport] Body length: ${body.length}, preview: ${body.substring(0, 100)}...`,
			);

			try {
				const json = JSON.parse(body);
				// Distinguish response (has id) from notification (no id)
				if (typeof json.id === 'undefined') {
					this.logger.info(`[Transport] Parsed notification: ${json.method}`);
					this.notifications.next(json as JSONRPCRequest);
				} else {
					this.logger.info(`[Transport] Parsed response for request id: ${json.id}`);
					this.messages.next(json as JSONRPCResponse);
				}
			} catch (err) {
				this.logger.error(`Failed to parse JSON‑RPC message: ${(err as Error).message}`);
				this.logger.error(`Raw body that failed: ${body}`);
			}
		}
	}
	protected completeSubjects() {
		this.notifications.complete();
		this.messages.complete();
	}

	/**
	 * Errors both subjects with the provided error, unblocking any pending
	 * subscribers (e.g. an in-flight mutationTest observable) when the
	 * underlying process exits unexpectedly.
	 */
	abort(err: Error) {
		this.connected = false;
		this.notifications.error(err);
		this.messages.error(err);
	}
}
