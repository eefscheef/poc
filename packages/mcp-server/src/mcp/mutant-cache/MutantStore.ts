import { MutantResult, MutationTestResult } from 'mutation-server-protocol';
import { MutantRef } from '../schemas/MutantDetailsSchema.ts';

export interface MutantStore {
	put(runId: number, result: MutationTestResult): void;
	get(runId: number, ref: MutantRef): MutantResult | undefined;
	has(runId: number): boolean;
	delete(runId: number): void;
}
