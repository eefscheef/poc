# Stryker MCP Server – Proof of Concept

This repository contains a small **MCP (Model Context Protocol) server** in `packages/mcp-server` that exposes Stryker tools so an agent can run mutation testing.  
It is accompanied by a tiny JavaScript package in `packages/example-app` with tests that won’t kill all mutants—handy for quickly verifying the server works end-to-end.

## What’s inside

```
.

└─ packages/
   ├─ mcp-server/                   # MCP server (TypeScript)
   │  ├─ src/
   │  │  ├─ index.ts                # entrypoint
   │  │  ├─ tools/
   │  │  │  ├─ strykerMutate.ts     # runs Stryker mutation testing
   │  │  │  ├─ strykerRun.ts        # runs a Stryker dry-run / test-only check
   │  │  │  └─ strykerReadJson.ts   # reads and summarizes Stryker JSON report
   │  └─ package.json
   └─ example-app/                  # tiny JS lib with tests and Stryker config
      ├─ src/                       # fizzbuzz + isPrime
      ├─ test/                      # unit tests
      ├─ stryker.conf.(js|json)     # stryker config
      └─ package.json
```


The example app has Stryker installed and configured so you can mutate it immediately.

---

## Tools

### 1) `strykerMutate`

Runs the `mutate` script if it is configured in your project’s `package.json`.

**Name:** `strykerMutate`  
**Inputs:**
- `cwd` (string, required) – directory containing `package.json`
- `timeout` (number, optional) – timeout in seconds (default **900**)

**Behavior:** Executes `npx stryker run` (or your local script) in `cwd`. Produces the standard Stryker report under `reports/mutation/`.

---

### 2) `strykerReadJson`

Reads a Stryker-generated JSON report and returns both the raw JSON and a JSON-safe metrics summary computed with Stryker’s official schema & metrics helper.

**Name:** `strykerReadJson`  
**Inputs:**
- `cwd` (string, required) – project directory
- `path` (string, optional) – custom path to the report JSON (defaults to `reports/mutation/mutation.json`)

**Behavior:**
- Validates the report with **`mutation-testing-report-schema`** (Ajv)
- Computes metrics via **`mutation-testing-metrics`**
- Returns a compact summary (no circular references)

---

### 3) `strykerRun`

Runs Stryker mutation testing and ensures a JSON report is generated. Will probably be removed later after verifying that agents can handle the full argument specifications.

**Name:** `strykerRun`  
**Inputs:**
- `cwd` (string, required) – project directory
- `files` (string[], optional) – files/globs to mutate (passed via Stryker’s `--mutate`)
- `timeout` (number, optional) – timeout in seconds (default **120**)

**Behavior:** Invokes Stryker.

---

### 4) `strykerRunWithArgs` (full CLI surface)

Runner that exposes all currently documented StrykerJS options, including incremental mode and dashboard flags. However, **many of them are yet untested.** It uses the current Node to call npm’s JS entrypoint (`npm-cli.js`) with `npm exec`, so it prefers the project’s local Stryker but will otherwise auto-install stryker if missing. The tool also guarantees the JSON reporter is enabled so `mutation.json` is produced. 

**Name:** `strykerRunWithArgs`

#### Required input
- `cwd` (string) – project directory

#### Common options
- `mutate` (string[]) – globs for files to mutate (alias: `files`)
- `ignorePatterns` (string[])
- `reporters` (string[]) – `json` is auto-added if missing
- `logLevel` | `fileLogLevel` – one of `off|fatal|error|warn|info|debug|trace`
- `concurrency` (number), `buildCommand` (string)
- `coverageAnalysis` – `off|all|perTest`
- `testRunner` (string), `testRunnerNodeArgs` (string[])
- `checkers` (string[]), `checkerNodeArgs` (string[])
- `packageManager` – `npm|yarn|pnpm`
- `tsconfigFile` (string), `tempDirName` (string), `maxTestRunnerReuse` (number)

#### Toggles
- `allowConsoleColors`, `allowEmpty`, `disableBail`, `dryRunOnly`, `force`,  
  `ignoreStatic`, `incremental`, `inPlace`, `symlinkNodeModules`
- `cleanTempDir` – boolean or `"always"`

#### Timeouts & factors
- `dryRunTimeoutMinutes` (number), `timeoutMS` (number), `timeoutFactor` (number)

#### Incremental extras
- `incrementalFile` (string)

#### Dashboard (nested)
- `dashboard.project`, `dashboard.version`, `dashboard.module`,  
  `dashboard.baseUrl`, `dashboard.reportType`

#### Config hand-off
- `configFile` (string) – use an existing Stryker config
- `configOverrides` (object) – JSON you want written to a temp config for this run

#### Tool process timeout (outer)
- `execTimeoutSeconds` (number, default **300**) – hard timeout for the child process

#### Behavior details
- Runs `npm exec -y -- stryker run …` by invoking **`npm-cli.js`** with `process.execPath` (no `.cmd`, no shell)
- Inserts a `--` separator so **npm doesn’t parse Stryker flags**; all options after `--` go to Stryker
- Ensures `json` reporter is included (unless you explicitly override)
- If `configOverrides` is provided, writes it to a temp file and passes it as the final config argument

**Returns:** `{ reportPath, via, argv }` (the raw `mutation.json` is available on disk)

---

## Prerequisites

- **Node.js** ≥ 18  
- An MCP client (VS Code Copilot / Claude / etc.) that can connect via **stdio**
