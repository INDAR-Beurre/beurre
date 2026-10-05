import { b, colors } from './theme.ts';
import { box, padTo, stringWidth, termWidth } from './layout.ts';

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
    command: '/price',
    description: 'Estimated spend for the current session',
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
    argsHint: '[save <label> | <id>]',
    description: 'List checkpoints, save one, or restore by id',
    category: 'Workflow',
  },
  {
    command: '/snippet',
    argsHint: '<name> [rm] <text>',
    description: 'Reusable saved prompts',
    category: 'Workflow',
  },

  {
    command: '/notes',
    argsHint: '[add <tag> <text> | rm <tag> | <tag>]',
    description: 'Scratch notes that survive restarts',
    category: 'Workflow',
  },
  {
    command: '/todo',
    argsHint: '[add <text> | done <text> | clear]',
    description: 'A checklist that survives restarts',
    category: 'Workflow',
  },
  {
    command: '/alias',
    argsHint: '<name> [rm] <expansion>',
    description: 'Name any command and type /name instead',
    category: 'Workflow',
  },
  {
    command: '/tokens',
    argsHint: '<prompt>',
    description: 'Break a prompt into prose and code by size',
    category: 'Diagnostics',
  },
  {
    command: '/changes',
    description: 'Line counts for everything you have edited',
    category: 'Diagnostics',
  },
  {
    command: '/watch',
    argsHint: '[path ...]',
    description: 'Check what a path currently is and how big',
    category: 'Diagnostics',
  },
  {
    command: '/cache',
    description: 'Where the disk went: build output by size',
    category: 'Diagnostics',
  },
  {
    command: '/keys',
    description: 'Every editor shortcut, in one screen',
    category: 'Core',
  },
  {
    command: '/preflight',
    description: 'Diagnose why a model is not answering',
    category: 'Diagnostics',
  },
  {
    command: '/log',
    argsHint: '[n]',
    description: 'Recent commits with author, date and subject',
    category: 'Diagnostics',
  },
  {
    command: '/branch',
    description: 'Current branch, upstream, and how far ahead or behind',
    category: 'Diagnostics',
  },
  {
    command: '/stash',
    description: 'List stashed work you can go back to',
    category: 'Diagnostics',
  },
  {
    command: '/blame',
    argsHint: '<file>',
    description: 'Who last touched each line of a file',
    category: 'Diagnostics',
  },
  {
    command: '/lastcommit',
    description: 'The most recent commit and the files it touched',
    category: 'Diagnostics',
  },
  {
    command: '/bisect',
    description: 'Whether a bisect has run long enough to mean anything',
    category: 'Diagnostics',
  },
  {
    command: '/ignore',
    description: 'Every ignore rule in play for this repository',
    category: 'Diagnostics',
  },
  {
    command: '/ignorecheck',
    argsHint: '<path>',
    description: 'Explain why a path is ignored, tracked or untracked',
    category: 'Diagnostics',
  },
  {
    command: '/wordcount',
    argsHint: '[path]',
    description: 'Files, lines and words under a directory',
    category: 'Diagnostics',
  },
  {
    command: '/todoscan',
    description: 'Find TODO, FIXME and HACK markers across the tree',
    category: 'Diagnostics',
  },
  {
    command: '/time',
    description: 'How long this session has run, and per turn',
    category: 'General',
  },
  {
    command: '/export',
    argsHint: '[md|json|txt]',
    description: 'Write the transcript to a file',
    category: 'Tools',
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
 * Renders the command palette. Previously a hand-built box whose top border
 * repeated `inner - 26` dashes — a magic constant that only lined up for a
 * 26-character title, so every row overflowed and wrapped. Now everything goes
 * through `box()`, and descriptions sit in a fixed label column rather than
 * `columns()` (which right-aligns its second argument and ragged every row).
 */
export function formatPredictiveHints(matches: SlashCommandInfo[], width: number = termWidth()): string {
  if (matches.length === 0) {
    return `${colors.dim}  no commands match${colors.reset}`;
  }

  const shown = matches.slice(0, 10);
  const widest = Math.max(...shown.map((m) => stringWidth(`${m.command}${m.argsHint ? ` ${m.argsHint}` : ''}`)));
  const descCol = Math.min(30, widest + 2);
  // Two columns need room for both. Below that, stacking the description under
  // its command is the only layout that stays readable instead of squeezing
  // the description into a two-character gutter.
  const stacked = width - 4 < descCol + 12;

  const lines = shown.map((m) => {
    const hint = m.argsHint ? ` ${colors.dim}${m.argsHint}${colors.reset}` : '';
    const label = `${colors.bold}${colors.butterGold}${m.command}${colors.reset}${hint}`;
    if (stacked) {
      return [label, `${' '.repeat(2)}${colors.gray}${m.description}${colors.reset}`];
    }
    return `${padTo(label, descCol)}${colors.gray}${m.description}${colors.reset}`;
  }).flat();

  if (matches.length > shown.length) {
    lines.push(`${colors.dim}… ${matches.length - shown.length} more — type / to filter${colors.reset}`);
  }

  return box({ title: `Commands (${matches.length})`, lines, width }).join('\n');
}
