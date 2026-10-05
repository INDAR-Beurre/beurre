import { describe, it, expect } from 'bun:test';
import { filterModelList, renderModelList } from '../src/model-picker.ts';
import { stripAnsi, stringWidth } from '../src/layout.ts';
import type { RelayModel } from '../src/relay.ts';

const model = (id: string, over: Partial<RelayModel> = {}): RelayModel =>
  ({ id, context_length: 128000, owned_by: 'acme', ...over }) as RelayModel;

const CATALOG: RelayModel[] = [
  model('glm-5-3-flash', { reasoning: true }),
  model('kimi-k3', { reasoning_efforts: ['low', 'high'], context_length: 1_000_000 }),
  model('qwen3-coder', { owned_by: 'alibaba' }),
];

describe('filterModelList', () => {
  it('returns everything for an empty query', () => {
    expect(filterModelList(CATALOG, '')).toHaveLength(3);
  });

  it('matches case-insensitively', () => {
    expect(filterModelList(CATALOG, 'GLM').map((m) => m.id)).toEqual(['glm-5-3-flash']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterModelList(CATALOG, 'zzzz')).toHaveLength(0);
  });
});

describe('renderModelList', () => {
  // The picker used to write straight to stdout with raw `.length` on
  // ANSI-bearing strings, so it went ragged below 80 columns. These loops are
  // the regression guard for that whole class of bug.
  for (const width of [24, 40, 56, 80, 120]) {
    it(`never exceeds ${width} columns`, () => {
      const lines = renderModelList(CATALOG, 0, '', width, 'glm-5-3-flash');
      for (const line of lines) {
        expect(stringWidth(line)).toBeLessThanOrEqual(width);
      }
    });
  }

  it('marks exactly one selected row', () => {
    const lines = renderModelList(CATALOG, 1, '', 80, 'glm-5-3-flash');
    expect(lines.filter((l) => stripAnsi(l).includes('❯'))).toHaveLength(1);
  });

  it('tags the current model as active', () => {
    const lines = renderModelList(CATALOG, 0, '', 80, 'qwen3-coder');
    expect(stripAnsi(lines.join('\n'))).toContain('active');
  });

  it('shows an empty state instead of a blank body', () => {
    const lines = renderModelList(CATALOG, 0, 'zzz', 80, 'glm-5-3-flash');
    expect(stripAnsi(lines.join('\n'))).toContain('no model matches');
  });

  it('reports the filtered count', () => {
    const lines = renderModelList(CATALOG, 0, 'kimi', 80, 'glm-5-3-flash');
    expect(stripAnsi(lines.join('\n'))).toContain('1 of 3 models');
  });

  it('escapes colour when colour is disabled', () => {
    const lines = renderModelList(CATALOG, 0, '', 80, 'glm-5-3-flash');
    expect(lines.join('\n')).not.toContain('\x1b[');
  });

  // Every other surface is a titled `box()` with a hint footer. The picker
  // floated free of all of it, so opening /models looked like a different
  // program had taken over the screen. These assert the frame, not just that
  // the lines are short enough -- the width tests above all passed on the
  // unboxed version.
  it('is framed in a box with a title, like every other surface', () => {
    const lines = renderModelList(CATALOG, 0, '', 80, 'glm-5-3-flash').map(stripAnsi);
    expect(lines[0]).toMatch(/^╭─ select a model ─/);
    expect(lines[lines.length - 1]).toMatch(/^╰─+╯$/);
  });

  it('puts the key hints in the footer rather than loose at the bottom', () => {
    const lines = renderModelList(CATALOG, 0, '', 80, 'glm-5-3-flash').map(stripAnsi);
    expect(lines[lines.length - 2]).toContain('↑↓ move');
    expect(lines[lines.length - 2].startsWith('│')).toBe(true);
  });

  it('every row shares the frame width so the overlay erases cleanly', () => {
    const lines = renderModelList(CATALOG, 0, 'kimi', 100, 'glm-5-3-flash');
    const widths = new Set(lines.map((l) => stringWidth(stripAnsi(l))));
    expect(widths.size).toBe(1);
  });
});
describe('renderModelList fits the width it is given', () => {
  // Two separate overflows lived here. The picker clamped itself to 24 columns
  // while box() floors at 20, so at 20-23 columns every row was 4 too wide and
  // the terminal wrapped mid-frame. And in box()'s borderless path (width < 34)
  // a second "  " was prefixed to lines the caller had already indented.
  const models = Array.from({ length: 8 }, (_, i) => ({
    id: `model-${i}`,
    name: `Model Name ${i}`,
    context_length: 128000,
    owned_by: 'prov',
  }));

  for (const width of [20, 22, 26, 30, 33, 34, 46, 62, 80, 120]) {
    it(`never exceeds ${width} columns`, () => {
      const lines = renderModelList(models, 0, '', width, 'model-0');
      for (const line of lines) {
        expect(stringWidth(line)).toBeLessThanOrEqual(width);
      }
    });
  }

  it('still lists a selectable model at 20 columns', () => {
    // At 20 there is no room for name *and* id, and the name is what the
    // user picks by -- the id column is the thing that gives way.
    const plain = stripAnsi(renderModelList(models, 0, '', 20, 'model-0').join('\n'));
    expect(plain).toContain('Model Name 0');
    expect(plain).toContain('❯');
  });
});
