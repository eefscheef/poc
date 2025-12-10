import { Subject } from 'rxjs';
import { JSONRPCResponse, JSONRPCRequest } from 'json-rpc-2.0';
import { Logger } from '../logging/Logger';

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
        const headerEnd = raw.indexOf('\r\n\r\n');
        if (headerEnd < 0) {
            return;
        }
        const body = raw.slice(headerEnd + 4);
        try {
            const json = JSON.parse(body.trim());
            // Distinguish response (has id) from notification (no id)
            if (typeof json.id === 'undefined') {
                this.notifications.next(json as JSONRPCRequest);
            } else {
                this.messages.next(json as JSONRPCResponse);
            }
        } catch (err) {
            this.logger.error(`Failed to parse JSON‑RPC message: ${(err as Error).message}`);
        }
    }
    protected completeSubjects() {
        this.notifications.complete();
        this.messages.complete();
    }
}
