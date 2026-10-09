import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import type { AgentTool, AgentToolResult } from '@oh-my-pi/pi-agent-core';
import type { TSchema } from '@oh-my-pi/pi-ai';
import { relay } from './relay.ts';
import { runNamedSubagent } from './subagents.ts';
import { generateDiffCard } from './diff.ts';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
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
  diff?: string;
}

export interface OmpToolHooks {
  onOutput?: (chunk: string) => void;
}

/** File extension for a generated image, keyed by the MIME type the provider returned. */
const IMAGE_EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};

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
            description: 'Name of the subagent to invoke (e.g. Architect, CodeCraft, Reviewer, BugHunter, Scout, Visionary)',
          },
          task: { type: 'string', description: 'Detailed prompt/instruction for the subagent' },
        },
        required: ['subagent', 'task'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'generate_image',
      description: 'Generate an image using AI image models via the Relay Gateway, save to a file path, and return the local path for use in apps or UI.',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'Detailed prompt describing the image to generate' },
          outputPath: { type: 'string', description: 'Optional relative or absolute file path to save image (defaults to assets/image_<timestamp>.png)' },
          size: { type: 'string', description: 'Image resolution (e.g. "1024x1024", "512x512")' },
        },
        required: ['prompt'],
      },
    },
  },
];

/**
 * Adapt Beurre's intentionally tiny tool surface to OMP's agent-core
 * contract. This keeps the OMP loop, schema validation, native tool calls,
 * and steering machinery while avoiding the full omp coding-agent bundle.
 */
export function createOmpTools(cwd: string, getHooks: () => OmpToolHooks = () => ({})): AgentTool[] {
  return BEURRE_TOOLS.map((definition) => {
    const name = definition.function.name;
    return {
      name,
      label: name,
      description: definition.function.description,
      parameters: definition.function.parameters as TSchema,
      execute: async (toolCallId: string, params: unknown, signal?: AbortSignal): Promise<AgentToolResult> => {
        const args = params && typeof params === 'object' ? (params as Record<string, any>) : {};
        const result = await executeTool(toolCallId, name, args, {
          cwd,
          signal,
          onOutput: (chunk) => getHooks().onOutput?.(chunk),
        });
        return {
          content: [{ type: 'text', text: result.output }],
          ...(result.diff ? { details: { diff: result.diff } } : {}),
          ...(result.isError ? { isError: true } : {}),
        };
      },
    } as AgentTool;
  });
}

