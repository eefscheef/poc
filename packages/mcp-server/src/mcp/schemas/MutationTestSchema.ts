import { z } from 'zod';
import { MutantRefSchema } from './MutantDetailsSchema.ts';

/* ----------- Output schema -------------- */

export const UndetectedMutantRefSchema = MutantRefSchema.extend({
	status: z.enum(['Survived', 'NoCoverage']),
});

export const MutationTestOverviewSchema = z.object({
	runId: z.number(),
	undetected: z.array(UndetectedMutantRefSchema),
});

export type MutationTestOverview = z.infer<typeof MutationTestOverviewSchema>;

/* ----------- Input schema -------------- */

export const FileRangeSchema = z.object({
	path: z.string(),
	range: z
		.object({
			start: z.object({
				line: z.number().int().nonnegative(),
				column: z.number().int().nonnegative(),
			}),
			end: z.object({
				line: z.number().int().nonnegative(),
				column: z.number().int().nonnegative(),
			}),
		})
		.optional(),
});

const ModeSchema = z.enum(['all', 'files', 'survivors', 'mutants']);

/**
 * Represents the request body for starting a mutation test run.
 * The `mode` field determines which mutants to test:
 * - 'files': Test all mutants in the specified files (requires `files` parameter)
 * - 'all': Test all mutants (no additional parameters needed)
 * - 'survivors': Test all undetected mutants from a previous run (requires `runId`, optional `refs` to specify particular mutants)
 * - 'mutants': Test specific mutants (requires `runId` and `refs`)
 * The schema includes validation to ensure that the required parameters are provided for each mode.
 * Would have preferred a discriminated union here, but that makes it impossible for mcp inspector to render the schema
 */
export const MutationTestRequestSchema = z
	.object({
		mode: ModeSchema.default('all'),

		runId: z.number().int().nonnegative().optional(),
		refs: z.array(MutantRefSchema).optional(),
		files: z.array(FileRangeSchema).optional(),
	})
	.superRefine((v, ctx) => {
		const issue = (path: (string | number)[], message: string) =>
			ctx.addIssue({
				code: 'custom',
				path,
				message,
			});

		switch (v.mode) {
			case 'all':
				return;

			case 'files':
				if (!v.files?.length) {
					issue(['files'], "files must be provided when mode='files'");
				}
				return;

			case 'survivors':
				if (v.runId === undefined) {
					issue(['runId'], "runId is required when mode='survivors'");
				}
				return;

			case 'mutants':
				if (v.runId === undefined) {
					issue(['runId'], "runId is required when mode='mutants'");
				}
				if (!v.refs?.length) {
					issue(['refs'], "refs must be provided when mode='mutants'");
				}
				return;
		}
	});

export type MutationTestRequest = z.infer<typeof MutationTestRequestSchema>;
export type MutantRef = z.infer<typeof MutantRefSchema>;
export type FileRange = z.infer<typeof FileRangeSchema>;
