import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MutantResult } from 'mutation-server-protocol';

import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';
import type { MutantStore } from '../mutant-cache/MutantStore.ts';
import type { Extra } from './mcpTypes.ts';
import {
	IncludeOptionsSchema,
	MutantRef,
	RequestMutantDetailsSchema,
	FilteredMutant,
	MutantDetailsSchema,
	SourceSnippet,
	IncludeOptions,
	MutantDetailsItem,
} from '../schemas/MutantDetailsSchema.ts';

export class StrykerMutantDetailsTool {
	static inject = [
		tokens.mcpServer,
		tokens.mutantStore,
		tokens.logger,
		tokens.projectDir,
	] as const;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly mutantStore: MutantStore,
		private readonly logger: Logger,
		private readonly projectDir: string,
	) {}

	register() {
		this.mcpServer.registerTool(
			'strykerMutantDetails',
			{
				inputSchema: RequestMutantDetailsSchema,
				outputSchema: MutantDetailsSchema,
			},
			(rawInput, extra) => this.handle(rawInput, extra),
		);
	}

	private async handle(rawInput: unknown, _extra: Extra): Promise<CallToolResult> {
		const parsed = RequestMutantDetailsSchema.safeParse(rawInput);
		if (!parsed.success) {
			return { isError: true, content: [{ type: 'text', text: parsed.error.message }] };
		}

		const { runId, refs } = parsed.data;
		const include = IncludeOptionsSchema.parse(parsed.data.include ?? {});

		if (!this.mutantStore.has(runId)) {
			return {
				isError: true,
				content: [{ type: 'text', text: `Unknown or expired runId: ${runId}` }],
			};
		}

		const mutants = await Promise.all(refs.map((ref) => this.getOne(runId, ref, include)));

		return {
			content: [
				{
					type: 'text',
					text: `Returned ${mutants.length} mutant(s) with runId ${runId}.`,
				},
			],
			structuredContent: { runId, mutants },
		};
	}

	private async getOne(
		runId: number,
		ref: MutantRef,
		include: IncludeOptions,
	): Promise<MutantDetailsItem> {
		try {
			const mutant = this.mutantStore.get(runId, ref);
			if (!mutant) {
				return { filePath: ref.filePath, id: ref.id, found: false };
			}

			const filtered = this.filterMutant(mutant, include);

			const sourceSnippet = include.sourceSnippet
				? await this.readSnippet(ref.filePath, mutant, include.snippetContextLines)
				: undefined;

			return {
				filePath: ref.filePath,
				id: ref.id,
				found: true,
				mutant: filtered,
				...(sourceSnippet ? { sourceSnippet } : {}),
			};
		} catch (e) {
			const msg = e instanceof Error ? e.message : String(e);
			this.logger.error(
				`Failed retrieving mutant details for ${ref.filePath}#${ref.id}: ${msg}`,
			);
			return { filePath: ref.filePath, id: ref.id, found: false, error: msg };
		}
	}

	private filterMutant(mutant: MutantResult, include: IncludeOptions): FilteredMutant {
		const out: FilteredMutant = {
			id: mutant.id,
			location: mutant.location,
			mutatorName: mutant.mutatorName,
			status: mutant.status,
		};

		if (include.coveredBy) out.coveredBy = mutant.coveredBy;
		if (include.replacement) out.replacement = mutant.replacement;

		return out;
	}

	private resolveProjectPath(filePath: string): string | undefined {
		// Allow absolute paths (but still enforce within projectDir)
		const abs = path.isAbsolute(filePath)
			? path.normalize(filePath)
			: path.resolve(this.projectDir, filePath);

		const root = path.resolve(this.projectDir) + path.sep;

		// Prevent escaping the project root via ../
		if (!abs.startsWith(root)) {
			this.logger.warn(
				`Refusing to read file outside projectDir. filePath="${filePath}", resolved="${abs}"`,
			);
			return undefined;
		}

		return abs;
	}

	private async readSnippet(
		filePath: string,
		mutant: MutantResult,
		contextLines: number,
	): Promise<SourceSnippet | undefined> {
		const absPath = this.resolveProjectPath(filePath);
		if (!absPath) return undefined;

		try {
			const text = await readFile(absPath, 'utf8');
			const lines = text.split(/\r?\n/);

			// Avoid invalid mutant location
			const mutantStart = Math.max(1, mutant.location.start.line);
			const mutantEnd = Math.min(lines.length, mutant.location.end.line);

			const startLine = Math.max(1, mutantStart - contextLines);
			const endLine = Math.min(lines.length, mutantEnd + contextLines);

			// Avoid invalid slice
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
