import { stringWidth } from '../src/layout.ts';
import { describe, expect, it } from 'bun:test';
import { getPredictiveMatches, formatPredictiveHints, SLASH_COMMANDS } from '../src/predictive.ts';

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
