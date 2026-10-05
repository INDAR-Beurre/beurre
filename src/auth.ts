import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { extractCookie } from './config.ts';

export interface AuthUser {
  name: string;
  role: 'admin' | 'user';
  token?: string;
  apiKey?: string;
  avatar?: string | null;
  createdAt?: number;
}

export interface TokenUsageInfo {
  account: string;
  role: 'admin' | 'user';
  dailyTokensUsed: number;
  dailyLimit: number | null; // null for admin (unlimited), 50_000_000 for regular user
  weeklyTokensUsed: number;
  allTimeTokensUsed: number;
  remainingTokens: number | null;
  percentageUsed: number;
  isUnlimited: boolean;
}

export interface CloudSession {
  id: string;
  title: string;
  at: number;
  model: string;
  history: Array<{
    role: 'system' | 'user' | 'assistant' | 'tool';
    content: string;
    name?: string;
    model?: string;
  }>;
}

// Wire shape of one entry from GET /sessions. The relay is the only producer,
// so it is asserted once at this boundary rather than guarded field by field.
interface RawSession {
  id?: string;
  title?: string;
  at?: number;
  model?: string;
  history?: Array<{ model?: string; relay?: string }>;
}

const AUTH_DIR = path.join(os.homedir(), '.beurre');
const AUTH_FILE = path.join(AUTH_DIR, 'auth.json');
const RELAY_BASE = 'https://relay-gw.pages.dev';

export function getStoredAuth(): AuthUser | null {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      const data = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf-8'));
      if (data && data.name) {
        return data;
      }
    }
  } catch {}

  // Fallback: Check /home/alex/model-aggregator/cookies.txt
  const defaultCookieFile = path.join(os.homedir(), 'model-aggregator', 'cookies.txt');
  const cookieStr = extractCookie(defaultCookieFile);
  if (cookieStr) {
    const match = /relay_session=([A-Za-z0-9_.-]+)/.exec(cookieStr);
    if (match) {
      const token = match[1];
      try {
        const decoded = Buffer.from(token, 'base64').toString('utf-8');
        const dotIdx = decoded.indexOf('.');
        const payloadStr = dotIdx !== -1 ? decoded.slice(0, dotIdx) : decoded;
        const parsed = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf-8'));
        return {
          name: parsed.name || 'admin',
          role: parsed.role || 'admin',
          token,
        };
      } catch {
        return {
          name: 'admin',
          role: 'admin',
          token,
        };
      }
    }
  }

  return null;
}

export function saveStoredAuth(user: AuthUser): void {
  try {
    if (!fs.existsSync(AUTH_DIR)) {
      fs.mkdirSync(AUTH_DIR, { recursive: true });
    }
    fs.writeFileSync(AUTH_FILE, JSON.stringify(user, null, 2), 'utf-8');
  } catch (err: unknown) {
    console.error('Failed to save auth config:', err instanceof Error ? err.message : String(err));
  }
}

export function clearStoredAuth(): void {
  try {
    if (fs.existsSync(AUTH_FILE)) {
      fs.unlinkSync(AUTH_FILE);
    }
  } catch {}
}

export function getAuthCookieHeader(): string | null {
  const user = getStoredAuth();
  if (user && user.token) {
    return `relay_session=${user.token}`;
  }
  const defaultCookieFile = path.join(os.homedir(), 'model-aggregator', 'cookies.txt');
  return extractCookie(defaultCookieFile);
}

