import { z } from "zod";
import { exec as execCb } from "node:child_process";
import { promisify } from "node:util";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {type StrykerRunInput, ZStrykerRunInput, ZStrykerRunInputShape} from "../schemas/strykerRunInput.ts";
import {buildStrykerArgs} from "../utils/buildStrykerArgs.ts";
import {createStrykerServer} from "../stryker/startStrykerServer.ts";

const execAsync = promisify(execCb);

export function registerStrykerServe(server: McpServer) {
    server.registerTool(
        "strykerServe",
        {
            title: "Stryker serve (over stdio)",
            description:
                "Starts the Stryker server on the stdio channel.",
            inputSchema: {},
        },
        async (rawInput) => {
            // (ensure that StrykerJS is installed locally so the binary exists)
            const server = createStrykerServer({ path: 'node_modules/.bin/stryker' });
            server.init().then(async () => {
                const discovery = await server.discover();
                console.log(discovery);
                // Start mutation test
                server.mutationTest({}).subscribe({ next: console.log, complete: () => server.dispose() });
            });

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
