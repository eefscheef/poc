import { MCPClient } from 'mcp-use';

export async function loadStrykerPrompt(
  client: MCPClient,
  projectDirectory: string,
  maxIterations: number
): Promise<string> {
  const session = client.getSession('stryker');
  if (!session) throw new Error('Stryker session not found');

  const { prompts } = await session.listPrompts();
  if (!prompts.find(p => p.name === 'strykerPrompt')) {
    throw new Error('strykerPrompt not found');
  }

  const result = await session.getPrompt('strykerPrompt', {
    projectDirectory,
    maxIterations: String(maxIterations),
  });

  return result.messages
    .map(m =>
      typeof m.content === 'string'
        ? m.content
        : 'text' in m.content
          ? m.content.text
          : ''
    )
    .filter(Boolean)
    .join('\n\n');
}
