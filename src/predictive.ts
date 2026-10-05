import { b, colors } from './theme.ts';
import { columns, termWidth, truncate } from './layout.ts';

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

  // Insights & diagnostics
  {
    command: '/doctor',
    description: 'Check the environment: cwd, git, config, write access, colour',
    category: 'Diagnostics',
  },
  {
    command: '/stats',
    description: 'Session stats: turns, tool calls, thinking, tokens and spend',
    category: 'Diagnostics',
  },
  {
    command: '/env',
    description: 'Show the environment the model is told about',
    category: 'Diagnostics',
  },
  {
    command: '/tools',
    description: 'List the tools the model can call, with descriptions',
    category: 'Diagnostics',
  },
  {
    command: '/test',
    description: 'Detect and run the project test command',
    category: 'Diagnostics',
  },
  {
    command: '/outline',
    argsHint: '[path]',
    description: 'Structural outline of a file or directory',
    category: 'Diagnostics',
  },
  {
    command: '/grep',
    argsHint: '<text>',
    description: 'Literal search across the workspace',
    category: 'Diagnostics',
  },

  // Workflow
  {
    command: '/init',
    description: 'Survey this repo and produce a grounded onboarding brief',
    category: 'Workflow',
  },
  {
    command: '/checkpoint',
    argsHint: '[id]',
    description: 'List checkpoints, or restore one by id',
    category: 'Workflow',
  },
  {
    command: '/snippet',
    argsHint: '<name> add|rm <text>',
    description: 'Reusable saved prompts',
    category: 'Workflow',
  },

  {
    command: '/thinking',
    argsHint: '[expanded|collapsed|hidden]',
    description: 'Show the last reasoning block, or set how thinking is displayed',
    category: 'General',
  },
  {
    command: '/quit',
    description: 'Exit Beurre',
    category: 'General',
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

/**
 * Renders the command palette. Previously a hardcoded 72-column box whose
 * `padEnd(28)` was applied to a string that already contained ANSI escapes, so
 * the padding counted escape bytes instead of visible columns and every row
 * misaligned and wrapped below ~62 columns.
 */
export function formatPredictiveHints(matches: SlashCommandInfo[], width: number = termWidth()): string {
  if (matches.length === 0) return '';
  const inner = Math.max(12, width - 4);
  const lines: string[] = [];

  lines.push(
    `  ${colors.butterMelt}╭──${colors.reset} ${colors.bold}${colors.butterGold}Commands Palette${colors.reset} ${colors.dim}(${matches.length} commands)${colors.reset} ${colors.butterMelt}${'─'.repeat(Math.max(0, inner - 26))}╮${colors.reset}`,
  );

  const shown = matches.slice(0, 10);
  for (const m of shown) {
    const name = `${colors.bold}${colors.butterGold}${m.command}${colors.reset}`;
    const label = m.argsHint ? `${name} ${colors.dim}${m.argsHint}${colors.reset}` : name;
    const row = columns(label, `${colors.gray}${m.description}${colors.reset}`, inner);
    lines.push(`  ${colors.butterMelt}│${colors.reset} ${truncate(row, inner)} ${colors.butterMelt}│${colors.reset}`);
  }

  if (matches.length > shown.length) {
    lines.push(
      `  ${colors.butterMelt}│${colors.reset} ${truncate(`${colors.dim}… ${matches.length - shown.length} more (type to filter)`, inner)} ${colors.butterMelt}│${colors.reset}`,
    );
  }

  lines.push(`  ${colors.butterMelt}╰${'─'.repeat(inner)}╯${colors.reset}`);
  return lines.join('\n');
}
