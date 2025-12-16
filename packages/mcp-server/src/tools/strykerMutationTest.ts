import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { StrykerServer } from "../stryker/server/StrykerServer.js";
import {
  MutationTestParams,
  MutationTestResult,
} from "mutation-server-protocol";
import { lastValueFrom } from "rxjs";

export function registerStrykerMutationTest(
  mcpServer: McpServer,
  strykerServer: StrykerServer,
) {
  mcpServer.registerTool(
    "strykerMutationTest",
    {
      title: "Stryker Mutation Test",
      description: "Run mutation testing via Stryker and stream progress.",
      inputSchema: MutationTestParams.shape,
      outputSchema: MutationTestResult.shape,
    },
    (rawInput, extra) =>
      strykerMutationTestHandler(rawInput, strykerServer, extra),
  );
}

async function strykerMutationTestHandler(
  args: MutationTestParams,
  strykerServer: StrykerServer,
  extra: {
    sendNotification: (notification: any) => Promise<void>;
    _meta?: { progressToken?: string | number };
  },
): Promise<CallToolResult> {
  if (!strykerServer.isInitialized()) {
    return {
      content: [
        {
          type: "text",
          text: "Stryker server is not initialized. Call strykerStart first.",
        },
      ],
      isError: true,
    };
  }

  try {
    const progressToken = extra._meta?.progressToken;
    console.error(`[strykerMutationTest] Starting mutation test. ProgressToken: ${progressToken}, Args:`, JSON.stringify(args));

    // Start the observable — this will emit both progress and final
    const observable = strykerServer.mutationTest(args);

    let progressEventCount = 0;
    const aggregatedFiles: MutationTestResult['files'] = {};
    
    // Subscribe for progress updates
    const progressSub = observable.subscribe({
      next(progressNotification: MutationTestResult) {
        progressEventCount++;
        // console.error(`[strykerMutationTest] Event data:`, JSON.stringify(progressNotification));
        
        // Aggregate file results from progress notifications
        if (progressNotification.files) {
          for (const [filePath, fileResult] of Object.entries(progressNotification.files)) {
            if (!aggregatedFiles[filePath]) {
              aggregatedFiles[filePath] = { mutants: [] };
            }
            // Merge mutants arrays, avoiding duplicates by ID
            const existingIds = new Set(aggregatedFiles[filePath].mutants.map(m => m.id));
            for (const mutant of fileResult.mutants) {
              if (!existingIds.has(mutant.id)) {
                aggregatedFiles[filePath].mutants.push(mutant);
              }
            }
          }
        }
        
        if (progressToken !== undefined) {
          // console.error(`[strykerMutationTest] Sending progress notification to MCP client with token ${progressToken}`);
          extra.sendNotification({
            method: "notifications/progress",
            params: {
              progressToken,
              message: `Mutation testing event #${progressEventCount}`,
              progress: progressEventCount,
            },
          }).catch((err) => {
            console.error(
              "[strykerMutationTest] sendNotification failed",
              err,
            );
          });
        } else {
          // No progress token, so we skip sending progress notifications
          console.error("[strykerMutationTest] No progressToken - skipping MCP notification");
        }
      },
      complete() {
        console.error("[strykerMutationTest] observable complete");
      },
    });

    // Await the final resolved result from the observable
    const finalResult: MutationTestResult = await lastValueFrom(observable);

    progressSub.unsubscribe();

    // Aggregate progress updates into final result: the final result we get from Stryker Server is otherwise empty
    const result: MutationTestResult = {
      ...finalResult,
      files: Object.keys(aggregatedFiles).length > 0 ? aggregatedFiles : finalResult.files,
    };

    // Optionally write JSON report to a temp file and return as a resource
    // const reportPath = path.join(os.tmpdir(), `${uuid()}.mutation-report.json`);
    // await writeFile(reportPath, JSON.stringify(result, null, 2), "utf-8");

    return {
      content: [
        {
          type: "resource",
          resource: {
            uri: `file://${reportPath}`,
            text: JSON.stringify(result, null, 2),
            mimeType: "application/json",
          },
        },
      ],
      structuredContent: result,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      content: [
        {
          type: "text",
          text: `Error running mutation test: ${msg}`,
        },
      ],
      isError: true,
    };
  }
}

