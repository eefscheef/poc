// toMutationTestParams.ts
import type { MutationTestParams, MutantResult } from 'mutation-server-protocol';
import type { MutantStore } from '../mutant-cache/MutantStore.ts';
import type { MutationTestRequest, MutantRef } from '../schemas/MutationTestSchema.ts';

type UndetectedStatus = 'Survived' | 'NoCoverage';

function isUndetected(status: string): status is UndetectedStatus {
	return status === 'Survived' || status === 'NoCoverage';
}

/**
 * Project a cached MutantResult into the MSP "mutant spec" shape required by MutationTestParams.mutants.
 * IMPORTANT: this is NOT MutantResult (which includes status/coveredBy/etc). It's the *input* mutant spec.
 */
function toInputMutantSpec(m: MutantResult) {
	return {
		id: m.id,
		location: m.location,
		description: m.description,
		mutatorName: m.mutatorName,
		replacement: m.replacement,
	};
}

function groupByFile(mutants: { filePath: string; mutant: MutantResult }[]) {
	const out: NonNullable<MutationTestParams['mutants']> = {};
	for (const { filePath, mutant } of mutants) {
		(out[filePath] ??= { mutants: [] }).mutants.push(toInputMutantSpec(mutant));
	}
	return out;
}

/**
 * Returns references to all mutants for a given run.
 */
function resolveRefsFromRun(mutantStore: MutantStore, runId: number) {
	// This returns all mutants for the run, each with a filePath.
	const result = mutantStore.getAll(runId);
	if (!result) return [];

	const out: MutantRef[] = [];
	for (const { filePath, mutant } of result) {
		if (isUndetected(mutant.status)) out.push({ filePath, id: mutant.id });
	}
	return out;
}

function assertRunExists(mutantStore: MutantStore, runId: number) {
	if (!mutantStore.has(runId)) throw new Error(`Unknown or expired runId: ${runId}`);
}

function pickMutants(
	mutantStore: MutantStore,
	runId: number,
	refs: MutantRef[],
): { filePath: string; mutant: MutantResult }[] {
	const picked: { filePath: string; mutant: MutantResult }[] = [];
	for (const ref of refs) {
		const m = mutantStore.get(runId, ref);
		if (m) picked.push({ filePath: ref.filePath, mutant: m });
	}
	return picked;
}

export function toMutationTestParams(
	req: MutationTestRequest,
	mutantStore: MutantStore,
): MutationTestParams {
	switch (req.mode) {
		case 'all':
			// empty params => Stryker Server mutates all files specified by config)
			return {};

		case 'files':
			return { files: req.files };

		case 'survivors': {
			// These non-null assertions are safe because of zod's schema validation (runId is required for 'survivors' and 'mutants' modes).
			assertRunExists(mutantStore, req.runId!);
			// if refs were provided, use those. Otherwise, resolve all undetected mutants from the run.
			const resolvedRefs = req.refs?.length
				? req.refs
				: resolveRefsFromRun(mutantStore, req.runId!);

			const picked = pickMutants(mutantStore, req.runId!, resolvedRefs);
			return { mutants: groupByFile(picked) };
		}

		case 'mutants': {
			assertRunExists(mutantStore, req.runId!);
			const picked = pickMutants(mutantStore, req.runId!, req.refs!);
			return { mutants: groupByFile(picked) };
		}
	}
}
