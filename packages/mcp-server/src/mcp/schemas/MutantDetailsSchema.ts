import z from 'zod';

/** ---------- Mutant reference schema ---------- */
export const MutantRefSchema = z.object({
	filePath: z.string(),
	id: z.string(),
});

export type MutantRef = z.infer<typeof MutantRefSchema>;

/** ---------- Request mutant details schema ---------- */

export const IncludeOptionsSchema = z.object({
	sourceSnippet: z.boolean().default(true),
	snippetContextLines: z.number().int().min(0).max(10).default(3),
	coveredBy: z.boolean().default(true),
	replacement: z.boolean().default(true),

	// excluded to avoid MCP tool bloat

	// description: z.boolean().default(false),
	// statusReason: z.boolean().default(false),
});

export const RequestMutantDetailsSchema = z.object({
	runId: z.number(),
	refs: z.array(MutantRefSchema),
	include: IncludeOptionsSchema.partial().optional(),
});

export type IncludeOptions = z.infer<typeof IncludeOptionsSchema>;

/** ---------- Return mutant details schemas ---------- */

const MutantStatusSchema = z.enum([
	'Killed',
	'Survived',
	'NoCoverage',
	'CompileError',
	'RuntimeError',
	'Timeout',
	'Ignored',
	'Pending',
]);

const MutantLocationSchema = z.object({
	start: z.object({ line: z.number(), column: z.number() }),
	end: z.object({ line: z.number(), column: z.number() }),
});

const SourceSnippetSchema = z.object({
	startLine: z.number(),
	endLine: z.number(),
	text: z.string(),
});

const FilteredMutantSchema = z.object({
	id: z.string(),
	location: MutantLocationSchema,
	mutatorName: z.string(),
	status: MutantStatusSchema,
	coveredBy: z.array(z.string()).optional(),
	replacement: z.string().optional(),

	// excluded to avoid MCP tool bloat

	// static: z.boolean().optional(),
	// description: z.string().optional(),
	// statusReason: z.string().optional(),
	// duration: z.number().optional(),
	// killedBy: z.array(z.string()).optional(),
	// testsCompleted: z.number().optional(),
});

const MutantDetailsItemSchema = z.discriminatedUnion('found', [
	z.object({
		filePath: z.string(),
		id: z.string(),
		found: z.literal(false),
		error: z.string().optional(),
	}),
	z.object({
		filePath: z.string(),
		id: z.string(),
		found: z.literal(true),
		mutant: FilteredMutantSchema,
		sourceSnippet: SourceSnippetSchema.optional(),
	}),
]);

export const MutantDetailsSchema = z.object({
	runId: z.number(),
	mutants: z.array(MutantDetailsItemSchema),
});

export type SourceSnippet = z.infer<typeof SourceSnippetSchema>;
export type MutantDetails = z.infer<typeof MutantDetailsSchema>;
export type MutantDetailsItem = z.infer<typeof MutantDetailsItemSchema>;
export type FilteredMutant = z.infer<typeof FilteredMutantSchema>;