export function truncateLogOutput(text: string, headCount = 50, tailCount = 150): string {
  const lines = text.split('\n');
  if (lines.length <= headCount + tailCount) {
    return text;
  }
  const head = lines.slice(0, headCount);
  const tail = lines.slice(-tailCount);
  const omitted = lines.length - headCount - tailCount;
  return [
    ...head,
    `... [${omitted} lines omitted by Beurre tool manager] ...`,
    ...tail,
  ].join('\n');
}

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
          const files = fs.readdirSync(filePath, { withFileTypes: true });
          const entries = files.slice(0, 100).map((f) => {
            const tag = f.isDirectory() ? '[dir]' : '[file]';
            return `  - ${tag} ${f.name}`;
          }).join('\n');
          return {
            tool_call_id: toolCallId,
            name,
            output: `Directory: ${args.path} (${files.length} items)\nEntries:\n${entries}${files.length > 100 ? `\n... (+${files.length - 100} more items)` : ''}`,
          };
        }
        // Detect binary files by common extensions or null bytes in header
        const ext = path.extname(filePath).toLowerCase();
        const binaryExts = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.zip', '.tar', '.gz', '.wasm', '.node', '.exe', '.bin']);
        if (binaryExts.has(ext)) {
          return {
            tool_call_id: toolCallId,
            name,
            output: `[Binary file: ${args.path} (${stat.size} bytes)]`,
          };
        }
        const buf = fs.readFileSync(filePath);
        const isBinary = buf.subarray(0, 4096).includes(0);
        if (isBinary) {
          return {
            tool_call_id: toolCallId,
            name,
            output: `[Binary file: ${args.path} (${stat.size} bytes)]`,
          };
        }
        const content = buf.toString('utf-8');
        if (content.length === 0) {
          return {
            tool_call_id: toolCallId,
            name,
            output: `[File: ${args.path} (0 total lines)]\n(Empty file)`,
          };
        }
        const lines = content.split('\n');
        const total = lines.length;
        const offset = Math.max(1, parseInt(args.offset, 10) || 1);
        const limit = Math.max(1, parseInt(args.limit, 10) || 200);
        if (offset > total) {
          return {
            tool_call_id: toolCallId,
            name,
            output: `[File: ${args.path} (${total} total lines)]\n(Offset ${offset} exceeds total lines: ${total})`,
          };
        }
        const slice = lines.slice(offset - 1, offset - 1 + limit);
        const numbered = slice.map((l, i) => `${offset + i}: ${l}`).join('\n');
        const msg = `[File: ${args.path} (${total} total lines)]\n${numbered}${offset - 1 + limit < total ? `\n... (${total - (offset - 1 + limit)} lines remaining)` : ''}`;
        return { tool_call_id: toolCallId, name, output: msg };
      }

      case 'write': {
        const rawContent = args.content ?? args.text ?? args.code ?? '';
        const content = typeof rawContent === 'string' ? rawContent : String(rawContent);
        const filePath = path.resolve(ctx.cwd, args.path);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const prevContent = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf-8') : '';
        fs.writeFileSync(filePath, content, 'utf-8');
        const diffCard = generateDiffCard(prevContent, content, args.path);
        return {
          tool_call_id: toolCallId,
          name,
          output: `Successfully wrote ${content.length} characters to ${args.path}`,
          diff: diffCard.hasChanges ? diffCard.formatted : undefined,
        };
      }

      case 'edit': {
        const filePath = path.resolve(ctx.cwd, args.path);
        if (!fs.existsSync(filePath)) {
          return { tool_call_id: toolCallId, name, output: `Error: File not found: ${args.path}`, isError: true };
        }
        const originalContent = fs.readFileSync(filePath, 'utf-8');
        let content = originalContent;
        let oldText = args.oldText ?? args.old_str ?? args.target;
        let newText = args.newText ?? args.new_str ?? args.replacement ?? '';
        if (!oldText) {
          return { tool_call_id: toolCallId, name, output: 'Error: oldText is required for edit', isError: true };
        }
        let count = content.split(oldText).length - 1;
        // Fallback for CRLF / LF line ending differences
        if (count === 0 && oldText.includes('\n')) {
          const normContent = content.replace(/\r\n/g, '\n');
          const normOld = oldText.replace(/\r\n/g, '\n');
          const normCount = normContent.split(normOld).length - 1;
          if (normCount === 1) {
            content = normContent;
            oldText = normOld;
            newText = newText.replace(/\r\n/g, '\n');
            count = 1;
          }
        }
        // Whitespace-tolerant fallback for trailing space or indentation variations
        if (count === 0) {
          const hasTrailingNewline = oldText.endsWith('\n');
          const cleanOld = hasTrailingNewline ? oldText.slice(0, -1) : oldText;
          const oldLines = cleanOld.split('\n');

          const hasContentTrailingNewline = content.endsWith('\n');
          const cleanContent = hasContentTrailingNewline ? content.slice(0, -1) : content;
          const contentLines = cleanContent.split('\n');

          if (oldLines.length > 0 && contentLines.length >= oldLines.length) {
            const matchesFound: number[] = [];
            for (let i = 0; i <= contentLines.length - oldLines.length; i++) {
              let match = true;
              for (let j = 0; j < oldLines.length; j++) {
                if (contentLines[i + j].trim() !== oldLines[j].trim()) {
                  match = false;
                  break;
                }
              }
              if (match) {
                matchesFound.push(i);
              }
            }
            if (matchesFound.length === 1) {
              const startIdx = matchesFound[0];
              const matchedOriginalChunk =
                contentLines.slice(startIdx, startIdx + oldLines.length).join('\n') +
                (hasTrailingNewline ? '\n' : '');
              oldText = matchedOriginalChunk;
              count = 1;
            } else if (matchesFound.length > 1) {
              count = matchesFound.length;
            }
          }
        }
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
        let updated = content.replace(oldText, newText);
        if (originalContent.includes('\r\n') && !updated.includes('\r\n')) {
          updated = updated.replace(/\r?\n/g, '\r\n');
        }
        fs.writeFileSync(filePath, updated, 'utf-8');
        const diffCard = generateDiffCard(originalContent, updated, args.path);
        return {
          tool_call_id: toolCallId,
          name,
          output: `Successfully edited ${args.path}`,
          diff: diffCard.hasChanges ? diffCard.formatted : undefined,
        };
      }

      case 'bash': {
        const command = args.command;
        const timeout = args.timeout || 30000;
        return await new Promise<ToolResult>((resolve) => {
          let stdout = '';
          let stderr = '';
          let settled = false;

          const proc = spawn('bash', ['-c', command], {
            cwd: ctx.cwd,
            env: { ...process.env, PAGER: 'cat' },
            detached: process.platform !== 'win32',
          });

          const killProc = (sig: NodeJS.Signals = 'SIGTERM') => {
            if (!proc.pid) return;
            try {
              if (process.platform !== 'win32') {
                process.kill(-proc.pid, sig);
              } else {
                proc.kill(sig);
              }
            } catch {
              try { proc.kill(sig); } catch {}
            }
          };

          const onAbort = () => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            killProc('SIGTERM');
            setTimeout(() => {
              killProc('SIGKILL');
            }, 300);
            const rawOutput = `Command cancelled by user.\nStdout:\n${stdout}\nStderr:\n${stderr}`;
            resolve({
              tool_call_id: toolCallId,
              name,
              output: truncateLogOutput(rawOutput, 50, 150),
              isError: true,
            });
          };

          if (ctx.signal?.aborted) {
            onAbort();
            return;
          }
          ctx.signal?.addEventListener('abort', onAbort, { once: true });

          let timer: Timer | null = setTimeout(() => {
            if (settled) return;
            settled = true;
            ctx.signal?.removeEventListener('abort', onAbort);
            killProc('SIGTERM');
            setTimeout(() => {
              killProc('SIGKILL');
            }, 300);
            const rawOutput = `Command timed out after ${timeout}ms\nStdout:\n${stdout}\nStderr:\n${stderr}`;
            resolve({
              tool_call_id: toolCallId,
              name,
              output: truncateLogOutput(rawOutput, 50, 150),
              isError: true,
            });
          }, timeout);

          const MAX_BUFFER = 10 * 1024 * 1024;
          let stdoutBytes = 0;
          let stderrBytes = 0;

          proc.stdout?.on('data', (d) => {
            const str = d.toString();
            stdoutBytes += d.length;
            if (stdoutBytes < MAX_BUFFER) {
              stdout += str;
            }
            ctx.onOutput?.(str);
          });

          proc.stderr?.on('data', (d) => {
            const str = d.toString();
            stderrBytes += d.length;
            if (stderrBytes < MAX_BUFFER) {
              stderr += str;
            }
            ctx.onOutput?.(str);
          });

          proc.on('close', (code) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            ctx.signal?.removeEventListener('abort', onAbort);
            const rawOutput = stdout + (stderr ? `\n[stderr]\n${stderr}` : '');
            const trimmed = rawOutput.trim() || `(Process exited with code ${code})`;
            const output = truncateLogOutput(trimmed, 50, 150);
            resolve({
              tool_call_id: toolCallId,
              name,
              output,
              isError: code !== 0,
            });
          });

          proc.on('error', (err) => {
            if (settled) return;
            settled = true;
            if (timer) clearTimeout(timer);
            ctx.signal?.removeEventListener('abort', onAbort);
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

      case 'generate_image': {
        const prompt = args.prompt;
        const res = await relay.generateImage(prompt, { size: args.size });
        if (!res.b64) {
          return {
            tool_call_id: toolCallId,
            name,
            output: `Image generation note: ${res.error || 'Failed to generate image'}`,
            isError: true,
          };
        }
        // Providers often return JPEG, so the default name follows the MIME type rather than assuming PNG.
        const ext = IMAGE_EXTENSIONS[res.mimeType ?? ''] ?? 'png';
        const relPath = args.outputPath || `assets/image_${Date.now()}.${ext}`;
        const absPath = path.resolve(ctx.cwd, relPath);
        const parentDir = path.dirname(absPath);
        if (!fs.existsSync(parentDir)) {
          fs.mkdirSync(parentDir, { recursive: true });
        }
        fs.writeFileSync(absPath, Buffer.from(res.b64, 'base64'));
        return {
          tool_call_id: toolCallId,
          name,
          output: `Successfully generated image and saved to: ${relPath}\nPrompt: "${prompt}"`,
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
  } catch (caught: unknown) {
    const err = caught as { message?: unknown }; // Preserve the existing message lookup, including non-Error throws.
    return {
      tool_call_id: toolCallId,
      name,
      output: `Tool error: ${err.message}`,
      isError: true,
    };
  }
}
