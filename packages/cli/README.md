# Stryker Test Generator CLI

An automated test generation tool powered by AI agents and mutation testing. This CLI uses the Model Context Protocol (MCP) to orchestrate Stryker mutation testing with an AI agent that iteratively improves your test suite.

## Features

- 🤖 **AI-Powered Test Generation**: Uses LLM agents to automatically write and improve tests
- 🧬 **Mutation Testing**: Leverages Stryker to find weaknesses in your test suite
- 🔄 **Iterative Improvement**: Automatically refines tests based on mutation analysis results
- 🌐 **Multi-Server MCP**: Integrates Stryker MCP server with filesystem access
- 🎯 **Flexible LLM Support**: Works with OpenAI, Anthropic, or any OpenAI-compatible API

## Prerequisites

- Node.js 18 or higher
- A JavaScript/TypeScript project with Stryker configured
- API key for OpenAI, Anthropic, or compatible LLM provider

## Installation

```bash
# From the monorepo root
npm install

# Build the MCP server and CLI
npm run build
```

## Configuration

Create a `.env` file in the CLI package directory (use `.env.example` as a template):

### OpenAI Configuration

```env
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4  # or gpt-4-turbo, gpt-3.5-turbo, etc.
```

### Anthropic Configuration

```env
ANTHROPIC_API_KEY=your-anthropic-api-key
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### Custom OpenAI-Compatible Endpoint

```env
OPENAI_API_KEY=your-api-key
OPENAI_BASE_URL=https://your-custom-endpoint.com/v1
OPENAI_MODEL=your-model-name
```

## Usage

### Interactive Mode

```bash
npm start
```

The CLI will prompt you for:
- Project directory path
- Number of iterations (optional)

### Command Line Mode

```bash
# Generate tests with default settings
npm start -- generate --project /path/to/your/project

# Specify maximum iterations
npm start -- generate --project /path/to/your/project --max-iterations 5

# Override the model
npm start -- generate --project /path/to/your/project --model gpt-4-turbo
```

### Options

- `-p, --project <path>`: Path to the project directory
- `-m, --max-iterations <number>`: Maximum number of mutation test iterations (default: 4)
- `--model <name>`: Override the LLM model specified in environment variables

## How It Works

1. **Initialization**: The CLI connects to two MCP servers:
   - **Stryker MCP Server**: Provides mutation testing capabilities
   - **Filesystem Server**: Allows the agent to read and write files in your project

2. **Agent Setup**: Creates an AI agent connected to your chosen LLM provider

3. **Test Generation Workflow**:
   - The agent analyzes your codebase
   - Generates initial test files
   - Runs Stryker mutation testing
   - Identifies surviving mutants (weaknesses in tests)
   - Iteratively improves tests to kill more mutants
   - Continues until all mutants are killed or max iterations reached

4. **Real-time Feedback**: Watch the agent work with streaming output showing:
   - Tool calls being made
   - Files being analyzed and modified
   - Mutation test results
   - Test improvements being applied

## Project Structure

```
packages/cli/
├── src/
│   ├── index.ts              # CLI entry point
│   └── commands/
│       └── generate.ts       # Test generation command
├── build/                    # Compiled JavaScript (generated)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## Development

```bash
# Watch mode for development
npm run dev

# Build
npm run build

# Run the built CLI
npm start
```

## Example Output

```
🧪 Stryker Test Generator

✓ Project directory: /path/to/your/project
✓ Max iterations: 4

✓ LLM initialized (OpenAI - gpt-4)
✓ Connected to MCP servers (Stryker + Filesystem)
✓ AI agent ready
✓ Test generation prompt loaded

📋 Starting test generation process...

The agent will:
  1. Analyze your codebase
  2. Generate initial tests
  3. Run mutation testing
  4. Iteratively improve tests based on surviving mutants

────────────────────────────────────────────────────────
Agent Output:
────────────────────────────────────────────────────────

[Real-time agent output with syntax highlighting...]

────────────────────────────────────────────────────────
✨ Test generation complete!
```

## Troubleshooting

### "Stryker MCP server not found"

Make sure you've built the MCP server:
```bash
cd packages/mcp-server
npm run build
```

### "No API key found"

Ensure you've created a `.env` file with the appropriate API key:
```bash
cp .env.example .env
# Edit .env and add your API key
```

### "Directory does not exist"

Verify the path to your project is correct and accessible.

## Related Packages

- [mcp-server](../mcp-server/README.md) - The Stryker MCP server implementation
- [example-app](../example-app/README.md) - Example project for testing

## License

Private
