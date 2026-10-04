import { describe, expect, it } from 'bun:test';
import { filterModelList } from '../src/model-picker.ts';
import type { RelayModel } from '../src/relay.ts';

describe('Model Navigator & Filter Engine', () => {
  const sampleModels: RelayModel[] = [
    { id: 'glm-5-3-flash', name: 'GLM 5.3 Flash', owned_by: 'zhipu', reasoning: true, context_length: 128000 },
    { id: 'gpt-4o', name: 'GPT-4o Omnimodal', owned_by: 'openai', reasoning: false, context_length: 128000 },
    { id: 'o3-mini', name: 'OpenAI o3-mini', owned_by: 'openai', reasoning: true, context_length: 200000 },
    { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', owned_by: 'google', reasoning: true, context_length: 1000000 },
    { id: 'kimi-k3:max', name: 'Moonshot Kimi K3 Max', owned_by: 'moonshot', reasoning: true, context_length: 200000 },
  ];

  it('should return all models when filter query is empty', () => {
    const res = filterModelList(sampleModels, '');
    expect(res.length).toBe(5);
  });

  it('should filter models by ID case-insensitively', () => {
    const res = filterModelList(sampleModels, 'glm');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('glm-5-3-flash');
  });

  it('should filter models by provider name (owned_by)', () => {
    const res = filterModelList(sampleModels, 'openai');
    expect(res.length).toBe(2);
    expect(res.some((m) => m.id === 'gpt-4o')).toBe(true);
    expect(res.some((m) => m.id === 'o3-mini')).toBe(true);
  });

  it('should filter models by display name', () => {
    const res = filterModelList(sampleModels, 'Moonshot');
    expect(res.length).toBe(1);
    expect(res[0].id).toBe('kimi-k3:max');
  });

  it('should return empty list when no matches are found', () => {
    const res = filterModelList(sampleModels, 'non-existent-xyz');
    expect(res.length).toBe(0);
  });
});
