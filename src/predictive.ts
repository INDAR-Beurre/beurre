import { b, colors } from './theme.ts';

export interface SlashCommandInfo {
  command: string;
  argsHint?: string;
  description: string;
  category: string;
}

export const SLASH_COMMANDS: SlashCommandInfo[] = [
  // Session & Cloud
  {
    command: '/new',
    argsHint: '[model]',
    description: 'Start a fresh session bound to model & synced with Supabase',
    category: 'Session',
  },
  {
    command: '/sessions',
    description: 'List your cloud sessions from Supabase across devices',
    category: 'Cloud',
  },
  {
    command: '/resume',
    argsHint: '<id>',
    description: 'Resume a session from Supabase across devices',
    category: 'Cloud',
  },
  {
    command: '/sync',
    description: 'Force sync active session turns to Supabase cloud',
    category: 'Cloud',
  },

  // Auth & Account
  {
    command: '/whoami',
    description: 'Show active logged-in account, role & daily token quota',
    category: 'Account',
  },
  {
    command: '/quota',
    description: 'Inspect daily 50M token usage quota and account tier',
    category: 'Account',
  },
  {
    command: '/usage',
    description: 'Show token breakdown (user, assistant, tool, all-time)',
    category: 'Account',
  },
  {
    command: '/login',
    argsHint: '[user] [pass]',
    description: 'Sign in to your Relay / Supabase account',
    category: 'Account',
  },
  {
    command: '/logout',
    description: 'Sign out and clear local credentials',
    category: 'Account',
  },

  // Models & Inference
  {
    command: '/models',
    description: 'Open visual model navigator & search catalog',
    category: 'Models',
  },
  {
    command: '/model',
    argsHint: '<id>',
    description: 'Switch active model directly or open picker',
    category: 'Models',
  },
  {
    command: '/effort',
    argsHint: '[max|high|medium|low]',
    description: 'Cycle reasoning effort level (or press Shift+Tab)',
    category: 'Models',
  },
  {
    command: '/think',
    argsHint: '[expand|collapse|hide|show]',
    description: 'Toggle collapsible thinking blocks or inspect full reasoning trace',
    category: 'Models',
  },
  {
    command: '/providers',
    description: 'Probe live upstream provider health & model counts',
    category: 'Models',
  },

  // Autonomous & Subagents
  {
    command: '/subagents',
    description: 'List native named subagents & model personas',
    category: 'Subagents',
  },
  {
    command: '/subagent',
    argsHint: '<name> <task>',
    description: 'Dispatch a specialized task to a named subagent',
    category: 'Subagents',
  },
  {
    command: '/loop',
    argsHint: '<prompt>',
    description: 'Start autonomous prompt repeating loop with auto-compaction',
    category: 'Loop',
  },

  // Tools & Workspace
  {
    command: '/diff',
    description: 'View git working tree diff with syntax highlighting',
    category: 'Tools',
  },
  {
    command: '/compact',
    description: 'Melt & compact conversation history to free token budget',
    category: 'Session',
  },
  {
    command: '/history',
    description: 'Display session message statistics and tokens',
    category: 'Session',
  },
  {
    command: '/copy',
    description: 'Copy last assistant response to system clipboard',
    category: 'Tools',
  },
  {
    command: '/export',
    argsHint: '[path]',
    description: 'Export conversation session to Markdown file',
    category: 'Tools',
  },
  {
    command: '/undo',
    description: 'Revert the last user and assistant interaction turn',
    category: 'Session',
  },

  // Core & Navigation
  {
    command: '/menu',
    description: 'OMP-style interactive command palette',
    category: 'Core',
  },
  {
    command: '/clear',
    description: 'Clear terminal screen buffer (preserves session messages)',
    category: 'Core',
  },
  {
    command: '/help',
    description: 'Show all available commands and keyboard shortcuts',
    category: 'Core',
  },
  {
    command: '/exit',
    description: 'Save butter state and exit CLI',
    category: 'Core',
  },
];

export function getPredictiveMatches(input: string): SlashCommandInfo[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    return [];
  }
  const token = trimmed.split(' ')[0].toLowerCase();
  return SLASH_COMMANDS.filter((sc) => sc.command.startsWith(token));
}

export function formatPredictiveHints(matches: SlashCommandInfo[]): string {
  if (matches.length === 0) return '';
  const lines: string[] = [
    `  ${colors.butterMelt}╭── Commands Palette (${matches.length} commands) ────────────────────────────────╮${colors.reset}`,
  ];

  for (const m of matches.slice(0, 10)) {
    const hint = m.argsHint ? ` ${colors.dim}${m.argsHint}${colors.reset}` : '';
    const cmdStr = `${colors.bold}${colors.butterGold}${m.command}${colors.reset}${hint}`.padEnd(28, ' ');
    lines.push(`  ${colors.butterMelt}│${colors.reset}  ${cmdStr} ${colors.gray}• ${m.description}${colors.reset}`);
  }

  if (matches.length > 10) {
    lines.push(`  ${colors.butterMelt}│${colors.reset}  ${colors.dim}... and ${matches.length - 10} more commands (type to filter)${colors.reset}`);
  }

  lines.push(`  ${colors.butterMelt}╰────────────────────────────────────────────────────────────────────────╯${colors.reset}`);
  return lines.join('\n');
}
