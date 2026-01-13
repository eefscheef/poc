# Stryker MCP Server & AI Test Generator

This repository contains:
1. **MCP Server** ([packages/mcp-server](packages/mcp-server)) - A Model Context Protocol server that exposes Stryker mutation testing tools for LLM Agents
2. **CLI Application** ([packages/cli](packages/cli)) - This is where we launch an agent, the Stryker MCP server, and prompt it to generate tests for an existing software package
3. **Example App** ([packages/example-app](packages/example-app)) - A sample JavaScript project for testing


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


### cli

### example-app

## Testing the project

**Important note!! Even if the project is configured correctly, the CLI doesn't generate full test suites, instead the agent's token stream is cut off after 1000 tokens, and no test files are ever edited** 

I am still debugging the problem. If you want to get a feel for what is supposed to happen, you can run the Stryker MCP server in VSCode. Go to .vscode/mcp.json, press 'start' above stryker-mcp-server. Next, use the built-in through copilot chat by typing /mcp.stryker-mcp-server.strykerPrompt 

You will be prompted for a projectDir, paste the absolute path to example-app in there. Next, enter your desired number of iterations (2 should be fine for example-app), and watch Copilot run mutation testing and close the intentional gap left in example-app's test suite.

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Configure the CLI

```bash
cp .env.example .env
# Edit .env and add your Google, OpenAI or Anthropic API key
```

### 3. Run the Test Generator

```bash
# From repository root
npm run cli -- generate --project ./packages/example-app --max-iterations 2 --provider google
# consult packages/cli/index.ts for the allowed arguments
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

