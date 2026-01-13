# Stryker MCP Server & AI Test Generator

This repository contains:
1. **MCP Server** ([packages/mcp-server](packages/mcp-server)) - A Model Context Protocol server that exposes Stryker mutation testing tools to LLM Agents
2. **CLI Application** ([packages/cli](packages/cli)) - This is where we launch an agent, the Stryker MCP server, and prompt it to generate tests for an existing software package
3. **Example App** ([packages/example-app](packages/example-app)) - A sample JavaScript project for testing. 


## Project structure

```
.
└─ packages/
   ├─ mcp-server/                   # MCP server (TypeScript)
   │  ├─ src/
   │  │  ├─ index.ts                # entrypoint
   │  │  ├─ tools/                  # stryker tools 
   │  │  ├─ prompts/                # test generation prompt
   │  │  └─ stryker/                # stryker server implementation
   │  └─ package.json
   │
   ├─ cli/                          # AI-powered test generator CLI
   │  ├─ src/
   │  │  ├─ index.ts                # CLI entry point
   │  │  └─ commands/generate.ts    # test generation logic
   │  ├─ GETTING_STARTED.md         # detailed usage guide
   │  └─ package.json
   │
   └─ example-app/                  # Example JavaScript project
      ├─ src/                       # fizzbuzz + isPrime
      ├─ test/                      # unit tests
      ├─ stryker.config.mjs         # stryker configuration
      └─ package.json
```

### mcp-server
This is where we turn [StrykerJS](https://stryker-mutator.io/docs/stryker-js/introduction/) into an MCP server. Conveniently, Stryker has recently introduced and implemented the [Mutation Server Protocol](https://github.com/stryker-mutator/editor-plugins/tree/main/packages/mutation-server-protocol), which fits our use case nicely. It allows you to start a Stryker mutation server in a workspace, and then repeatedly ask it to mutation test certain files in the system. This will greatly reduce the overhead of iterating over multiple mutation analysis phases in order to have the agent maximize mutation score. 

We also store a [prompt](packages\mcp-server\src\prompts\testGenerationPrompt.ts) on this MCP server. It contains detailed instructions for an LLM agent. Its goal is to improve the test suite of a project (passed as a parameter to the prompt), through a maximum of n (also a parameter) iterations of mutation analysis into test case generation/refinement. 

### cli
This is where we tie an LLM agent to the MCP servers (Stryker, Filesystem, and eventually a custom built control flow MCP server). Currently, the full test generation/iteration loop is not working, so the expected behaviour can be demo'd with VS Code Copilot. The next section contains more details on how to do this. 

### example-app
This is a simple JS project, which only exports the FizBuzz and isPrime functions, together with an existing test suite. There is an intentional gap: the isPrime test cases for n <= 1 are missing, resulting in a lower mutation score. For Copilot, addressing this gap shouldn't be a problem anyhow, but consider removing this section of the readme from the context before trying it out, because it can provide an unfair hint.

## Testing the project

**Important note!! Even if the project is configured correctly, the CLI doesn't generate full test suites, instead the agent's token stream is cut off after 1000 tokens, and no test files are ever edited** 

I am still debugging the problem. If you want to get a feel for what is supposed to happen, you can run the Stryker MCP server with VSCode Copilot: Go to [.vscode/mcp.json](.vscode/mcp.json) and press 'start' above stryker-mcp-server. Next, use the built-in prompt through Copilot chat by typing ```/mcp.stryker-mcp-server.strykerPrompt```

You will be prompted for a projectDir, paste the absolute path to example-app in there. Next, enter your desired number of iterations (2 should be fine for example-app), and watch Copilot run mutation testing and close the intentional gap left in example-app's test suite.

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Provide your LLM API key

```bash
cp .env.example .env
# Edit .env and add your Google, OpenAI or Anthropic API key
```

### 3. Run the Test Generator
consult [index.ts](packages/cli/src/index.ts) for the allowed arguments

```bash
# From repository root
npm run cli -- generate --project ./packages/example-app --max-iterations 2 --provider google
```


## Troubleshooting

**Build fails**: Ensure you're using Node.js 18 or higher
```bash
node --version  # Should be v18.0.0 or higher
```

**MCP server not found**: Build the MCP server first
```bash
npm run build
```


## License

Private

