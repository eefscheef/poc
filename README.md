# Stryker MCP Server – Proof of Concept

This repository contains a small MCP (Model Context Protocol) server in packages/mcp-server that exposes three Stryker tools that enable an agent to access the mutation testing tool Stryker. 
It is accompanied by a tiny JavaScript package in packages/example-app, that contains tests that won't kill all mutants. This can be used to to quickly verify the server works end-to-end.

What’s inside
.
├─ server/                       # MCP server (TypeScript)
│  ├─ src/
│  │  ├─ index.ts                # entrypoint
│  │  ├─ tools/
│  │  │  ├─ strykerMutate.ts     # runs Stryker mutation testing
│  │  │  ├─ strykerRun.ts        # runs a Stryker dry-run / test-only check
│  │  │  └─ strykerReadJson.ts   # reads and summarizes Stryker JSON report
│  └─ package.json
└─ packages/
   └─ example-app/               # tiny JS lib with tests and Stryker config
      ├─ src/                    # fizzbuzz + isPrime
      ├─ test/                   # unit tests
      ├─ stryker.conf.(js|json)  # stryker config
      └─ package.json


The fizzbuzz package has Stryker installed and configured so you can mutate it immediately.

The three tools
1) strykerMutate

Runs the mutate script if it is configured in your project's package.json.

Name: strykerMutate

Inputs:

cwd (string, required) – Directory containing package.json

timeout (number, optional) – Timeout in seconds (default 900)

Behavior: Executes npx stryker run (or your local script) in cwd. Produces the standard Stryker report under reports/mutation/.

2) strykerRun

Runs Stryker mutation testing via npx and ensures a JSON report is generated.

Name: strykerRun

Inputs:

cwd (string, required) - Project directory

files (string[], optional) - Files to mutate (using stryker's --mutate flag)

timeout (number, optional) – Timeout in seconds (default 120)

Behavior: Invokes Stryker.

3) strykerReadJson

Reads the generated JSON report and returns both the raw JSON and a JSON-safe metrics summary computed with Stryker’s official schema & metrics helper.

Name: strykerReadJson

Inputs:

cwd (string, required) – project directory

path (string, optional) – custom path to the report JSON (defaults to reports/mutation/mutation.json)

Behavior:

Validates the report with mutation-testing-report-schema (Ajv)

Computes metrics via mutation-testing-metrics

Returns a compact summary (no circular references)

Prerequisites

Node.js ≥ 18

pnpm or npm 

If you use VS Code Copilot / Claude / other MCP clients, ensure they can connect via stdio.
