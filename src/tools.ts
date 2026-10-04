import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { relay } from './relay.ts';
import { runNamedSubagent } from './subagents.ts';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, any>;
  };
}

export interface ToolExecutionContext {
  cwd: string;
  signal?: AbortSignal;
  onOutput?: (chunk: string) => void;
}

export interface ToolResult {
  tool_call_id: string;
  name: string;
  output: string;
  isError?: boolean;
}

export const BEURRE_TOOLS: ToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'read',
      description: 'Read the contents of a file with line numbering. Supports offset and limit for large files.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to read (relative to current directory or absolute)' },
          offset: { type: 'number', description: 'Line number to start reading from (1-indexed, default 1)' },
          limit: { type: 'number', description: 'Maximum number of lines to read (default 200)' },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'write',
      description: 'Create a new file or completely overwrite an existing file. Automatically creates parent directories.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to write (relative or absolute)' },
          content: { type: 'string', description: 'The complete content to write into the file' },
        },
        required: ['path', 'content'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'edit',
      description: 'Make precise replacements in a file. Matches exact target string and replaces it.',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'Path to the file to edit' },
          oldText: { type: 'string', description: 'Exact existing text to be replaced (must be unique in file)' },
          newText: { type: 'string', description: 'Replacement text' },
        },
        required: ['path', 'oldText', 'newText'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bash',
      description: 'Execute a bash command in the terminal. Returns standard output and standard error.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
          timeout: { type: 'number', description: 'Timeout in milliseconds (default 30000)' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Search the live web using the Model Aggregator Relay gateway.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'The web search query' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'subagent_run',
      description: 'Delegate a specialized task to a native named subagent with its dedicated persona and model ID.',
      parameters: {
        type: 'object',
        properties: {
          subagent: {
            type: 'string',
            description: 'Name of the subagent to invoke (e.g. Architect, CodeCraft, Reviewer, BugHunter, Scout)',
          },
          task: { type: 'string', description: 'Detailed prompt/instruction for the subagent' },
        },
        required: ['subagent', 'task'],
      },
    },
  },
];

export async function executeTool(
  toolCallId: string,
  name: string,
  args: Record<string, any>,
  ctx: ToolExecutionContext
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'read': {
        const filePath = path.resolve(ctx.cwd, args.path);
        if (!fs.existsSync(filePath)) {
          return { tool_call_id: toolCallId, name, output: `Error: File not found: ${args.path}`, isError: true };
        }
        const stat = fs.statSync(filePath);
        if (stat.isDirectory()) {
          const files = fs.readdirSync(filePath);
          return {
            tool_call_id: toolCallId,
            name,
            output: `Directory: ${args.path}\nEntries:\n${files.slice(0, 100).map((f) => `  - ${f}`).join('\n')}`,
          };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');
        const offset = Math.max(1, parseInt(args.offset, 10) || 1);
        const limit = Math.max(1, parseInt(args.limit, 10) || 200);
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join('\n');
        const total = lines.length;
        const msg = `[File: ${args.path} (${total} total lines)]\n${numbered}${offset - 1 + limit < total ? `\n... (${total - (offset - 1 + limit)} lines remaining)` : ''}`;
        return { tool_call_id: toolCallId, name, output: msg };
      }

      case 'write': {
        const filePath = path.resolve(ctx.cwd, args.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, args.content, 'utf-8');
        return { tool_call_id: toolCallId, name, output: `Successfully wrote ${args.content.length} characters to ${args.path}` };
      }

      case 'edit': {
        const filePath = path.resolve(ctx.cwd, args.path);
        if (!fs.existsSync(filePath)) {
          return { tool_call_id: toolCallId, name, output: `Error: File not found: ${args.path}`, isError: true };
        }
        const content = fs.readFileSync(filePath, 'utf-8');
        const { oldText, newText } = args;
        if (!oldText) {
          return { tool_call_id: toolCallId, name, output: 'Error: oldText is required for edit', isError: true };
        }
        const count = content.split(oldText).length - 1;
        if (count === 0) {
          return { tool_call_id: toolCallId, name, output: `Error: oldText was not found in ${args.path}`, isError: true };
        }
        if (count > 1) {
          return {
            tool_call_id: toolCallId,
            name,
            output: `Error: oldText appears ${count} times in ${args.path}. Please provide a larger unique context chunk.`,
            isError: true,
          };
        }
        const updated = content.replace(oldText, newText ?? '');
        fs.writeFileSync(filePath, updated, 'utf-8');
        return { tool_call_id: toolCallId, name, output: `Successfully edited ${args.path}` };
      }

      case 'bash': {
        const command = args.command;
        const timeout = args.timeout || 30000;
        return await new Promise<ToolResult>((resolve) => {
          let stdout = '';
          let stderr = '';
          const proc = spawn('bash', ['-c', command], {
            cwd: ctx.cwd,
            env: { ...process.env, PAGER: 'cat' },
          });

          let timer: Timer | null = setTimeout(() => {
            proc.kill('SIGTERM');
            resolve({
              tool_call_id: toolCallId,
              name,
              output: `Command timed out after ${timeout}ms\nStdout:\n${stdout}\nStderr:\n${stderr}`,
              isError: true,
            });
          }, timeout);

          proc.stdout?.on('data', (d) => {
            stdout += d.toString();
            ctx.onOutput?.(d.toString());
          });

          proc.stderr?.on('data', (d) => {
            stderr += d.toString();
            ctx.onOutput?.(d.toString());
          });

          proc.on('close', (code) => {
            if (timer) clearTimeout(timer);
            const output = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
            resolve({
              tool_call_id: toolCallId,
              name,
              output: output.trim() || `(Process exited with code ${code})`,
              isError: code !== 0,
            });
          });

          proc.on('error', (err) => {
            if (timer) clearTimeout(timer);
            resolve({
              tool_call_id: toolCallId,
              name,
              output: `Execution error: ${err.message}`,
              isError: true,
            });
          });
        });
      }

      case 'web_search': {
        const result = await relay.webSearch(args.query);
        return { tool_call_id: toolCallId, name, output: result };
      }

      case 'subagent_run': {
        const subagentName = args.subagent;
        const task = args.task;
        const subResult = await runNamedSubagent(subagentName, task, ctx.cwd);
        return {
          tool_call_id: toolCallId,
          name,
          output: `[Subagent ${subagentName} Result]:\n${subResult.summary}`,
        };
      }

      default:
        return {
          tool_call_id: toolCallId,
          name,
          output: `Unknown tool: ${name}`,
          isError: true,
        };
    }
  } catch (err: any) {
    return {
      tool_call_id: toolCallId,
      name,
      output: `Tool error: ${err.message}`,
      isError: true,
    };
  }
}
