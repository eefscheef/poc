// src/mcp/tools/shared/SourceSnippetReader.ts
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import type { Logger } from '../../logging/Logger.ts';
import type { SourceSnippet } from '../schemas/MutantDetailsSchema.ts';

export interface Location {
	start: { line: number; column: number };
	end: { line: number; column: number };
}

export class SourceSnippetReader {
	constructor(
		private readonly projectDir: string,
		private readonly logger: Logger,
	) {}

	private resolveProjectPath(filePath: string): string | undefined {
		const abs = path.isAbsolute(filePath)
			? path.normalize(filePath)
			: path.resolve(this.projectDir, filePath);

		const root = path.resolve(this.projectDir) + path.sep;

		if (!abs.startsWith(root)) {
			this.logger.warn(
				`Refusing to read file outside projectDir. filePath="${filePath}", resolved="${abs}"`,
			);
			return undefined;
		}
		return abs;
	}

	async readSnippet(
		filePath: string,
		location: Location,
		contextLines: number,
	): Promise<SourceSnippet | undefined> {
		const absPath = this.resolveProjectPath(filePath);
		if (!absPath) return undefined;

		try {
			const text = await readFile(absPath, 'utf8');
			const lines = text.split(/\r?\n/);
			if (lines.length === 0) return undefined;

			const mutantStart = Math.max(1, location.start.line);
			const mutantEnd = Math.min(lines.length, location.end.line);

			const startLine = Math.max(1, mutantStart - contextLines);
			const endLine = Math.min(lines.length, mutantEnd + contextLines);

			if (startLine > endLine) {
				return { startLine, endLine, text: '[Invalid mutant location range]' };
			}

			const snippet = lines.slice(startLine - 1, endLine).join('\n');
			return { startLine, endLine, text: snippet };
		} catch (err) {
			const msg = err instanceof Error ? err.message : String(err);
			this.logger.warn(`Failed to read snippet for ${filePath}: ${msg}`);
			return undefined;
		}
	}
}
