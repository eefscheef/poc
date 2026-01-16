# Getting Started with Stryker Test Generator CLI

This guide will help you set up and run the Stryker Test Generator CLI.

## Quick Start

### 1. Install Dependencies

From the repository root:

```bash
npm install
```

### 2. Build All Packages

```bash
npm run build
```

This builds both the MCP server and the CLI application.

### 3. Configure Your LLM Provider

Navigate to the CLI package and create a `.env` file:

```bash
cd packages/cli
cp .env.example .env
```

Edit `.env` and add your API credentials. Choose one of the following:

**Option A: OpenAI**

```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4
```

**Option B: Anthropic**

```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

**Option C: Custom OpenAI-Compatible API**

```env
OPENAI_API_KEY=your-key-here
OPENAI_BASE_URL=https://api.your-provider.com/v1
OPENAI_MODEL=your-model-name
```

### 4. Run the CLI

From the repository root:

```bash
npm run cli
```

Or from the CLI package:

```bash
cd packages/cli
npm start
```

### 5. Follow the Prompts

The CLI will ask you for:

- **Project directory**: Path to your JavaScript/TypeScript project
    - This should be a project with source files and (optionally) existing tests
    - The project should have a `stryker.config.mjs` file

Example:

```
Enter the path to your JavaScript/TypeScript project: ../example-app
```

## Command Line Options

You can also provide arguments directly:

```bash
# From repository root
npm run cli -- generate --project ./packages/example-app --max-iterations 5

# From CLI package
npm start -- generate --project ../example-app --max-iterations 5
```

### Available Options

- `--project <path>`: Path to the project directory (relative or absolute)
- `--max-iterations <number>`: Maximum number of mutation test iterations (default: 4)
- `--model <name>`: Override the LLM model from environment variables

## What Happens During Test Generation

1. **Server Connection**: The CLI connects to two MCP servers:
    - Stryker MCP server (for mutation testing)
    - Filesystem server (for file access)

2. **AI Agent Initialization**: An AI agent is created with your chosen LLM

3. **Test Generation Loop**:
    - Agent analyzes your codebase
    - Generates or improves test files
    - Runs Stryker mutation testing
    - Identifies surviving mutants
    - Improves tests to kill more mutants
    - Repeats until convergence or max iterations

4. **Real-time Output**: Watch the agent work with live streaming output

## Example Session

```
🧪 Stryker Test Generator

Enter the path to your JavaScript/TypeScript project: ../example-app

✓ Project directory: /path/to/poc/packages/example-app
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

[The agent will start working and you'll see:]
- Tool calls being executed
- Files being analyzed
- Tests being written/modified
- Mutation test results
- Improvement iterations

────────────────────────────────────────────────────────
✨ Test generation complete!
```

## Testing with the Example App

The repository includes an example app you can use for testing:

```bash
npm run cli -- generate --project ./packages/example-app
```

This project already has:

- Source files (`fizzbuzz.js`, `isPrime.js`)
- Existing tests
- Stryker configuration

The agent will analyze the existing tests and improve them based on mutation testing results.

## Troubleshooting

### Error: "Stryker MCP server not found"

**Solution**: Make sure you've built the MCP server:

```bash
npm run build
```

### Error: "No API key found"

**Solution**: Create a `.env` file in `packages/cli` with your API key:

```bash
cd packages/cli
cp .env.example .env
# Edit .env and add your key
```

### Error: "Directory does not exist"

**Solution**: Ensure the path to your project is correct. Use absolute paths or paths relative to where you're running the command.

### The agent seems stuck or not making progress

**Solution**:

- Check if your LLM provider API is responding
- Verify you have sufficient API credits
- Try reducing `--max-iterations` for a quicker test
- Check the agent output for error messages

### Tests aren't being generated

**Solution**:

- Ensure your project has a `stryker.config.mjs` file
- Verify the project structure is accessible
- Check that the filesystem MCP server has access to the directory

## Next Steps

1. Try running the CLI on the example app to see how it works
2. Run it on your own project
3. Experiment with different models and iteration counts
4. Review the generated/improved tests
5. Customize the Stryker MCP prompt if needed

## Additional Resources

- [MCP Use Documentation](https://mcp-use.com/docs)
- [Stryker Documentation](https://stryker-mutator.io)
- [Model Context Protocol](https://modelcontextprotocol.io)
