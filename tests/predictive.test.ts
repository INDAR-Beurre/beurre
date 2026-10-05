import { stringWidth } from '../src/layout.ts';
import { describe, expect, it } from 'bun:test';
import { getPredictiveMatches, formatPredictiveHints, SLASH_COMMANDS, suggestCommand } from '../src/predictive.ts';

describe('Predictive Slash Command Engine', () => {
  it('should match commands starting with /m', () => {
    const matches = getPredictiveMatches('/m');
    const cmds = matches.map((m) => m.command);
    expect(cmds).toContain('/menu');
    expect(cmds).toContain('/models');
    expect(cmds).toContain('/model');
  });

  it('should match commands starting with /l', () => {
    const matches = getPredictiveMatches('/l');
    // No count assertion: the number of commands sharing a prefix changes
    // with every command added. Only the matching behaviour matters.
    const cmds = matches.map((m) => m.command);
    expect(cmds).toContain('/loop');
    expect(cmds).toContain('/login');
    expect(cmds).toContain('/logout');
  });

  it('should match commands starting with /t for /think', () => {
    const matches = getPredictiveMatches('/t');
    expect(matches.some((m) => m.command === '/think')).toBe(true);
  });

  it('should match all commands on single /', () => {
    const matches = getPredictiveMatches('/');
    expect(matches.length).toBe(SLASH_COMMANDS.length);
  });

  it('should format predictive hints within the given width', () => {
    // The old renderer repeated `inner - 26` dashes, so every row overflowed
    // and wrapped. Assert the invariant, not the old title wording.
    const matches = getPredictiveMatches('/m');
    for (const width of [46, 62, 80, 120]) {
      const formatted = formatPredictiveHints(matches, width);
      for (const line of formatted.split('\n')) {
        expect(stringWidth(line)).toBeLessThanOrEqual(width);
      }
      expect(formatted).toContain('/menu');
      expect(formatted).toMatch(/\/menu\s+OMP-style interactive comman/);
    }
  });
});

describe('suggestCommand', () => {
  it('recovers the most likely typo, transpositions included', () => {
    // Plain Levenshtein scores "/modles" 2 away from "/models", outside the
    // match budget, so the app replied "Unknown command" to its own headline
    // feature. Damerau counts the swap as one edit.
    expect(suggestCommand('/modles')?.command).toBe('/models');
    expect(suggestCommand('/moddels')?.command).toBe('/models');
    expect(suggestCommand('/helpp')?.command).toBe('/help');
    expect(suggestCommand('/menuu')?.command).toBe('/menu');
    expect(suggestCommand('/churnn')?.command).toBe('/churn');
  });

  it('stays silent when nothing is close, rather than guessing', () => {
    expect(suggestCommand('/xyzzy')).toBeNull();
    expect(suggestCommand('/zzzzzzz')).toBeNull();
  });

  it('only ever suggests a command that actually exists', () => {
    const known = new Set(SLASH_COMMANDS.map((c) => c.command));
    for (const typo of ['/modles', '/helpp', '/difff', '/menuu', '/churnn', '/depes']) {
      const guess = suggestCommand(typo);
      if (guess) expect(known.has(guess.command)).toBe(true);
    }
  });

  it('ignores input that is not a command', () => {
    expect(suggestCommand('please refactor the parser')).toBeNull();
    expect(suggestCommand('')).toBeNull();
  });

  it('carries the description so the reply explains itself', () => {
    expect(suggestCommand('/modles')?.description.length).toBeGreaterThan(0);
  });
});
