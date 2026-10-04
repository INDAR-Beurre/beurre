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
    expect(matches.length).toBe(1);
    expect(matches[0].command).toBe('/loop');
  });

  it('should match commands starting with /t for /think', () => {
    const matches = getPredictiveMatches('/t');
    expect(matches.some((m) => m.command === '/think')).toBe(true);
  });

  it('should match all commands on single /', () => {
    const matches = getPredictiveMatches('/');
    expect(matches.length).toBe(SLASH_COMMANDS.length);
  });

  it('should format predictive hints with descriptions', () => {
    const matches = getPredictiveMatches('/m');
    const formatted = formatPredictiveHints(matches);
    expect(formatted).toContain('/menu');
    expect(formatted).toContain('Suggested Commands');
    expect(formatted.toLowerCase()).toContain('interactive dashboard');
  });
});
