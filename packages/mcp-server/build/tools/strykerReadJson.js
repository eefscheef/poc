import { z } from "zod";
import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
// Summarize using aggregated fields if present
function summarizeFromKnownFields(json) {
    const score = json?.mutationScore ??
        json?.metrics?.mutationScore ??
        json?.systemUnderTestMetrics?.mutationScore;
    const totals = json?.totals ??
        json?.metrics ??
        json?.systemUnderTestMetrics;
    if (score == null && totals == null)
        return undefined;
    const totalMutants = totals?.totalMutants ?? totals?.total;
    const killed = totals?.killed ?? totals?.killedMutants;
    const survived = totals?.survived ?? totals?.survivedMutants;
    const timeout = totals?.timeout ?? totals?.timeoutMutants;
    const noCoverage = totals?.noCoverage ?? totals?.noCoverageMutants;
    return {
        mutationScore: score,
        totalMutants,
        killedMutants: killed,
        survivedMutants: survived,
        timeoutMutants: timeout,
        noCoverageMutants: noCoverage
    };
}
// Summarize by walking files/mutants
function summarizeByCounting(json) {
    let killed = 0, survived = 0, timeout = 0, noCoverage = 0, total = 0;
    const files = json?.files ?? {};
    for (const key of Object.keys(files)) {
        const mutants = files[key]?.mutants ?? [];
        for (const m of mutants) {
            total += 1;
            switch (m?.status) {
                case "Killed":
                    killed++;
                    break;
                case "Survived":
                    survived++;
                    break;
                case "Timeout":
                    timeout++;
                    break;
                case "NoCoverage":
                    noCoverage++;
                    break;
                default: break;
            }
        }
    }
    const tested = killed + survived + timeout;
    const mutationScore = tested > 0 ? ((killed + timeout) / tested) * 100 : undefined;
    return { mutationScore, killedMutants: killed, survivedMutants: survived, timeoutMutants: timeout, noCoverageMutants: noCoverage, totalMutants: total };
}
export function registerStrykerReadJson(server) {
    server.registerTool("strykerReadJson", {
        title: "Read Stryker JSON report",
        description: "Reads the Stryker JSON report file and returns the raw JSON plus a computed summary",
        inputSchema: {
            cwd: z.string().describe("Project directory"),
            path: z.string().optional().describe("Path to report JSON (defaults to reports/mutation/mutation.json)")
        }
    }, async ({ cwd, path }) => {
        try {
            const root = resolve(process.cwd(), cwd);
            const reportPath = resolve(root, path ?? join("reports", "mutation", "mutation.json"));
            await access(reportPath);
            const raw = await readFile(reportPath, "utf8");
            const obj = JSON.parse(raw);
            const summary = summarizeFromKnownFields(obj) ?? summarizeByCounting(obj);
            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify({ reportPath, summary }, null, 2),
                    },
                    {
                        type: "text",
                        text: raw,
                    }
                ],
                isError: false
            };
        }
        catch (e) {
            let msg = e?.message || String(e);
            if (msg.length > 500)
                msg = msg.slice(-500);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error: ${msg}`
                        // Add _meta if needed, or leave out
                    }
                ],
                isError: true
            };
        }
    });
}
