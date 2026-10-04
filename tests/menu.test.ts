import { describe, expect, it } from 'bun:test';
import { MENU_ITEMS } from '../src/menu.ts';
import { BeurreAgent } from '../src/agent.ts';

describe('Redesigned Beurre Menu & Command Center Engine', () => {
  it('should include all required menu items categorized into 3 distinct sections', () => {
    const categories = new Set(MENU_ITEMS.map((m) => m.category));
    expect(categories.has('model')).toBe(true);
    expect(categories.has('agents')).toBe(true);
    expect(categories.has('workspace')).toBe(true);
  });

  it('should provide informative multi-line details for each menu item', () => {
    MENU_ITEMS.forEach((item) => {
      expect(item.id).toBeDefined();
      expect(item.title).toBeDefined();
      expect(item.icon).toBeDefined();
      expect(item.description.length).toBeGreaterThan(10);
      expect(item.details.length).toBeGreaterThan(0);
      expect(item.actionHint).toBeDefined();
    });
  });

  it('should dynamically format current values for active model, effort, and turns', () => {
    const agent = new BeurreAgent({ model: 'glm-5-3-flash' });
    agent.setEffort('high');

    const modelItem = MENU_ITEMS.find((m) => m.id === '1');
    expect(modelItem).toBeDefined();
    const modelVal = modelItem?.getValue?.(agent, 'expanded');
    expect(modelVal).toContain('GLM 5.3 Flash');

    const effortItem = MENU_ITEMS.find((m) => m.id === '2');
    expect(effortItem).toBeDefined();
    const effortVal = effortItem?.getValue?.(agent, 'expanded');
    expect(effortVal).toBe('HIGH');

    const thinkingItem = MENU_ITEMS.find((m) => m.id === '3');
    expect(thinkingItem).toBeDefined();
    const thinkVal = thinkingItem?.getValue?.(agent, 'collapsed');
    expect(thinkVal).toBe('COLLAPSED');
  });

  it('should list all native subagents in the subagents menu item', () => {
    const subagentsItem = MENU_ITEMS.find((m) => m.id === '4');
    expect(subagentsItem).toBeDefined();
    const val = subagentsItem?.getValue?.(new BeurreAgent(), 'expanded');
    expect(val).toContain('specialists ready');
    expect(subagentsItem?.details.some((d) => d.includes('Architect'))).toBe(true);
    expect(subagentsItem?.details.some((d) => d.includes('Visionary'))).toBe(true);
  });
});
