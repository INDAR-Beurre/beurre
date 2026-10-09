import { describe, expect, it } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createOmpTools } from '../src/tools.ts';

describe('embedded omp agent adapter', () => {
  it('exposes the Beurre tools through OMP AgentTool results', async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'beurre-omp-tools-'));
    try {
      fs.writeFileSync(path.join(cwd, 'note.txt'), 'hello from relay\n', 'utf8');
      const tools = createOmpTools(cwd);
      expect(tools.map((tool) => tool.name)).toEqual([
        'read',
        'write',
        'edit',
        'bash',
        'web_search',
        'subagent_run',
        'generate_image',
      ]);

      const read = tools.find((tool) => tool.name === 'read');
      expect(read).toBeDefined();
      const result = await read!.execute('call_read', { path: 'note.txt' });
      expect(result.isError).not.toBe(true);
      expect(result.content).toEqual([{ type: 'text', text: '[File: note.txt (2 total lines)]\n1: hello from relay\n2: ' }]);
    } finally {
      fs.rmSync(cwd, { recursive: true, force: true });
    }
  });
});
