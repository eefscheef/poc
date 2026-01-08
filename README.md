# Stryker MCP Server & AI Test Generator

This repository contains:
1. **MCP Server** ([packages/mcp-server](packages/mcp-server)) - A Model Context Protocol server that exposes Stryker mutation testing tools
2. **CLI Application** ([packages/cli](packages/cli)) - An AI-powered CLI that uses the MCP server to automatically generate and improve tests
3. **Example App** ([packages/example-app](packages/example-app)) - A sample JavaScript project for testing

## Quick Start

### 1. Install & Build

```bash
npm install
npm run build
```

### 2. Configure the CLI

```bash
cd packages/cli
cp .env.example .env
# Edit .env and add your OpenAI or Anthropic API key
```

### 3. Run the Test Generator

```bash
# From repository root
npm run cli

# Or use command line options
npm run cli -- generate --project ./packages/example-app --max-iterations 5
```

Follow the prompts to generate tests for your project!

📖 **See [packages/cli/GETTING_STARTED.md](packages/cli/GETTING_STARTED.md) for detailed instructions.**

## What's inside

```
.
└─ packages/
   ├─ mcp-server/                   # MCP server (TypeScript)
   │  ├─ src/
   │  │  ├─ index.ts                # entrypoint
   │  │  ├─ tools/                  # stryker tools (discover, mutate, etc.)
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

## Features

### 🔌 MCP Server
- **Tool Discovery**: Expose Stryker mutation testing capabilities via MCP protocol
- **Mutation Analysis**: Run mutation tests and get detailed results
- **Test Generation Prompt**: Pre-built prompt for iterative test improvement
- **Standards Compliant**: Full MCP protocol support

### 🤖 CLI Application  
- **AI-Powered**: Uses LLM agents to write and improve tests automatically
- **Iterative Improvement**: Runs mutation testing and refines tests based on results
- **Multi-LLM Support**: Works with OpenAI, Anthropic, or any OpenAI-compatible endpoint
- **Real-time Feedback**: Stream agent progress with syntax highlighting
- **Dual MCP Integration**: Connects to both Stryker and filesystem MCP servers

### 🎯 How It Works

1. **Analyze**: The AI agent analyzes your codebase using the filesystem MCP server
2. **Generate**: Creates comprehensive unit tests for your code
3. **Mutate**: Runs Stryker mutation testing to find weaknesses
4. **Improve**: Iteratively improves tests to kill surviving mutants
5. **Converge**: Continues until mutation score is high or max iterations reached

## Usage Scenarios

### As a CLI Tool (Recommended)

The easiest way to use this project is with the CLI:

```bash
# Interactive mode - you'll be prompted for options
npm run cli

# Direct mode - provide all options upfront  
npm run cli -- generate \
  --project ./my-project \
  --max-iterations 5 \
  --model gpt-4
```

### As a Standalone MCP Server

The MCP server can be used with any MCP client (VS Code Copilot, Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "stryker": {
      "command": "node",
      "args": ["path/to/packages/mcp-server/build/index.js"]
    }
  }
}
```

Then use the exposed tools and prompts in your MCP-compatible agent.

## Documentation

- [CLI Getting Started Guide](packages/cli/GETTING_STARTED.md) - Complete setup and usage instructions
- [MCP Server](packages/mcp-server/README.md) - MCP server documentation
- [Example App](packages/example-app/README.md) - Sample project details

## Architecture

```
┌─────────────┐
│   CLI App   │  
│             │  
│  Commander  │───┐
│  Inquirer   │   │
└─────────────┘   │
                  │
                  ▼
         ┌────────────────┐
         │   mcp-use      │
         │                │
         │  MCPClient     │
         │  MCPAgent      │
         └────────────────┘
                  │
        ┌─────────┴─────────┐
        │                   │
        ▼                   ▼
┌──────────────┐    ┌──────────────┐
│ Stryker MCP  │    │ Filesystem   │
│   Server     │    │ MCP Server   │
│              │    │              │
│ - discover   │    │ - read_file  │
│ - mutate     │    │ - write_file │
│ - configure  │    │ - list_dir   │
└──────────────┘    └──────────────┘
        │
        ▼
┌──────────────┐
│   Stryker    │
│   Mutator    │
└──────────────┘
```

## Prerequisites

- **Node.js** ≥ 18  
- **npm** workspaces support
- **API Key** for OpenAI, Anthropic, or compatible provider

## Development

```bash
# Install dependencies
npm install

# Build all packages
npm run build

# Run tests
npm test

# Build in watch mode (for development)
cd packages/mcp-server && npm run dev
cd packages/cli && npm run dev
```

## Example: Testing the Example App

The repository includes a pre-configured example app perfect for testing:

```bash
# Build everything
npm run build

# Configure your API key
cd packages/cli
echo "OPENAI_API_KEY=sk-your-key" > .env
cd ../..

# Run the generator on the example app
npm run cli -- generate --project ./packages/example-app --max-iterations 3
```

The agent will:
1. Analyze `fizzbuzz.js` and `isPrime.js`
2. Review existing tests
3. Run mutation testing
4. Improve tests to achieve higher mutation coverage

## Troubleshooting

**Build fails**: Ensure you're using Node.js 18 or higher
```bash
node --version  # Should be v18.0.0 or higher
```

**Dependencies conflict**: Clear and reinstall
```bash
rm -rf node_modules packages/*/node_modules
npm install --legacy-peer-deps
npm run build
```

**MCP server not found**: Build the MCP server first
```bash
npm run build
```

See the [CLI troubleshooting section](packages/cli/GETTING_STARTED.md#troubleshooting) for more help.

## License

Private

## Contributing

This is a proof of concept. For production use, consider:
- Adding proper error handling and retries
- Implementing rate limiting for LLM calls
- Adding support for more test frameworks
- Extending to other languages (Java, C#, etc.)
- Improving the test generation prompt
- Adding telemetry and logging
