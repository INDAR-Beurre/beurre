import { describe, expect, it } from 'bun:test';
import {
  formatTokenProgressBar,
  DAILY_TOKEN_LIMIT,
  saveStoredAuth,
  getStoredAuth,
  clearStoredAuth,
  type AuthUser,
  saveCloudSession,
  listCloudSessions,
  resumeCloudSession,
} from '../src/auth.ts';

describe('Auth & Daily Token Quota Engine', () => {
  it('should define DAILY_TOKEN_LIMIT as exactly 50,000,000 tokens', () => {
    expect(DAILY_TOKEN_LIMIT).toBe(50_000_000);
  });

  it('should format unlimited progress bar for admin accounts', () => {
    const bar = formatTokenProgressBar(120_000, null);
    expect(bar).toContain('∞');
    expect(bar).toContain('Admin Account');
  });

  it('should format percentage progress bar for regular accounts against 50M quota', () => {
    // 25M of 50M = 50%
    const bar50 = formatTokenProgressBar(25_000_000, DAILY_TOKEN_LIMIT, 20);
    expect(bar50).toContain('50.0%');
    expect(bar50).toContain('█');
    expect(bar50).toContain('░');

    // 0 of 50M = 0%
    const bar0 = formatTokenProgressBar(0, DAILY_TOKEN_LIMIT, 20);
    expect(bar0).toContain('0.0%');

    // 50M of 50M = 100%
    const bar100 = formatTokenProgressBar(50_000_000, DAILY_TOKEN_LIMIT, 20);
    expect(bar100).toContain('100.0%');
  });

  it('should safely serialize, read, and clear local auth credentials', () => {
    const testUser: AuthUser = {
      name: 'test_butter_user',
      role: 'user',
      token: 'eyJhbGciOiJIUzI1NiJ9.test',
      createdAt: Date.now(),
    };

    saveStoredAuth(testUser);
    const read = getStoredAuth();
    expect(read).toBeDefined();
    expect(read?.name).toBe('test_butter_user');
    expect(read?.role).toBe('user');

    clearStoredAuth();
  });

  it('should handle cloud session resume queries gracefully when not found', async () => {
    const res = await resumeCloudSession('non_existent_session_id_999999');
    expect(res.error).toBeDefined();
    expect(res.session).toBeUndefined();
  });
});
