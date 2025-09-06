import { z } from "zod";
import { readFile, access } from "node:fs/promises";
import { join, resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// --- NEW: official schema types & metrics
import type { MutationTestResult } from "mutation-testing-report-schema";
import { calculateMutationTestMetrics } from "mutation-testing-metrics";

// --- OPTIONAL: runtime validation using the published schema
//    Requires tsconfig: "resolveJsonModule": true and Node ESM/ESNext modules.
import { schema } from "mutation-testing-report-schema";
import { Ajv, type ValidateFunction } from "ajv";

const ajv = new Ajv({ allErrors: true, strict: false });
const validateReport: ValidateFunction<MutationTestResult> =
  ajv.compile<MutationTestResult>(schema);

// Types you already expose
type Summary = {
  mutationScore?: number;
  killedMutants?: number;
  survivedMutants?: number;
  timeoutMutants?: number;
  noCoverageMutants?: number;
  totalMutants?: number;
};

// Build a Summary from the metrics helper in the Stryker API
function summarizeWithOfficialMetrics(report: MutationTestResult): Summary {
  const result = calculateMutationTestMetrics(report);
  const m = result.systemUnderTestMetrics.metrics; // top-level aggregated metrics
  return {
    mutationScore: m.mutationScore,            // %
    totalMutants: m.totalMutants,
    killedMutants: m.killed,
    survivedMutants: m.survived,
    timeoutMutants: m.timeout,
    noCoverageMutants: m.noCoverage
  };
}

// ✅ Runtime validator -> TypeScript type guard
function isMutationTestResult(data: unknown): data is MutationTestResult {
  return !!validateReport(data);
}

export function registerStrykerReadJson(server: McpServer) {
  server.registerTool(
    "strykerReadJson",
    {
      title: "Read Stryker JSON report",
      description:
        "Reads the Stryker JSON report file and returns the raw JSON plus a computed summary (validated against the official schema).",
      inputSchema: {
        cwd: z.string().describe("Project directory"),
        path: z
          .string()
          .optional()
          .describe("Path to report JSON (defaults to reports/mutation/mutation.json)"),
      },
    },
    async ({ cwd, path }) => {
      try {
        const root = resolve(process.cwd(), cwd);
        const reportPath = resolve(
          root,
          path ?? join("reports", "mutation", "mutation.json")
        );
        await access(reportPath);
        const raw = await readFile(reportPath, "utf8");

        // Parse once
        const parsed = JSON.parse(raw) as unknown;

        // Validate with Ajv
        if (!isMutationTestResult(parsed)) {
          const errors =
            validateReport.errors?.map((e) => `${e.instancePath} ${e.message}`).join("\n") ??
            "Unknown schema validation error";
          return {
            content: [{ type: "text", text: `Error: The report does not match the schema.\n${errors.slice(0, 5000)}` }],
            isError: true,
          };
        }

        // Now we know it's a valid MutationTestResult
        const report = parsed as MutationTestResult;

        // Compute metrics via the API helper
        const summary = summarizeWithOfficialMetrics(report);

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({ reportPath, summary }, null, 2),
            },
            {
              type: "text",
              text: raw, // original JSON
            },
          ],
          isError: false,
        };
      } catch (e: any) {
        let msg = e?.message || String(e);
        if (msg.length > 500) msg = msg.slice(-500);
        return {
          content: [
            {
              type: "text",
              text: `Error: ${msg}`,
            },
          ],
          isError: true,
        };
      }
    }
  );
}
