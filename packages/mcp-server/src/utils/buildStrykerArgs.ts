import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { StrykerRunInput } from "../schemas/strykerRunInput.js";

/**
 * Build argv for Stryker from the the MCP client's input.
 * - Adds json reporter by default (so mutation.json is produced)
 * - Writes configOverrides to a temp file if provided and uses it as last arg
 */
export async function buildStrykerArgs(input: StrykerRunInput): Promise<{ args: string[]; configPath?: string }> {
  const {
    cwd,
    mutate,
    files,
    ignorePatterns,
    reporters,
    logLevel,
    fileLogLevel,
    concurrency,
    buildCommand,
    coverageAnalysis,
    testRunner,
    testRunnerNodeArgs,
    checkers,
    checkerNodeArgs,
    packageManager,
    tsconfigFile,
    tempDirName,
    maxTestRunnerReuse,

    allowConsoleColors,
    allowEmpty,
    disableBail,
    dryRunOnly,
    force,
    ignoreStatic,
    incremental,
    inPlace,
    cleanTempDir,
    symlinkNodeModules,

    dryRunTimeoutMinutes,
    timeoutMS,
    timeoutFactor,

    incrementalFile,

    dashboard,

    configFile,
    configOverrides,
  } = input;

  const args: string[] = [];

  // Merge mutate aliases → comma-separated string for CLI
  const mutateGlobs = [...(mutate ?? []), ...(files ?? [])];
  if (mutateGlobs.length) {
    args.push("--mutate", mutateGlobs.join(","));
  }

  if (ignorePatterns?.length) args.push("--ignorePatterns", ignorePatterns.join(","));

  // Reporters: ensure JSON so mutation.json is produced
  if (reporters?.length) {
    const ensured = reporters.includes("json") ? reporters : [...reporters, "json"];
    args.push("--reporters", ensured.join(","));
  } else {
    args.push("--reporters", "json");
  }

  // Simple flags & values
  if (typeof allowConsoleColors === "boolean") args.push("--allowConsoleColors", String(allowConsoleColors));
  if (allowEmpty) args.push("--allowEmpty");
  if (disableBail) args.push("--disableBail");
  if (dryRunOnly) args.push("--dryRunOnly");
  if (force) args.push("--force");
  if (ignoreStatic) args.push("--ignoreStatic");
  if (incremental) args.push("--incremental");
  if (inPlace) args.push("--inPlace");
  if (symlinkNodeModules) args.push("--symlinkNodeModules");

  if (cleanTempDir !== undefined) args.push("--cleanTempDir", String(cleanTempDir));
  if (typeof concurrency === "number") args.push("--concurrency", String(concurrency));
  if (buildCommand) args.push("--buildCommand", buildCommand);
  if (checkers?.length) args.push("--checkers", checkers.join(","));
  if (checkerNodeArgs?.length) args.push("--checkerNodeArgs", checkerNodeArgs.join(" "));
  if (coverageAnalysis) args.push("--coverageAnalysis", coverageAnalysis);
  if (typeof dryRunTimeoutMinutes === "number") args.push("--dryRunTimeoutMinutes", String(dryRunTimeoutMinutes));
  if (fileLogLevel) args.push("--fileLogLevel", fileLogLevel);
  if (logLevel) args.push("--logLevel", logLevel);
  if (typeof maxTestRunnerReuse === "number") args.push("--maxTestRunnerReuse", String(maxTestRunnerReuse));
  if (packageManager) args.push("--packageManager", packageManager);
  if (tempDirName) args.push("--tempDirName", tempDirName);
  if (testRunner) args.push("--testRunner", testRunner);
  if (testRunnerNodeArgs?.length) args.push("--testRunnerNodeArgs", testRunnerNodeArgs.join(" "));
  if (typeof timeoutFactor === "number") args.push("--timeoutFactor", String(timeoutFactor));
  if (typeof timeoutMS === "number") args.push("--timeoutMS", String(timeoutMS));
  if (tsconfigFile) args.push("--tsconfigFile", tsconfigFile);
  if (incrementalFile) args.push("--incrementalFile", incrementalFile);

  // Dashboard nested flags
  if (dashboard?.project) args.push("--dashboard.project", dashboard.project);
  if (dashboard?.version) args.push("--dashboard.version", dashboard.version);
  if (dashboard?.module) args.push("--dashboard.module", dashboard.module);
  if (dashboard?.baseUrl) args.push("--dashboard.baseUrl", dashboard.baseUrl);
  if (dashboard?.reportType) args.push("--dashboard.reportType", dashboard.reportType);

  // Config precedence:
  // 1) configOverrides -> write temp JSON and use it as last arg
  // 2) else configFile -> pass it as last arg (resolved from cwd)
  // 3) else rely on auto-detection
  let finalConfigPath: string | undefined;
  if (configOverrides) {
    const dir = await mkdtemp(join(tmpdir(), "stryker-mcp-"));
    finalConfigPath = join(dir, "stryker.overrides.json");
    await writeFile(finalConfigPath, JSON.stringify(configOverrides, null, 2), "utf8");
  } else if (configFile) {
    finalConfigPath = resolve(cwd, configFile);
  }

  if (finalConfigPath) {
    // Stryker accepts the config file path as a positional argument at the end
    args.push(finalConfigPath);
  }

  return { args, configPath: finalConfigPath };
}
