import { z } from 'zod';
import { MutantRefSchema } from './MutantDetailsSchema.ts';

export const UndetectedMutantRefSchema = MutantRefSchema.extend({
	status: z.enum(['Survived', 'NoCoverage']),
});

export const MutationTestOverviewSchema = z.object({
	runId: z.number(),
	undetected: z.array(UndetectedMutantRefSchema),
});

export type MutationTestOverview = z.infer<typeof MutationTestOverviewSchema>;
