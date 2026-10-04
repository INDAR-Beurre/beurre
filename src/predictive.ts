import { b, colors } from './theme.ts';

export interface SlashCommandInfo {
  command: string;
  argsHint?: string;
  description: string;
  category: string;
}

export const SLASH_COMMANDS: SlashCommandInfo[] = [
  {
    command: '/menu',
    description: 'Open interactive dashboard & full control center',
    category: 'Core',
  },
  {
    command: '/models',
    description: 'Open redesigned visual model navigator & picker',
    category: 'Models',
  },
  {
    command: '/model',
    argsHint: '<id>',
    description: 'Switch active model directly or open picker',
    category: 'Models',
  },
  {
    command: '/providers',
    description: 'Probe live upstream provider health & model counts',
    category: 'Models',
  },
  {
    command: '/loop',
    argsHint: '<prompt>',
    description: 'Start autonomous prompt repeating loop with auto-compaction',
    category: 'Loop',
  },
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
    command: '/compact',
    description: 'Melt & compact conversation history into memory rollup',
    category: 'Session',
  },
  {
    command: '/sync',
    description: 'Sync current session to Model Aggregator web app',
    category: 'Session',
  },
  {
    command: '/history',
    description: 'Display session message statistics and tokens',
    category: 'Session',
  },
  {
    command: '/clear',
    description: 'Clear terminal screen and show butter banner',
    category: 'Core',
  },
  {
    command: '/help',
    description: 'Show all available commands and keyboard shortcuts',
    category: 'Core',
  },
  {
    command: '/think',
    argsHint: '[expand|collapse|hide]',
    description: 'Toggle collapsible thinking blocks or inspect full reasoning trace',
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
    `  ${colors.butterMelt}╭── Suggested Commands (Press Tab to complete) ──────────────────────────╮${colors.reset}`,
  ];

  for (const m of matches.slice(0, 5)) {
    const hint = m.argsHint ? ` ${colors.dim}${m.argsHint}${colors.reset}` : '';
    const cmdStr = `${colors.bold}${colors.butterGold}${m.command}${colors.reset}${hint}`.padEnd(30, ' ');
    lines.push(`  ${colors.butterMelt}│${colors.reset}  ${cmdStr} ${colors.gray}• ${m.description}${colors.reset}`);
  }

  if (matches.length > 5) {
    lines.push(`  ${colors.butterMelt}│${colors.reset}  ${colors.dim}... and ${matches.length - 5} more matching commands${colors.reset}`);
  }

  lines.push(`  ${colors.butterMelt}╰────────────────────────────────────────────────────────────────────────╯${colors.reset}`);
  return lines.join('\n');
}
