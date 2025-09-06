import { z } from "zod";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
const execAsync = promisify(execCb);

export function registerStrykerMutate(server: McpServer) {
  server.registerTool(
    "strykerMutate",
    {
      title: "Stryker Mutate (npm script)",
      description: "Runs `npm run mutate` in the given directory if the script exists",
      inputSchema: {
        cwd: z.string().describe("Directory containing package.json"),
        timeout: z.number().optional().describe("Timeout in seconds (default 900)")
      }
    },
    async ({ cwd, timeout }) => {
      try {
        const dir = resolve(process.cwd(), cwd);
        const pkg = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
        const hasScript = !!pkg?.scripts?.mutate;

        if (!hasScript) {
          return {
            content: [{
              type: "text",
              text: `No 'mutate' script found in ${join(dir, "package.json")}. ` +
                    `Add one (e.g. "mutate": "stryker run") or use the 'strykerRun' tool.`
            }],
            isError: true
          };
        }

        const to = Math.max(30, Math.min(timeout ?? 900, 7200)) * 1000;
        await execAsync("npm run mutate", { cwd: dir, timeout: to });

        return {
          content: [{ type: "text", text: JSON.stringify({ cwd: dir, ok: true }) }]
        };
      } catch (e: any) {
        let msg = e?.stderr || e?.stdout || e?.message || String(e);
        if (msg.length > 500) msg = msg.slice(-500);
        return { content: [{ type: "text", text: `Error: ${msg}` }], isError: true };
      }
    }
  );
}
