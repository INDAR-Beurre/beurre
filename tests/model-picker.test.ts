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
});