export async function loginToRelay(username: string, password: string): Promise<{ ok: boolean; user?: AuthUser; error?: string }> {
  try {
    const res = await fetch(`${RELAY_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: AbortSignal.timeout(8000),
    });

    const setCookie = res.headers.get('set-cookie') || '';
    const cookieMatch = /relay_session=([A-Za-z0-9_.-]+)/.exec(setCookie);
    const token = cookieMatch ? cookieMatch[1] : '';

    // Relay is the sole producer; assert its documented shape once.
    const data = (await res.json()) as { error?: string; user?: { name?: string; role?: string } };
    if (!res.ok || data.error) {
      return { ok: false, error: data.error || `HTTP ${res.status}` };
    }

    const authUser: AuthUser = {
      name: data.user?.name || username,
      role: data.user?.role || 'user',
      token,
      avatar: data.user?.avatar,
      createdAt: data.user?.createdAt || Date.now(),
    };

    saveStoredAuth(authUser);
    return { ok: true, user: authUser };
  } catch (err: unknown) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function logoutFromRelay(): Promise<void> {
  const cookieHeader = getAuthCookieHeader();
  try {
    if (cookieHeader) {
      await fetch(`${RELAY_BASE}/api/auth/logout`, {
        method: 'POST',
        headers: { Cookie: cookieHeader },
        signal: AbortSignal.timeout(5000),
      });
    }
  } catch {}
  clearStoredAuth();
}

export async function fetchWhoami(): Promise<AuthUser> {
  const local = getStoredAuth();
  const cookieHeader = getAuthCookieHeader();
  if (!cookieHeader) {
    return local || { name: 'anonymous', role: 'user' };
  }

  try {
    const res = await fetch(`${RELAY_BASE}/api/auth/me`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = (await res.json()) as {
        user?: { name: string; role?: string; avatar?: string; createdAt?: string };
      };
      if (data && data.user) {
        return {
          name: data.user.name,
          role: data.user.role || 'user',
          avatar: data.user.avatar,
          createdAt: data.user.createdAt,
          token: local?.token,
        };
      }
    }
  } catch {}

  return local || { name: 'admin', role: 'admin' };
}

export const DAILY_TOKEN_LIMIT = 50_000_000; // 50M tokens/day for normal users

export async function fetchTokenUsage(): Promise<TokenUsageInfo> {
  const user = await fetchWhoami();
  const cookieHeader = getAuthCookieHeader();

  const fallback: TokenUsageInfo = {
    account: user.name,
    role: user.role,
    dailyTokensUsed: 0,
    dailyLimit: user.role === 'admin' ? null : DAILY_TOKEN_LIMIT,
    weeklyTokensUsed: 0,
    allTimeTokensUsed: 0,
    remainingTokens: user.role === 'admin' ? null : DAILY_TOKEN_LIMIT,
    percentageUsed: 0,
    isUnlimited: user.role === 'admin',
  };

  if (!cookieHeader) {
    return fallback;
  }

  try {
    const res = await fetch(`${RELAY_BASE}/v1/usage`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return fallback;
    }
    const data = (await res.json()) as {
      dailyLimit?: number | null;
      d1?: { t?: number };
      account?: string;
    };
    const isUnlimited = user.role === 'admin' || data.dailyLimit === null;
    const dailyUsed = Number(data.d1?.t || 0);
    const limit = isUnlimited ? null : DAILY_TOKEN_LIMIT;
    const remaining = isUnlimited ? null : Math.max(0, DAILY_TOKEN_LIMIT - dailyUsed);
    const percentage = isUnlimited ? 0 : Math.min(100, (dailyUsed / DAILY_TOKEN_LIMIT) * 100);

    return {
      account: data.account || user.name,
      role: user.role,
      dailyTokensUsed: dailyUsed,
      dailyLimit: limit,
      weeklyTokensUsed: Number(data.d7?.t || 0),
      allTimeTokensUsed: Number(data.all?.t || 0),
      remainingTokens: remaining,
      percentageUsed: percentage,
      isUnlimited,
    };
  } catch {
    return fallback;
  }
}

export function formatTokenProgressBar(used: number, limit: number | null, width = 20): string {
  if (limit === null) {
    return '∞ [UNLIMITED (Admin Account)]';
  }
  const pct = Math.min(1, Math.max(0, used / limit));
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  const pctStr = (pct * 100).toFixed(1) + '%';
  return `[${bar}] ${pctStr}`;
}

// ------------------------------------------------------------------
// Supabase Cloud Sessions (Model-bound & Device-Independent)
// ------------------------------------------------------------------

export async function saveCloudSession(session: {
  id: string;
  title: string;
  model: string;
  history: unknown[];
}): Promise<boolean> {
  const cookieHeader = getAuthCookieHeader();
  if (!cookieHeader) return false;

  try {
    const res = await fetch(`${RELAY_BASE}/api/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: cookieHeader,
      },
      body: JSON.stringify({
        sessions: [
          {
            id: session.id,
            title: session.title,
            at: Date.now(),
            history: session.history,
            model: session.model,
          },
        ],
      }),
      signal: AbortSignal.timeout(6000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function listCloudSessions(): Promise<CloudSession[]> {
  const cookieHeader = getAuthCookieHeader();
  if (!cookieHeader) return [];

  try {
    const res = await fetch(`${RELAY_BASE}/api/sessions`, {
      headers: { Cookie: cookieHeader },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    // The relay is the sole producer of this payload, so the wire shape is
    // asserted once here instead of guarding every field.
    const data = (await res.json()) as { sessions?: RawSession[] };
    const sessionsList = data.sessions ?? [];

    return sessionsList.map((s) => {
      let model = s.model || '';
      if (!model && Array.isArray(s.history)) {
        for (const m of s.history) {
          if (m.model) {
            model = m.model;
            break;
          }
          if (m.relay) {
            model = m.relay.split(' ')[0];
            break;
          }
        }
      }
      return {
        id: s.id,
        title: s.title || 'Untitled Session',
        at: Number(s.at) || Date.now(),
        model: model || 'glm-5-3-flash',
        history: Array.isArray(s.history) ? s.history : [],
      };
    });
  } catch {
    return [];
  }
}

export async function resumeCloudSession(sessionId: string): Promise<{
  session?: CloudSession;
  error?: string;
}> {
  const sessions = await listCloudSessions();
  const found = sessions.find((s) => s.id === sessionId || s.id.startsWith(sessionId));
  if (!found) {
    return { error: `Session "${sessionId}" not found on Supabase cloud store.` };
  }
  return { session: found };
}
