import { MutantResult, MutationTestResult } from 'mutation-server-protocol';
import { MutantRef } from '../schemas/MutantDetailsSchema.ts';

export interface MutantStore {
	put(runId: number, result: MutationTestResult): void;
	get(runId: number, ref: MutantRef): MutantResult | undefined;
	getAll(runId: number): { filePath: string; mutant: MutantResult }[] | undefined;
	has(runId: number): boolean;
	delete(runId: number): void;
}
