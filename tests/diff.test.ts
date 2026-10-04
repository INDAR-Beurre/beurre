import { describe, expect, it } from 'bun:test';
import { computeLineDiff, generateDiffCard } from '../src/diff.ts';

describe('Unified Diff Generator', () => {
  it('should detect identical content with no changes', () => {
    const content = 'line 1\nline 2\nline 3';
    const diff = generateDiffCard(content, content, 'test.ts');
    expect(diff.hasChanges).toBe(false);
    expect(diff.additions).toBe(0);
    expect(diff.deletions).toBe(0);
    expect(diff.formatted).toContain('No changes detected');
  });

  it('should detect additions correctly', () => {
    const oldCode = 'const a = 1;';
    const newCode = 'const a = 1;\nconst b = 2;\nconst c = 3;';
    const diff = generateDiffCard(oldCode, newCode, 'src/math.ts');

    expect(diff.hasChanges).toBe(true);
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(0);
    expect(diff.formatted).toContain('+const b = 2;');
    expect(diff.formatted).toContain('+const c = 3;');
    expect(diff.formatted).toContain('src/math.ts');
  });

  it('should detect deletions correctly', () => {
    const oldCode = 'line A\nline B\nline C';
    const newCode = 'line A\nline C';
    const diff = generateDiffCard(oldCode, newCode, 'doc.txt');

    expect(diff.hasChanges).toBe(true);
    expect(diff.additions).toBe(0);
    expect(diff.deletions).toBe(1);
    expect(diff.formatted).toContain('-line B');
  });

  it('should format unified diff hunk header with line numbers', () => {
    const oldCode = 'foo\nbar\nbaz';
    const newCode = 'foo\nqux\nbaz';
    const diff = generateDiffCard(oldCode, newCode, 'config.json');

    expect(diff.hunks.length).toBeGreaterThan(0);
    expect(diff.formatted).toContain('@@');
    expect(diff.formatted).toContain('-bar');
    expect(diff.formatted).toContain('+qux');
  });

  it('should format standard git hunk header for newly created files', () => {
    const diff = generateDiffCard('', 'first line\nsecond line', 'src/new.ts');
    expect(diff.hasChanges).toBe(true);
    expect(diff.additions).toBe(2);
    expect(diff.deletions).toBe(0);
    expect(diff.formatted).toContain('@@ -0,0 +1,2 @@');
    expect(diff.formatted).toContain('+first line');
  });
});
