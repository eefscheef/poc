import { MutantResult, MutationTestResult } from 'mutation-testing-report-schema';
import { MutantStore } from './MutantStore.ts';
import { MutantRef } from '../schemas/MutantDetailsSchema.ts';

/**
 * Represents the cached mutant results for a single mutation-test run.
 *
 * Mutants are grouped by source file and indexed by mutant id
 * for efficient lookup.
 */
interface RunEntry {
	// filePath -> mutantId -> mutant
	mutantsByFile: Map<string, Map<number, MutantResult>>;
}

export class InMemoryMutantStore implements MutantStore {
	// Maps in JS store insertion order
	private readonly runs = new Map<number, RunEntry>();
	private readonly maxRuns = 5;

	put(runId: number, result: MutationTestResult): void {
		const mutantsByFile = new Map<string, Map<number, MutantResult>>();

		for (const [filePath, fileResult] of Object.entries(result.files ?? {})) {
			const byId = new Map<number, MutantResult>();
			for (const m of fileResult.mutants ?? []) {
				byId.set(Number(m.id), m);
			}
			mutantsByFile.set(filePath, byId);
		}

		// Move updated run to the end to mark it as most recently used
		this.runs.delete(runId);
		this.runs.set(runId, { mutantsByFile });

		this.evictOverflow();
	}

	get(runId: number, ref: MutantRef): MutantResult | undefined {
		const entry = this.runs.get(runId);
		if (!entry) return undefined;

		// Move accessed run to the end to mark it as most recently used
		this.runs.delete(runId);
		this.runs.set(runId, entry);

		return entry.mutantsByFile.get(ref.filePath)?.get(Number(ref.id));
	}

	getAll(runId: number): { filePath: string; mutant: MutantResult }[] | undefined {
		const entry = this.runs.get(runId);
		if (!entry) return undefined;

		// Move accessed run to the end to mark it as most recently used
		this.runs.delete(runId);
		this.runs.set(runId, entry);

		// Flatten all mutants from all files, preserving file path
		return Array.from(entry.mutantsByFile.entries()).flatMap(([filePath, mutantsById]) =>
			Array.from(mutantsById.values()).map((mutant) => ({ filePath, mutant })),
		);
	}

	has(runId: number): boolean {
		return this.runs.has(runId);
	}

	delete(runId: number): void {
		this.runs.delete(runId);
	}

	private evictOverflow() {
		while (this.runs.size > this.maxRuns) {
			const oldest = this.runs.keys().next().value as number | undefined;
			if (!oldest) break;
			this.runs.delete(oldest);
		}
	}
}
