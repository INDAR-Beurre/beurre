import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface SubagentConfig {
  name: string;
  role: string;
  modelId: string;
  description: string;
}

export interface BeurreConfig {
  relayUrl: string;
  relayFallbackUrl: string;
  webUrl: string;
  apiKey: string;
  cookieFile: string;
  defaultModel: string;
  subagents: Record<string, SubagentConfig>;
  loopDelayMs: number;
  autoSync: boolean;
  historyDir: string;
}

const DEFAULT_CONFIG: BeurreConfig = {
  relayUrl: 'https://relay-gw.pages.dev/v1',
  relayFallbackUrl: 'https://relay-gateway.isisosiris107.workers.dev/v1',
  webUrl: 'https://relay-gw.pages.dev',
  // No baked-in key: a committed credential is a public credential. The key
  // comes from RELAY_API_KEY, ~/.beurre/config.json, or ~/.omp/agent/models.yml.
  apiKey: '',
  cookieFile: path.join(os.homedir(), 'model-aggregator', 'cookies.txt'),
  defaultModel: 'glm-5-3-flash',
  subagents: {
    Architect: {
      name: 'Architect',
      role: 'System Architect & High-Level Strategist',
      modelId: 'kimi-k3:max',
      description: 'Designs systems, plans implementations, and resolves complex structural decisions.',
    },
    CodeCraft: {
      name: 'CodeCraft',
      role: 'Fast Expert Software Engineer',
      modelId: 'glm-5-3-flash',
      description: 'High-speed coding, refactoring, tool operations, and unit test execution.',
    },
    Reviewer: {
      name: 'Reviewer',
      role: 'Rigorous Code Reviewer & Security Auditor',
      modelId: 'gpt-6-astra:high',
      description: 'Audits code correctness, catches edge cases, security flaws, and regressions.',
    },
    BugHunter: {
      name: 'BugHunter',
      role: 'Deep Debugger & Root Cause Investigator',
      modelId: 'o3-mini',
      description: 'Isolates tricky bugs, stack traces, race conditions, and failing test paths.',
    },
    Scout: {
      name: 'Scout',
      role: 'Fast Web & Codebase Researcher',
      modelId: 'glm-5-3-flash',
      description: 'Explores codebase, searches live web documentation via relay, and provides citations.',
    },
    Visionary: {
      name: 'Visionary',
      role: 'Multimodal UI/UX & Image Model Specialist',
      modelId: 'gpt-4o',
      description: 'Leverages image & vision models to inspect visual designs, create SVG assets, formulate image generation prompts, and evaluate UI aesthetics.',
    },
  },
  loopDelayMs: 1000,
  autoSync: true,
  historyDir: path.join(os.homedir(), '.beurre', 'sessions'),
};

export function getBeurreDir(): string {
  const dir = path.join(os.homedir(), '.beurre');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function extractCookie(cookieFilePath: string): string | null {
  if (!fs.existsSync(cookieFilePath)) {
    return null;
  }
  try {
    const lines = fs.readFileSync(cookieFilePath, 'utf-8').split('\n');
    for (const line of lines) {
      if (line.includes('relay_session')) {
        const parts = line.split('\t');
        if (parts.length >= 7) {
          return `relay_session=${parts[6].trim()}`;
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

export function loadConfig(): BeurreConfig {
  const beurreDir = getBeurreDir();
  const configPath = path.join(beurreDir, 'config.json');

  let userConfig: Partial<BeurreConfig> = {};
  if (fs.existsSync(configPath)) {
    try {
      userConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    } catch {
      // ignore
    }
  }

  // Attempt to read API key from ~/.omp/agent/models.yml
  let ompKey: string | undefined;
  const ompModelsPath = path.join(os.homedir(), '.omp', 'agent', 'models.yml');
  if (fs.existsSync(ompModelsPath)) {
    try {
      const content = fs.readFileSync(ompModelsPath, 'utf-8');
      const match = content.match(/apiKey:\s*(sk-[A-Za-z0-9_-]+)/);
      if (match) {
        ompKey = match[1];
      }
    } catch {
      // ignore
    }
  }

  const apiKey = process.env.RELAY_API_KEY || userConfig.apiKey || ompKey || DEFAULT_CONFIG.apiKey;

  return {
    ...DEFAULT_CONFIG,
    ...userConfig,
    apiKey,
    subagents: {
      ...DEFAULT_CONFIG.subagents,
      ...(userConfig.subagents || {}),
    },
  };
}

export function saveConfig(config: BeurreConfig): void {
  const configPath = path.join(getBeurreDir(), 'config.json');
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
}
