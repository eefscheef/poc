import { z } from "zod";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
const execAsync = promisify(execCb);
export function registerStrykerRun(server) {
    server.registerTool("strykerRun", {
        title: "Stryker Run (direct)",
        description: "Runs Stryker mutation testing via npx and ensures a JSON report is generated",
        inputSchema: {
            cwd: z.string().describe("Project directory containing tests"),
            files: z.array(z.string()).optional().describe("File glob patterns to mutate"),
            timeout: z.number().optional().describe("Timeout in seconds (default 120)")
        }
    }, async ({ cwd, files, timeout }) => {
        const mutateArg = files && files.length ? `--mutate ${files.join(",")}` : "";
        const cmd = `npx -y stryker run ${mutateArg} --reporters json --logLevel info`;
        const timeoutMs = (timeout ?? 120) * 1000;
        try {
            // Run Stryker
            await execAsync(cmd, { cwd, timeout: timeoutMs });
            // Report path is always reports/mutation/mutation.json
            const reportPath = join(cwd, "reports", "mutation", "mutation.json");
            return {
                content: [{ type: "text", text: JSON.stringify({ reportPath }, null, 2) }]
            };
        }
        catch (err) {
            if (err.killed) {
                return {
                    content: [{ type: "text", text: "Error: Stryker run timed out" }],
                    isError: true
                };
            }
            let errorMsg = err.stderr || err.stdout || err.message;
            if (errorMsg.includes("stryker: not found") || errorMsg.includes("Unknown command")) {
                errorMsg = "Stryker CLI not installed or not available";
            }
            if (errorMsg.length > 500)
                errorMsg = errorMsg.slice(-500);
            return {
                content: [{ type: "text", text: `Error: ${errorMsg.trim()}` }],
                isError: true
            };
        }
    });
}
