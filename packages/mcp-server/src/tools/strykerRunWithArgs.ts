import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { access } from "node:fs/promises";
import { join, dirname } from "node:path";
import {
  ZStrykerRunInput,
  ZStrykerRunInputShape,
  type StrykerRunInput
} from "../schemas/strykerRunInput.js";
import { buildStrykerArgs } from "../utils/buildStrykerArgs.js";

const execFileAsync = promisify(execFile);

// Tiny helpers
const exists = async (p: string) => { try { await access(p); return true; } catch { return false; } };

/** Find npm’s JS CLI next to the current Node install (works cross-platform, avoids *.cmd) */
async function findNpmCliJs(): Promise<string | undefined> {
  const nodeDir = dirname(process.execPath);
  const candidates = [
    // Windows Node installer layout
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    // Unix/Homebrew layouts
    join(nodeDir, "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"),
    join(nodeDir, "..", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  for (const c of candidates) if (await exists(c)) return c;
  return undefined;
}

export function registerStrykerRunWithArgs(server: McpServer) {
  server.registerTool(
    "strykerRunWithArgs",
    {
      title: "Stryker Run (npm exec via npm-cli.js, no shell)",
      description:
        "Runs Stryker using npm exec semantics by invoking npm’s JS entrypoint with Node. Supports all documented options; ensures a JSON report is generated.",
      inputSchema: ZStrykerRunInputShape,
    },
    async (rawInput) => {
      const input: StrykerRunInput = ZStrykerRunInput.parse(rawInput);
      const timeoutMs = (input.execTimeoutSeconds ?? 300) * 1000;

      try {
        const npmCli = await findNpmCliJs();
        if (!npmCli) {
          return {
            content: [{
              type: "text",
              text: "Error: npm CLI (npm-cli.js) not found near this Node installation. Ensure Node was installed with npm."
            }],
            isError: true
          };
        }

        const { args } = await buildStrykerArgs(input);
        // If we have args, we need a boundary to separate npm exec args from stryker args
        const boundary = args.length ? ["--"] as const : [];
        // npm exec prefers local bin, auto-installs if missing
        const argv = [npmCli, "exec", "-y", "stryker", "run", ...boundary, ...args];

        await execFileAsync(process.execPath, argv, {
          cwd: input.cwd,
          timeout: timeoutMs,
          shell: false,
          windowsHide: true,
        });

        const reportPath = join(input.cwd, "reports", "mutation", "mutation.json");
        return {
          content: [{ type: "text", text: JSON.stringify({ reportPath, via: "npm exec (npm-cli.js)", argv }, null, 2) }],
          isError: false,
        };
      } catch (err: any) {
        if (err?.killed) {
          return { content: [{ type: "text", text: "Error: Stryker run timed out" }], isError: true };
        }
        let errorMsg = err?.stderr || err?.stdout || err?.message || String(err);
        if (errorMsg.includes("stryker: not found") || errorMsg.includes("Unknown command")) {
          errorMsg =
            "Stryker CLI not found. Add it as a devDependency (`npm i -D @stryker-mutator/core`) " +
            "or allow temporary install via `npm exec -y` (already enabled).";
        }
        if (errorMsg.length > 1200) errorMsg = errorMsg.slice(-1200);
        return { content: [{ type: "text", text: `Error: ${errorMsg.trim()}` }], isError: true };
      }
    }
  );
}
