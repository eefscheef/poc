import { EventEmitter } from 'events';
import { spawn } from 'cross-spawn';
import type { ChildProcess } from 'child_process';
import { Logger } from '../../logging/Logger.ts';
import { ProcessConfig } from './ProcessConfig.ts';
import { tokens } from '../../di/tokens.ts';

export class Process extends EventEmitter {
	static inject = [tokens.processConfig, tokens.logger] as const;
	private readonly config: ProcessConfig;
	private readonly logger: Logger;
	#proc: ChildProcess | undefined;

	constructor(config: ProcessConfig, logger: Logger) {
		super();
		this.config = config;
		this.logger = logger;
	}

	async init(): Promise<void> {
		const {
			path,
			args = ['-y', '-p', '@stryker-mutator/core', 'stryker', 'serve', 'stdio'],
			projectDir: cwd = process.cwd(),
		} = this.config;

		this.logger.info(`Spawning server: ${path} ${args.join(' ')} (cwd=${cwd})`);

		return new Promise((resolve, reject) => {
			this.#proc = spawn(path, args, {
				cwd,
				stdio: 'pipe',
			});

			if (!this.#proc.stdout || !this.#proc.stderr) {
				return reject(new Error('Failed to capture stdout/stderr'));
			}

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

			this.#proc.on('exit', (code, signal) => {
				this.logger.info(`Server process exited with code ${code}, signal ${signal}`);
				this.emit('exit', code, signal);
			});
		});
	}

	write(data: string | Buffer) {
		if (!this.#proc || !this.#proc.stdin) {
			throw new Error('Process not started or stdin closed');
		}
		this.#proc.stdin.write(data);
	}

	dispose() {
		this.#proc?.removeAllListeners();
		this.#proc?.kill();
	}
}
