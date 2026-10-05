import { describe, expect, it } from 'bun:test';
import { MENU_ITEMS, filterMenuItems, renderPalette } from '../src/menu.ts';
import { BeurreAgent } from '../src/agent.ts';
import { stringWidth } from '../src/layout.ts';

describe('settings palette', () => {
  it('covers all three categories', () => {
    const categories = new Set(MENU_ITEMS.map((m) => m.category));
    expect(categories.has('model')).toBe(true);
    expect(categories.has('agents')).toBe(true);
    expect(categories.has('workspace')).toBe(true);
  });

  it('gives every item an id, title and a usable explanation', () => {
    for (const item of MENU_ITEMS) {
      expect(item.id).toBeTruthy();
      expect(item.title).toBeTruthy();
      expect(item.description.length).toBeGreaterThan(10);
      expect(Array.isArray(item.details)).toBe(true);
      expect(item.hint).toBeTruthy();
      // Every item must be actionable, or it is decoration.
      expect(item.run !== undefined || item.getValue !== undefined).toBe(true);
    }
  });

  it('has unique ids so selection cannot be ambiguous', () => {
    const ids = MENU_ITEMS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('reports live values from the agent', () => {
    const agent = new BeurreAgent({ model: 'glm-5-3-flash' });
    agent.setEffort('high');

    expect(MENU_ITEMS.find((m) => m.id === 'model')?.getValue?.(agent, 'expanded')).toContain('GLM 5.3 Flash');
    expect(MENU_ITEMS.find((m) => m.id === 'effort')?.getValue?.(agent, 'expanded')).toBe('high');
    expect(MENU_ITEMS.find((m) => m.id === 'thinking')?.getValue?.(agent, 'collapsed')).toBe('collapsed');
  });

  it('counts the real subagents rather than a hardcoded label', () => {
    const item = MENU_ITEMS.find((m) => m.id === 'subagents');
    expect(item?.getValue?.(new BeurreAgent(), 'expanded')).toMatch(/^\d+ available$/);
  });
});

describe('filterMenuItems', () => {
  it('returns everything for an empty query', () => {
    expect(filterMenuItems(MENU_ITEMS, '')).toHaveLength(MENU_ITEMS.length);
  });

  it('matches on title, description and keywords', () => {
    expect(filterMenuItems(MENU_ITEMS, 'model').map((i) => i.id)).toContain('model');
    expect(filterMenuItems(MENU_ITEMS, 'markdown').map((i) => i.id)).toContain('export');
    expect(filterMenuItems(MENU_ITEMS, 'delegate').map((i) => i.id)).toContain('subagents');
  });

  it('requires every term to match', () => {
    expect(filterMenuItems(MENU_ITEMS, 'model nope')).toHaveLength(0);
  });

  it('is case insensitive', () => {
    expect(filterMenuItems(MENU_ITEMS, 'MODEL')).toEqual(filterMenuItems(MENU_ITEMS, 'model'));
  });
});

// The regression that corrupted the screen: painted lines wider than the
// terminal wrap, so the erase count no longer matched the painted height.
describe('renderPalette width safety', () => {
  const agent = new BeurreAgent({ model: 'glm-5-3-flash' });

  for (const width of [40, 56, 62, 80, 100, 200]) {
    it(`never exceeds ${width} columns`, () => {
      const lines = renderPalette(MENU_ITEMS, 0, '', width, agent, 'expanded');
      for (const line of lines) {
        expect(stringWidth(line)).toBeLessThanOrEqual(width);
      }
    });

    it(`never exceeds ${width} columns with a long query and deep selection`, () => {
      const lines = renderPalette(MENU_ITEMS, 7, 'a'.repeat(60), width, agent, 'expanded');
      for (const line of lines) {
        expect(stringWidth(line)).toBeLessThanOrEqual(width);
      }
    });
  }

  it('shows an empty state instead of a blank screen when nothing matches', () => {
    const lines = renderPalette(MENU_ITEMS, 0, 'zzzznope', 80, agent, 'expanded');
    expect(lines.join('\n')).toContain('no matches');
  });

  it('explains the highlighted row so a first-time user knows what Enter does', () => {
    const lines = renderPalette(MENU_ITEMS, 0, '', 80, agent, 'expanded');
    expect(lines.join('\n')).toContain(MENU_ITEMS[0].description);
  });

  // The 40x20 case: the palette used to paint more rows than the terminal had,
  // so the top scrolled off and the frame could not be erased cleanly.
  it('fits inside a short viewport', () => {
    const lines = renderPalette(MENU_ITEMS, 0, '', 40, agent, 'expanded', 20);
    expect(lines.length).toBeLessThanOrEqual(20);
  });

  it('always keeps the search field, preview and hint bar visible', () => {
    for (const rows of [16, 20, 24, 40, 60]) {
      const lines = renderPalette(MENU_ITEMS, 0, '', 80, agent, 'expanded', rows);
      expect(lines.length).toBeLessThanOrEqual(rows);
      expect(lines.join('\n')).toContain('search');
      expect(lines.join('\n')).toContain('esc close');
    }
  });
});
