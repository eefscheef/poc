import inquirer from 'inquirer';
import path from 'path';
import { existsSync } from 'fs';

export async function getProjectDirectory(
  providedPath?: string
): Promise<string> {
  if (providedPath) {
    const resolved = path.resolve(providedPath);
    if (!existsSync(resolved)) {
      throw new Error(`Project directory does not exist: ${resolved}`);
    }
    return resolved;
  }

  const { projectDirectory } = await inquirer.prompt([
    {
      type: 'input',
      name: 'projectDirectory',
      message: 'Enter the path to your JS/TS project:',
      default: process.cwd(),
      validate: input =>
        existsSync(path.resolve(input))
          ? true
          : 'Directory does not exist',
    },
  ]);

  return path.resolve(projectDirectory);
}
