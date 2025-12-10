import { EventEmitter } from 'events';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { Logger } from '../logging/Logger';
import { ProcessConfig } from './ProcessConfig';
import { tokens } from '../di/tokens';

/**
 * Process wraps a child process that runs the StrykerJS mutation server.  It
 * forwards stdout and stderr through EventEmitter and exposes methods to
 * initialise and write to the process.  The `inject` property tells
 * typed‑inject which tokens should be provided to satisfy the constructor
 * parameters.
 */
export class Process extends EventEmitter {
    static inject = [tokens.processConfig, tokens.logger] as const;
    private readonly config: ProcessConfig;
    private readonly logger: Logger;
    #proc: ChildProcessWithoutNullStreams | undefined;
    constructor(config: ProcessConfig, logger: Logger) {
        super();
        this.config = config;
        this.logger = logger;
    }
    /** Spawn the StrykerJS server.  Resolves once the process has started. */
    async init(): Promise<void> {
        const { path, args = ['serve', 'stdio'], cwd = process.cwd() } = this.config;
        this.logger.info(`Spawning server: ${path} ${args.join(' ')} (cwd=${cwd})`);
        return new Promise((resolve, reject) => {
            this.#proc = spawn(path, args, { cwd });
            // Propagate data events
            this.#proc.stdout.on('data', (data) => this.emit('stdout', data));
            this.#proc.stderr.on('data', (data) => this.emit('stderr', data));
            this.#proc.on('error', (err) => {
                this.logger.error(`Server process error: ${err.message}`);
                reject(err);
            });
            this.#proc.on('spawn', () => {
                this.logger.info(`Server started with PID ${this.#proc?.pid}`);
                resolve();
            });
        });
    }
    /** Write raw data to the process stdin. */
    write(data: string | Buffer) {
        if (!this.#proc) {
            throw new Error('Process not started');
        }
        this.#proc.stdin.write(data);
    }
    /** Cleanup the child process when you are done. */
    dispose() {
        this.#proc?.removeAllListeners();
        this.#proc?.kill();
    }
}
