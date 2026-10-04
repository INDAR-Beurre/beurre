import { describe, expect, it, afterAll } from 'bun:test';
import { executeTool } from '../src/tools.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('Butter Tool Suite', () => {
  const testDir = path.join('/tmp', `beurre_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it('should write a file and create directories', async () => {
    const relFile = 'nested/sub/hello.txt';
    const content = 'Bonjour le Beurre!';
    const res = await executeTool('c1', 'write', { path: relFile, content }, { cwd: testDir });

    expect(res.isError).toBeFalsy();
    const absPath = path.join(testDir, relFile);
    expect(fs.existsSync(absPath)).toBe(true);
    expect(fs.readFileSync(absPath, 'utf-8')).toBe(content);
  });

  it('should read a file with line numbers', async () => {
    const relFile = 'nested/sub/hello.txt';
    const res = await executeTool('c2', 'read', { path: relFile }, { cwd: testDir });

    expect(res.isError).toBeFalsy();
    expect(res.output).toContain('1: Bonjour le Beurre!');
  });

  it('should edit file with exact replacement', async () => {
    const relFile = 'nested/sub/hello.txt';
    const res = await executeTool(
      'c3',
      'edit',
      { path: relFile, oldText: 'Bonjour le Beurre!', newText: 'Butter is gold.' },
      { cwd: testDir }
    );

    expect(res.isError).toBeFalsy();
    const absPath = path.join(testDir, relFile);
    expect(fs.readFileSync(absPath, 'utf-8')).toBe('Butter is gold.');
  });

  it('should fail edit if oldText is not found', async () => {
    const relFile = 'nested/sub/hello.txt';
    const res = await executeTool(
      'c4',
      'edit',
      { path: relFile, oldText: 'NonExistentString', newText: 'New' },
      { cwd: testDir }
    );

    expect(res.isError).toBe(true);
    expect(res.output).toContain('oldText was not found');
  });

  it('should execute bash command and capture output', async () => {
    const res = await executeTool('c5', 'bash', { command: 'echo "🧈 butter test"' }, { cwd: testDir });

    expect(res.isError).toBeFalsy();
    expect(res.output).toContain('🧈 butter test');
  });
});
