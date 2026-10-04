import { describe, expect, it } from 'bun:test';
import { relay } from '../src/relay.ts';
import { extractCookie } from '../src/config.ts';
import path from 'node:path';
import os from 'node:os';

describe('RelayClient & Config Auth', () => {
  it('should extract relay_session from Netscape cookies.txt if present', () => {
    const cookiePath = path.join(os.homedir(), 'model-aggregator', 'cookies.txt');
    const cookie = extractCookie(cookiePath);
    if (cookie) {
      expect(cookie).toStartWith('relay_session=');
    }
  });

  it('should fetch live models from Relay Gateway', async () => {
    const models = await relay.fetchLiveModels();
    expect(Array.isArray(models)).toBe(true);
    expect(models.length).toBeGreaterThan(0);
    const first = models[0];
    expect(first.id).toBeDefined();
    expect(typeof first.id).toBe('string');
  }, 15000);

  it('should fetch providers from Relay Gateway', async () => {
    const providers = await relay.fetchProviders();
    expect(Array.isArray(providers)).toBe(true);
    expect(providers.length).toBeGreaterThan(0);
    expect(providers[0].name).toBeDefined();
  }, 15000);
});
