import { z } from "zod";

/**
 * Zod schema for the strykerRun tool.
 * Includes all common CLI-exposed options and a configOverrides object for rich settings.
 */
export const ZStrykerRunInputShape: z.ZodRawShape = {
  // Required
  cwd: z.string().describe("Project directory containing tests"),

  // Common / CLI-mapped
  mutate: z.array(z.string()).optional().describe("Glob(s) of files to mutate (comma-joined for CLI)"),
  files: z.array(z.string()).optional().describe("Alias for mutate"),
  ignorePatterns: z.array(z.string()).optional().describe("Glob(s) to exclude from sandbox copy"),
  reporters: z.array(z.string()).optional().describe("Reporter names, e.g. ['progress','json']"),
  logLevel: z.enum(["off","fatal","error","warn","info","debug","trace"]).optional(),
  fileLogLevel: z.enum(["off","fatal","error","warn","info","debug","trace"]).optional(),
  concurrency: z.number().int().positive().optional(),
  buildCommand: z.string().optional().describe("Command to run before tests (e.g. 'npm run build')"),
  coverageAnalysis: z.enum(["off", "all", "perTest"]).optional(),
  testRunner: z.string().optional().describe("jest | mocha | jasmine | karma | vitest | tap | cucumber | command"),
  testRunnerNodeArgs: z.array(z.string()).optional().describe("Node exec args for test runner child process"),
  checkers: z.array(z.string()).optional().describe("Checker plugins e.g. ['typescript']"),
  checkerNodeArgs: z.array(z.string()).optional().describe("Node exec args for checker child process"),
  packageManager: z.enum(["npm","yarn","pnpm"]).optional(),
  tsconfigFile: z.string().optional(),
  tempDirName: z.string().optional(),
  maxTestRunnerReuse: z.number().int().min(0).optional(),

  // Booleans / toggles
  allowConsoleColors: z.boolean().optional(),
  allowEmpty: z.boolean().optional(),
  disableBail: z.boolean().optional(),
  dryRunOnly: z.boolean().optional(),
  force: z.boolean().optional(),
  ignoreStatic: z.boolean().optional(),
  incremental: z.boolean().optional(),
  inPlace: z.boolean().optional(),
  cleanTempDir: z.union([z.boolean(), z.literal("always")]).optional(),
  symlinkNodeModules: z.boolean().optional(),

  // Numbers
  dryRunTimeoutMinutes: z.number().int().positive().optional(),
  timeoutMS: z.number().int().positive().optional(),
  timeoutFactor: z.number().positive().optional(),

  // Incremental extras
  incrementalFile: z.string().optional().describe("Path to stryker-incremental.json"),

  // Dashboard (nested)
  dashboard: z.object({
    project: z.string().optional(),
    version: z.string().optional(),
    module: z.string().optional(),
    baseUrl: z.string().optional(),
    reportType: z.string().optional(),
  }).optional(),

  // Config hand-off
  configFile: z.string().optional().describe("Path to an existing Stryker config file (passed as the last arg)"),
  configOverrides: z.record(z.any()).optional().describe("Partial Stryker config to write to a temp JSON file and use as the config for this run"),

  // Tool process timeout (not Stryker's internal timeouts)
  execTimeoutSeconds: z.number().int().positive().optional().describe("Default 300s"),
};

export const ZStrykerRunInput = z.object(ZStrykerRunInputShape);
export type StrykerRunInput = z.infer<typeof ZStrykerRunInput>;