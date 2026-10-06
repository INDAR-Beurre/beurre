import { describe, expect, it, afterAll } from 'bun:test';
import { executeTool, truncateLogOutput } from '../src/tools.ts';
import { relay } from '../src/relay.ts';
import { handleKeyStroke, createInitialEditorState, getFileMatches } from '../src/editor.ts';
import { selectFlagshipBoostModel, resolveFileMentions } from '../src/repl.ts';
import { detectTestCommand } from '../src/features.ts';
import { stringWidth } from '../src/layout.ts';
import { formatThinkingBlock } from '../src/markdown.ts';
import { BeurreWorkingBar, formatToolResult } from '../src/theme.ts';
import fs from 'node:fs';
import path from 'node:path';

describe('CLI Improvements & Robustness Engine', () => {
  const testDir = path.join('/tmp', `beurre_robustness_test_${Date.now()}`);
  fs.mkdirSync(testDir, { recursive: true });

  afterAll(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('Tools Robustness', () => {
    it('should edit files with CRLF / LF line ending differences', async () => {
      const crlfFile = 'crlf.txt';
      const absPath = path.join(testDir, crlfFile);
      fs.writeFileSync(absPath, 'line1\r\nline2\r\nline3\r\n', 'utf-8');

      // Edit with pure LF in search query
      const res = await executeTool(
        'e1',
        'edit',
        { path: crlfFile, oldText: 'line2\n', newText: 'line2_modified\n' },
        { cwd: testDir }
      );

      expect(res.isError).toBeFalsy();
      const updated = fs.readFileSync(absPath, 'utf-8');
      expect(updated).toContain('line2_modified');
    });

    it('should list directory contents with [dir], [file] markers and total count', async () => {
      const subDir = path.join(testDir, 'sub_listing');
      fs.mkdirSync(subDir, { recursive: true });
      fs.writeFileSync(path.join(subDir, 'file1.ts'), 'console.log(1);');
      fs.mkdirSync(path.join(subDir, 'child_folder'), { recursive: true });

      const res = await executeTool('r1', 'read', { path: 'sub_listing' }, { cwd: testDir });
      expect(res.isError).toBeFalsy();
      expect(res.output).toContain('(2 items)');
      expect(res.output).toContain('[file] file1.ts');
      expect(res.output).toContain('[dir] child_folder');
    });

    it('should detect binary files and avoid dumping binary content to stdout', async () => {
      const binFile = 'test.bin';
      const absPath = path.join(testDir, binFile);
      // Write binary buffer with null byte
      const buffer = Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0x00, 0x01, 0x02, 0x03]);
      fs.writeFileSync(absPath, buffer);

      const res = await executeTool('r2', 'read', { path: binFile }, { cwd: testDir });
      expect(res.isError).toBeFalsy();
      expect(res.output).toContain('Binary file:');
    });

    it('should abort bash commands promptly when abort signal is triggered', async () => {
      const controller = new AbortController();
      // Schedule abort in 50ms
      setTimeout(() => controller.abort(), 50);

      const start = Date.now();
      const res = await executeTool(
        'b1',
        'bash',
        { command: 'sleep 5' },
        { cwd: testDir, signal: controller.signal }
      );
      const elapsed = Date.now() - start;

      expect(res.isError).toBe(true);
      expect(res.output).toContain('cancelled');
      expect(elapsed).toBeLessThan(3000); // Exited far sooner than 5 seconds
    });
  });

  describe('Editor Navigation & Wide Character Cursor', () => {
    it('should support PageUp and PageDown for autocomplete navigation', () => {
      let state = createInitialEditorState('/', 0);
      expect(state.autocompleteMatches.length).toBeGreaterThan(8);
      expect(state.selectedAutocompleteIdx).toBe(0);

      // PageDown moves selection down by up to 8
      const pgDownRes = handleKeyStroke(state, '\x1b[6~');
      expect(pgDownRes.state.selectedAutocompleteIdx).toBe(8);

      // PageDown again moves further
      const pgDownRes2 = handleKeyStroke(pgDownRes.state, '\x1b[6~');
      expect(pgDownRes2.state.selectedAutocompleteIdx).toBeGreaterThan(8);

      // PageUp moves selection back up
      const pgUpRes = handleKeyStroke(pgDownRes2.state, '\x1b[5~');
      expect(pgUpRes.state.selectedAutocompleteIdx).toBe(pgDownRes2.state.selectedAutocompleteIdx - 8);

      // PageUp clamps to 0
      const pgUpResClamped = handleKeyStroke(pgUpRes.state, '\x1b[5~');
      expect(pgUpResClamped.state.selectedAutocompleteIdx).toBe(0);
    });

    it('should correctly measure column width for emojis and wide characters', () => {
      const emojiText = '🧈 Beurre CLI';
      expect(stringWidth(emojiText)).toBe(13);

      const cjkText = '你好，世界';
      expect(stringWidth(cjkText)).toBe(10);
    });
  });

  describe('Markdown Thinking Formatter', () => {
    it('should preserve full content in expanded thinking blocks', () => {
      const thinking = 'Step 1: Check files\nStep 2: Run verification\nStep 3: All tests pass.';
      const formatted = formatThinkingBlock(thinking, false);
      expect(formatted).toContain('Step 1: Check files');
      expect(formatted).toContain('Step 2: Run verification');
      expect(formatted).toContain('Step 3: All tests pass.');
    });

    it('should format collapsed thinking with clean summary', () => {
      const thinking = 'Detailed inner monologues that should be tucked away.';
      const formatted = formatThinkingBlock(thinking, true);
      expect(formatted).toContain('Thinking');
      expect(formatted).toContain('/think');
    });
  });

  describe('Working Bar Live Output & Formatting', () => {
    it('should accept and display live detail in BeurreWorkingBar', () => {
      const bar = new BeurreWorkingBar();
      bar.setTool('bash', { command: 'bun test' });
      bar.setLiveDetail('tests/auth.test.ts passing (1/21)');

      expect(bar.getStatusText()).toContain('bash: bun test');
      expect(bar.getStatusText()).toContain('tests/auth.test.ts');
      bar.stop();
    });

    it('should format tool results clamped within terminal bounds', () => {
      const longOutput = 'a'.repeat(200);
      const formatted = formatToolResult(longOutput, false, 60);
      expect(formatted).toBeDefined();
      expect(formatted).toContain('✔');
      expect(formatted).toContain('[60ms]');
    });
  });

  describe('Relay Stream Think Tag Parsing & Web Search', () => {
    it('should stream completions and handle split think tags correctly', async () => {
      // Mock stream with split <think> and </think> tags
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"Hello "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"<thi"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"nk>internal reasoning</th"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"ink>world"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      let streamIndex = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (streamIndex < sseChunks.length) {
            controller.enqueue(new TextEncoder().encode(sseChunks[streamIndex++]));
          } else {
            controller.close();
          }
        },
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        return new Response(mockStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }) as any;

      try {
        let streamedTokens = '';
        let streamedReasoning = '';
        const res = await relay.streamChatCompletion({
          messages: [{ role: 'user', content: 'test' }],
          model: 'test-model',
          onToken: (t) => { streamedTokens += t; },
          onReasoning: (r) => { streamedReasoning += r; },
        });

        expect(streamedTokens).toBe('Hello world');
        expect(streamedReasoning).toBe('internal reasoning');
        expect(res.content).toBe('Hello world');
        expect(res.reasoning).toBe('internal reasoning');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should fallback to reasoning content if response has no content', async () => {
      const sseChunks = [
        'data: {"choices":[{"delta":{"content":"<think>only reasoning here</think>"}}]}\n\n',
        'data: [DONE]\n\n',
      ];

      let streamIndex = 0;
      const mockStream = new ReadableStream({
        pull(controller) {
          if (streamIndex < sseChunks.length) {
            controller.enqueue(new TextEncoder().encode(sseChunks[streamIndex++]));
          } else {
            controller.close();
          }
        },
      });

      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        return new Response(mockStream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
      }) as any;

      try {
        const res = await relay.streamChatCompletion({
          messages: [{ role: 'user', content: 'test' }],
          model: 'test-model',
        });

        // Content falls back to reasoning so it does not end up completely blank
        expect(res.content).toBe('only reasoning here');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('should format webSearch JSON results into readable markdown', async () => {
      const originalFetch = globalThis.fetch;
      const searchData = {
        results: [
          { title: 'Three.js Docs', url: 'https://threejs.org', snippet: 'JavaScript 3D Library' },
          { title: 'Bun Documentation', url: 'https://bun.sh', snippet: 'Fast JavaScript runtime' }
        ]
      };

      globalThis.fetch = (async () => {
        return new Response(JSON.stringify(searchData), { status: 200 });
      }) as any;

      try {
        const result = await relay.webSearch('test query');
        expect(result).toContain('1. [Three.js Docs](https://threejs.org)');
        expect(result).toContain('JavaScript 3D Library');
        expect(result).toContain('2. [Bun Documentation](https://bun.sh)');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('Bug Fixes & Hardened Edge Cases', () => {
    it('should handle write tool with text fallback or empty content without TypeError', async () => {
      const emptyFile = 'empty.txt';
      const res1 = await executeTool('w1', 'write', { path: emptyFile }, { cwd: testDir });
      expect(res1.isError).toBeFalsy();
      expect(res1.output).toContain('Successfully wrote 0 characters');

      const textFallbackFile = 'fallback.txt';
      const res2 = await executeTool('w2', 'write', { path: textFallbackFile, text: 'Hello from text property' }, { cwd: testDir });
      expect(res2.isError).toBeFalsy();
      expect(res2.output).toContain('Successfully wrote 24 characters');
    });

    it('should handle read tool on empty files and out-of-range offsets', async () => {
      const emptyFile = 'empty_zero.txt';
      fs.writeFileSync(path.join(testDir, emptyFile), '');
      const resEmpty = await executeTool('r_empty', 'read', { path: emptyFile }, { cwd: testDir });
      expect(resEmpty.isError).toBeFalsy();
      expect(resEmpty.output).toContain('(Empty file)');

      const sampleFile = 'sample.txt';
      fs.writeFileSync(path.join(testDir, sampleFile), 'line 1\nline 2');
      const resOOB = await executeTool('r_oob', 'read', { path: sampleFile, offset: 10 }, { cwd: testDir });
      expect(resOOB.isError).toBeFalsy();
      expect(resOOB.output).toContain('exceeds total lines');
    });

    it('should preserve CRLF line endings when editing CRLF files', async () => {
      const crlfFile = 'preserve_crlf.txt';
      const absPath = path.join(testDir, crlfFile);
      fs.writeFileSync(absPath, 'first\r\nsecond\r\nthird\r\n');

      const res = await executeTool(
        'e_crlf',
        'edit',
        { path: crlfFile, oldText: 'second\n', newText: 'second_replaced\n' },
        { cwd: testDir }
      );
      expect(res.isError).toBeFalsy();
      const updated = fs.readFileSync(absPath, 'utf-8');
      expect(updated).toContain('\r\nsecond_replaced\r\n');
      expect(updated.includes('\r\n')).toBe(true);
    });

    it('should preserve tool details containing brackets when setLiveDetail is called', () => {
      const bar = new BeurreWorkingBar();
      bar.setTool('edit', { path: 'src/[id].ts' });
      bar.setLiveDetail('saving chunk 1');

      // Must not truncate [id].ts to src/
      expect(bar.getStatusText()).toContain('src/[id].ts');
      expect(bar.getStatusText()).toContain('[saving chunk 1]');
      bar.stop();
    });

    it('should include /boost in predictive commands catalog', async () => {
      const { getPredictiveMatches, SLASH_COMMANDS } = await import('../src/predictive.ts');
      const boostCmd = SLASH_COMMANDS.find((c) => c.command === '/boost');
      expect(boostCmd).toBeDefined();
      expect(boostCmd?.category).toBe('Models');

      const matches = getPredictiveMatches('/boo');
      expect(matches.length).toBeGreaterThanOrEqual(1);
      expect(matches[0].command).toBe('/boost');
    });

    it('should truncate bash outputs longer than 200 lines preserving head and tail', () => {
      const longOutput = Array.from({ length: 300 }, (_, i) => `Line ${i + 1}`).join('\n');
      const truncated = truncateLogOutput(longOutput, 50, 150);
      expect(truncated).toContain('Line 1');
      expect(truncated).toContain('Line 50');
      expect(truncated).toContain('... [100 lines omitted by Beurre tool manager] ...');
      expect(truncated).toContain('Line 151');
      expect(truncated).toContain('Line 300');
    });

    it('should edit files with whitespace-tolerant fallback', async () => {
      const wsFile = 'whitespace_test.ts';
      const absPath = path.join(testDir, wsFile);
      fs.writeFileSync(absPath, 'function calculate() {\n    const a = 1;  \n    const b = 2;\n    return a + b;\n}\n');

      const res = await executeTool(
        'e_ws',
        'edit',
        {
          path: wsFile,
          oldText: 'function calculate() {\n    const a = 1;\n    const b = 2;\n',
          newText: 'function calculate() {\n    const a = 10;\n    const b = 20;\n',
        },
        { cwd: testDir }
      );
      expect(res.isError).toBeFalsy();
      const updated = fs.readFileSync(absPath, 'utf-8');
      expect(updated).toContain('const a = 10;');
      expect(updated).toContain('const b = 20;');
    });

    it('should support interactive reverse-i-search with Ctrl+R', () => {
      const history = ['git status', 'bun test', 'git commit -m "feat: butter"', 'bun run build'];
      let state = createInitialEditorState('', 4);

      // Trigger Ctrl+R
      let res = handleKeyStroke(state, '\x12', history);
      expect(res.state.isSearchingHistory).toBe(true);
      expect(res.state.historySearchMatches?.length).toBe(4);

      // Type 'git'
      res = handleKeyStroke(res.state, 'g', history);
      res = handleKeyStroke(res.state, 'i', history);
      res = handleKeyStroke(res.state, 't', history);
      expect(res.state.historySearchQuery).toBe('git');
      expect(res.state.historySearchMatches?.length).toBe(2);
      expect(res.state.historySearchMatches?.[0]).toBe('git commit -m "feat: butter"');

      // Cycle with Ctrl+R
      res = handleKeyStroke(res.state, '\x12', history);
      expect(res.state.historySearchMatchIdx).toBe(1);
      expect(res.state.historySearchMatches?.[1]).toBe('git status');

      // Accept with Enter
      res = handleKeyStroke(res.state, '\r', history);
      expect(res.state.isSearchingHistory).toBe(false);
      expect(res.state.buffer).toBe('git status');
      expect(res.state.cursor).toBe('git status'.length);
    });

    it('should cancel reverse-i-search and restore draft on Esc', () => {
      const history = ['npm run test', 'npm start'];
      let state = createInitialEditorState('my initial draft', 2);

      let res = handleKeyStroke(state, '\x12', history);
      expect(res.state.isSearchingHistory).toBe(true);

      // Cancel with Esc
      res = handleKeyStroke(res.state, '\x1b', history);
      expect(res.state.isSearchingHistory).toBe(false);
      expect(res.state.buffer).toBe('my initial draft');
    });

    it('should support @ file autocomplete and tab completion', () => {
      let state = createInitialEditorState('cat @', 0);
      expect(state.fileMatches).toBeDefined();
      expect(state.fileMatches!.length).toBeGreaterThan(0);

      // Tab complete first match
      const selected = state.fileMatches![0];
      const res = handleKeyStroke(state, '\t');
      expect(res.state.buffer).toBe(`cat @${selected.path} `);
      expect(res.state.fileMatches).toBeUndefined();
    });

    it('should route /boost to flagship high/max reasoning models', () => {
      expect(selectFlagshipBoostModel('glm-5-3-flash')).toBe('kimi-k3:max');
      expect(selectFlagshipBoostModel('kimi-k3:max')).toBe('kimi-k3:max');
      expect(selectFlagshipBoostModel('gpt-6-astra:high')).toBe('gpt-6-astra:high');
      expect(selectFlagshipBoostModel('kilgore/claude-opus-5-5')).toBe('kilgore/claude-opus-5-5');
    });

    it('should resolve @file mentions and attach content to prompt', () => {
      const sampleFile = path.join(testDir, 'referenceme.txt');
      fs.writeFileSync(sampleFile, 'Butter makes code smooth and delicious');

      const prompt = `Please inspect @${path.relative(testDir, sampleFile)} for quality`;
      const res = resolveFileMentions(prompt, testDir);
      expect(res.attachedFiles.length).toBe(1);
      expect(res.attachedFiles[0]).toBe(path.relative(testDir, sampleFile));
      expect(res.expandedPrompt).toContain('Butter makes code smooth and delicious');
      expect(res.expandedPrompt).toContain('[Attached context from @');
    });

    it('should preserve trailing slash and omit space when tab-completing a directory mention', () => {
      const state = createInitialEditorState('look at @', 0);
      state.fileMatches = [{ path: 'src/', isDir: true }, { path: 'package.json', isDir: false }];
      state.selectedFileIdx = 0;

      const res = handleKeyStroke(state, '\t');
      expect(res.state.buffer).toBe('look at @src/');
      // fileMatches should stay active to continue completing items in src/
      expect(res.state.fileMatches).toBeDefined();
    });

    it('should accept reverse-i-search and position cursor for editing on Left/Right arrows', () => {
      const history = ['git status', 'git checkout -b feature'];
      let state = createInitialEditorState('', 2);
      let res = handleKeyStroke(state, '\x12', history); // Ctrl+R
      expect(res.state.isSearchingHistory).toBe(true);

      // Press Left arrow to accept match and position cursor for editing
      const leftRes = handleKeyStroke(res.state, '\x1b[D', history);
      expect(leftRes.state.isSearchingHistory).toBe(false);
      expect(leftRes.state.buffer).toBe('git checkout -b feature');
      expect(leftRes.state.cursor).toBe('git checkout -b feature'.length - 1);
    });

    it('should restore draft when accepting reverse-i-search with 0 matches', () => {
      const history = ['npm run test'];
      let state = createInitialEditorState('original draft text', 1);
      let res = handleKeyStroke(state, '\x12', history); // Ctrl+R
      expect(res.state.isSearchingHistory).toBe(true);

      // Type non-matching query
      res = handleKeyStroke(res.state, 'z', history);
      res = handleKeyStroke(res.state, 'z', history);
      res = handleKeyStroke(res.state, 'z', history);
      expect(res.state.historySearchMatches?.length).toBe(0);

      // Press Enter
      const enterRes = handleKeyStroke(res.state, '\r', history);
      expect(enterRes.state.isSearchingHistory).toBe(false);
      expect(enterRes.state.buffer).toBe('original draft text');
    });

    it('should detect test command from lockfiles, Deno, and Makefiles', () => {
      const denoDir = path.join(testDir, 'deno_proj');
      fs.mkdirSync(denoDir, { recursive: true });
      fs.writeFileSync(path.join(denoDir, 'deno.json'), '{}');
      expect(detectTestCommand(denoDir)).toBe('deno test');

      const makeDir = path.join(testDir, 'make_proj');
      fs.mkdirSync(makeDir, { recursive: true });
      fs.writeFileSync(path.join(makeDir, 'Makefile'), 'test:\n\techo "testing"\n');
      expect(detectTestCommand(makeDir)).toBe('make test');
    });
  });
});
