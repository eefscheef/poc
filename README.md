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
   │  │  │  ├─ strykerDiscover.ts   # discovers possible mutants
   │  └─ package.json
   └─ example-app/                  # tiny JS lib with tests and Stryker config
      ├─ src/                       # fizzbuzz + isPrime
      ├─ test/                      # unit tests
      └─ package.json
```


The example app has Stryker installed and configured so you can mutate it immediately. For projects without stryker installed, we will likely need to install Stryker separately, because Stryker does not support mutating files outside it's working directory.

---

## Tools

### 1) `strykerDiscover`

Requests the `discover` functionality from the Stryker Server 

---

## Prerequisites

- **Node.js** ≥ 18  
- An MCP client (VS Code Copilot / Claude / etc.) that can connect via **stdio**
