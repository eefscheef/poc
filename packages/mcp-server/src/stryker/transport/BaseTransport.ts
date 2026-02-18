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
	constructor(logger: Logger) {
		this.logger = logger;
	}
	abstract init(): Promise<void>;
	abstract send(message: string): void;
	abstract dispose(): Promise<void>;
	protected handleIncomingData(data: Buffer) {
		// Simple JSON‑RPC framing: look for \r\n\r\n then parse JSON body
		const raw = data.toString();
		this.logger.info(`[Transport] Received ${data.length} bytes`);

		const headerEnd = raw.indexOf('\r\n\r\n');
		if (headerEnd < 0) {
			this.logger.info('[Transport] No header delimiter found, buffering...');
			return;
		}

		const header = raw.slice(0, headerEnd);
		const body = raw.slice(headerEnd + 4);
		this.logger.info(`[Transport] Header: ${header}`);
		this.logger.info(
			`[Transport] Body length: ${body.length}, preview: ${body.substring(0, 100)}...`,
		);

		try {
			const json = JSON.parse(body.trim());
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
	protected completeSubjects() {
		this.notifications.complete();
		this.messages.complete();
	}
}
