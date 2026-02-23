import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import type { MutantResult } from 'mutation-server-protocol';

import { Logger } from '../../logging/Logger.ts';
import { tokens } from '../../di/tokens.ts';
import type { MutantStore } from '../mutant-cache/MutantStore.ts';
import type { Extra } from '../util/mcpTypes.ts';

import {
	IncludeOptionsSchema,
	RequestMutantDetailsSchema,
	MutantDetailsSchema,
	type MutantDetailsItem,
	type MutantRef,
	type FilteredMutant,
	type IncludeOptions,
} from '../schemas/MutantDetailsSchema.ts';
import { SourceSnippetReader } from '../util/SourceSnippetReader.ts';

export class StrykerMutantDetailsTool {
	static inject = [
		tokens.mcpServer,
		tokens.mutantStore,
		tokens.logger,
		tokens.projectDir,
	] as const;

	private readonly snippetReader: SourceSnippetReader;

	constructor(
		private readonly mcpServer: McpServer,
		private readonly mutantStore: MutantStore,
		private readonly logger: Logger,
		private readonly projectDir: string,
	) {
		this.snippetReader = new SourceSnippetReader(this.projectDir, this.logger);
	}
	register() {
		this.mcpServer.registerTool(
			'strykerMutantDetails',
			{
				description:
					'Retrieves detailed information for specific mutants from a previous mutation test run. ' +
					'Requires runId and a list of { filePath, id } references. ' +
					'Can optionally include source snippets, replacement code, and coverage information.',
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
				? await this.snippetReader.readSnippet(
						ref.filePath,
						mutant.location,
						include.snippetContextLines,
					)
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
}
