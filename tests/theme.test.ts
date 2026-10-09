import { describe, expect, it } from 'bun:test';
import {
  colors,
  PALETTE_RGB,
  renderErrorCard,
  renderToast,
  formatToolCall,
  formatToolResult,
  getGitStatus,
  formatWorkingPromptBar,
  formatSteeringPromptBar,
  BeurreWorkingBar,
  banner,
  logoMark,
  LOGO_GUTTER,
} from '../src/theme.ts';
import { BeurreAgent } from '../src/agent.ts';
import { stripAnsi, stringWidth } from '../src/layout.ts';
import { BEURRE_VERSION } from '../src/config.ts';
import pkg from '../package.json';

describe('Butter Theme & Status Rendering', () => {

  it('should format error card with red border', () => {
    const card = renderErrorCard('Connection Timeout', 'Failed to reach Relay gateway after 10s.');
    expect(card).toContain('Connection Timeout');
    expect(card).toContain('Failed to reach Relay');
  });

  it('should format toasts for success and failure', () => {
    const successToast = renderToast('Model switched', true);
    expect(successToast).toContain('Model switched');
    expect(successToast).toContain('✔');

    const failToast = renderToast('Action cancelled', false);
    expect(failToast).toContain('Action cancelled');
    expect(failToast).toContain('✖');
  });

  it('should format tool calls with badges', () => {
    const bashCall = formatToolCall('bash', { command: 'bun test' });
    expect(bashCall).toContain('Bash');
    expect(bashCall).toContain('bun test');

    const subCall = formatToolCall('subagent_run', { subagent: 'Architect', task: 'design' });
    expect(subCall).toContain('Subagent');
    expect(subCall).toContain('Architect');
  });

  it('should format tool results with line indicators', () => {
    const singleLine = formatToolResult('Success', false);
    expect(singleLine).toContain('Success');

    const multiLine = formatToolResult('line 1\nline 2\nline 3', false);
    expect(multiLine).toContain('line 1');
    expect(multiLine).toContain('+2 more lines');
  });

  it('should format pinned working prompt bar with 4 distinct lines and metadata', () => {
    const lines = formatWorkingPromptBar({
      cols: 80,
      spinnerFrame: '⠹',
      statusText: 'Whipping up solution...',
      model: 'glm-5-3-flash',
      effort: 'high',
      user: 'alex',
      quotaText: '12k / 50M',
    });

    expect(lines.length).toBe(4);
    // Line 0: top border
    expect(lines[0]).toContain('─');
    // Line 1: spinner + active status
    expect(lines[1]).toContain('⠹');
    expect(lines[1]).toContain('Whipping up solution...');
    // Line 2: middle border
    expect(lines[2]).toContain('─');
    // Line 3: footer status
    expect(lines[3]).toContain('esc to interrupt');
    expect(lines[3]).toContain('GLM 5.3 Flash');
    expect(lines[3]).toContain('high');
    expect(lines[3]).toContain('alex');
    expect(lines[3]).toContain('12k / 50M');
  });

  it('should render exactly one braille spinner glyph per status line', () => {
    const lines = formatWorkingPromptBar({ cols: 80, spinnerFrame: '⠹', statusText: 'Whipping up solution...' });
    expect(lines[1].replace(/\x1b\[[0-9;]*m/g, '')).toBe('⠹ Whipping up solution...');
    expect(lines[1]).toContain(`${colors.butterCream}Whipping up solution...${colors.reset}`);
    // The spinner frame must not be echoed twice by the bar's own prefix.
    expect(lines[1].replace(/\x1b\[[0-9;]*m/g, '').split('⠹')).toHaveLength(2);
  });

  it('should truncate overly long status text cleanly without overflowing terminal width', () => {
    const longText = 'A'.repeat(150);
    const lines = formatWorkingPromptBar({
      cols: 60,
      statusText: longText,
    });

    expect(lines[1]).toContain('…');
    // Visual length should be within bounds
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    expect(stripAnsi(lines[1]).length).toBeLessThanOrEqual(60);
  });

  it('should manage BeurreWorkingBar state, thinking, generating, and tool calls', () => {
    const bar = new BeurreWorkingBar({
      model: 'kimi-k3:max',
      effort: 'max',
      user: 'alex',
    });

    bar.update('Starting engine...');
    expect(bar.getStatusText()).toBe('Starting engine...');

    // A later update must fully replace the previous status, not append to it.
    bar.update('Compacting context...');
    expect(bar.getStatusText()).toBe('Compacting context...');

    // Thinking mode
    bar.setThinking(120, 1.5);
    expect(bar.getStatusText()).toContain('Thinking (~120 tokens • 1.5s)');

    // Generating mode
    bar.setGenerating(200, 45.2, 3.0);
    expect(bar.getStatusText()).toContain('Generating (~200 tokens • 45.2 tok/s • 3.0s)');

    // Tool execution
    bar.setTool('bash', { command: 'bun test' }, 0.8);
    expect(bar.getStatusText()).toContain('bash: bun test (0.8s)');

    bar.setTool('read', { path: 'src/theme.ts' });
    expect(bar.getStatusText()).toContain('read: src/theme.ts');

    bar.setTool('edit', { path: 'src/repl.ts' });
    expect(bar.getStatusText()).toContain('edit: src/repl.ts');

    bar.setTool('web_search', { query: 'bun test docs' });
    expect(bar.getStatusText()).toContain('web search: "bun test docs"');

    bar.stop();
  });

  it('should guarantee no line in formatWorkingPromptBar exceeds cols in narrow terminals', () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

    for (const cols of [70, 60, 50, 40]) {
      const lines = formatWorkingPromptBar({
        cols,
        spinnerFrame: '⠹',
        statusText: 'Executing bash: git commit -m "update promptbar"...',
        model: 'glm-5-3-flash',
        effort: 'high',
        user: 'alexander-developer',
        quotaText: '12k / 50M',
      });

      expect(lines.length).toBe(4);
      for (let i = 0; i < 4; i++) {
        const visualLen = stripAnsi(lines[i]).length;
        expect(visualLen).toBeLessThanOrEqual(cols);
      }
      expect(lines[3]).toContain('GLM 5.3 Flash');
    }
  });

  it('should format error card with exact border width matching columns', () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
    const card = renderErrorCard('Syntax Failure', 'Line 1: unexpected token');
    const lines = card.trim().split('\n');
    // Top border and bottom border should match width
    const topWidth = stripAnsi(lines[0]).length;
    const bottomWidth = stripAnsi(lines[lines.length - 1]).length;
    expect(topWidth).toBe(bottomWidth);
  });

  it('should format interactive steering prompt bar with 5 lines, status above chat bar, and placeholder', () => {
    const lines = formatSteeringPromptBar({
      cols: 88,
      spinnerFrame: '⠸',
      statusText: 'Whipping up solution...',
      model: 'glm-5-3-flash',
      effort: 'high',
      user: 'admin',
      quotaText: '∞',
    });

    expect(lines.length).toBe(5);
    // Line 0: status line ABOVE chat bar
    expect(lines[0]).toContain('⠸');
    expect(lines[0]).toContain('Whipping up solution...');
    // Line 1: top divider of chat bar
    expect(lines[1]).toContain('─');
    // Line 2: interactive prompt line with placeholder
    expect(lines[2]).toContain('>');
    expect(lines[2]).toContain('Type a message to steer agent (Esc to cancel)...');
    // Line 3: bottom divider of chat bar
    expect(lines[3]).toContain('─');
    // Line 4: footer with esc, enter, and shift+tab hints
    expect(lines[4]).toContain('esc to cancel');
    expect(lines[4]).toContain('enter to steer');
    expect(lines[4]).toContain('shift+tab effort');
    expect(lines[4]).toContain('admin');
    expect(lines[4]).toContain('GLM 5.3 Flash');
    expect(lines[4]).toContain('high');
    expect(lines[4]).toContain('∞');
  });

  it('should render typed steering message in interactive prompt bar without placeholder', () => {
    const lines = formatWorkingPromptBar({
      cols: 80,
      interactive: true,
      inputBuffer: 'focus on fixing the compiler errors first',
      model: 'glm-5-3-flash',
    });

    expect(lines.length).toBe(5);
    expect(lines[2]).toContain('>');
    expect(lines[2]).toContain('focus on fixing the compiler errors first');
    expect(lines[2]).not.toContain('Type a message to steer agent');
  });

  it('should guarantee no line in interactive steering prompt bar exceeds cols in narrow terminals', () => {
    const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

    for (const cols of [20, 35, 45, 60, 75, 80, 100]) {
      const lines = formatSteeringPromptBar({
        cols,
        spinnerFrame: '⠸',
        statusText: 'Executing write: src/relay.ts (4.2s)...',
        inputBuffer: 'please steer away from editing config files and keep current models',
        model: 'moonshotai/kimi-k3:max',
        effort: 'xhigh',
        user: 'alexander-developer',
        quotaText: '48,291,000 / 50,000,000',
      });

      expect(lines.length).toBe(5);
      for (let i = 0; i < 5; i++) {
        const visualLen = stripAnsi(lines[i]).length;
        expect(visualLen).toBeLessThanOrEqual(cols);
      }
    }
  });

  it('should handle interactive steering input, Shift+Tab effort cycling, and Esc cancellation in BeurreWorkingBar', () => {
    let steered = '';
    let cycledEffort = '';
    let cancelled = false;

    const bar = new BeurreWorkingBar({
      model: 'glm-5-3-flash',
      effort: 'high',
      onSteer: (msg) => { steered = msg; },
      onCycleEffort: (eff) => { cycledEffort = eff; },
      onCancel: () => { cancelled = true; },
    });

    // Initial state
    expect(bar.getInputBuffer()).toBe('');
    expect(bar.getEffort()).toBe('high');

    // Type characters
    bar.handleInput('s');
    bar.handleInput('t');
    bar.handleInput('e');
    bar.handleInput('e');
    bar.handleInput('r');
    expect(bar.getInputBuffer()).toBe('steer');

    // Backspace
    bar.handleInput('\x7f');
    expect(bar.getInputBuffer()).toBe('stee');

    // Shift+Tab effort cycle
    bar.handleInput('\x1b[Z');
    expect(cycledEffort).toBe('xhigh');
    expect(bar.getEffort()).toBe('xhigh');

    // Enter to submit steering message
    bar.handleInput('\r');
    expect(steered).toBe('stee');
    expect(bar.getInputBuffer()).toBe(''); // reset after steer

    // Esc to cancel
    bar.handleInput('\x1b');
    expect(cancelled).toBe(true);

    bar.stop();
  });

  it('should queue and inject steering messages into BeurreAgent', () => {
    const agent = new BeurreAgent({ autoSync: false, model: 'glm-5-3-flash' });
    expect(agent.getSteeringQueue()).toEqual([]);

    agent.steer('focus on test 3');
    expect(agent.getSteeringQueue()).toEqual(['focus on test 3']);

    agent.steer('also verify error formatting');
    expect(agent.getSteeringQueue()).toEqual(['focus on test 3', 'also verify error formatting']);
  });

  it('should keep getCursorCol strictly bounded within columns across long inputs and narrow terminals', () => {
    const bar = new BeurreWorkingBar({ model: 'glm-5-3-flash' });

    // Empty buffer starts at column 3 (after '> ')
    expect(bar.getCursorCol(80)).toBe(3);
    expect(bar.getCursorCol(40)).toBe(3);

    // Short buffer within width
    bar.setInputBuffer('hello');
    expect(bar.getCursorCol(80)).toBe(8); // 3 + 5

    // Very long buffer in narrow terminal (e.g. 100 characters in 40 columns)
    const longText = 'a'.repeat(100);
    bar.setInputBuffer(longText);

    for (const cols of [20, 30, 40, 60, 80, 100]) {
      const col = bar.getCursorCol(cols);
      expect(col).toBeGreaterThanOrEqual(3);
      expect(col).toBeLessThanOrEqual(cols);
    }

    bar.stop();
  });

  it('should handle bracketed paste input cleanly in BeurreWorkingBar', () => {
    const bar = new BeurreWorkingBar({ model: 'glm-5-3-flash' });

    // Terminal sends bracketed paste
    bar.handleInput('\x1b[200~paste this steering command\x1b[201~');
    expect(bar.getInputBuffer()).toBe('paste this steering command');

    // Multi-line paste gets sanitized into single-line
    bar.handleInput('\x1b[200~line1\nline2\r\nline3\x1b[201~');
    expect(bar.getInputBuffer()).toContain('line1 line2 line3');

    bar.stop();
  });

  it('should format thinking status with optional reasoning snippet matching Claude Code template', () => {
    const bar = new BeurreWorkingBar({ model: 'glm-5-3-flash' });

    bar.setThinking(140, 2.1, 'Initial hypothesis');
    expect(bar.getStatusText()).toBe('Thinking (~140 tokens • 2.1s): Initial hypothesis...');

    bar.setThinking(250, 3.5);
    expect(bar.getStatusText()).toBe('Thinking (~250 tokens • 3.5s)...');

    bar.stop();
  });
});


describe('colour palette integrity', () => {
  // 45 is the tightest separation achievable with 7 tools + 4 fixed butter
  // tones; the old palette collapsed to 32 (edit vs write).
  const TOOLS = [
    'toolBash', 'toolRead', 'toolEdit', 'toolWrite',
    'toolSearch', 'toolImage', 'toolSubagent',
  ];
  const BUTTER = ['butterGold', 'butterMelt', 'butterCrust', 'butterPale'];
  const dist = (a: number[], b: number[]) => Math.hypot(...a.map((v, i) => v - b[i]));

  it('gives every tool a distinct colour', () => {
    for (let i = 0; i < TOOLS.length; i++) {
      for (let j = i + 1; j < TOOLS.length; j++) {
        const d = dist(PALETTE_RGB[TOOLS[i]], PALETTE_RGB[TOOLS[j]]);
        expect(d).toBeGreaterThan(45);
      }
    }
  });

  it('keeps tool colours clear of the brand butter palette', () => {
    for (const t of TOOLS) {
      for (const b of BUTTER) {
        expect(dist(PALETTE_RGB[t], PALETTE_RGB[b])).toBeGreaterThan(70);
      }
    }
  });

  it('keeps the RGB map in sync with the emitted tokens', () => {
    // The map exists so palette tests work under NO_COLOR; if it drifts from
    // the real escapes, every assertion above becomes theatre.
    for (const name of [...TOOLS, ...BUTTER] as const) {
      const [r, g, b] = PALETTE_RGB[name];
      const expected = `\x1b[38;2;${r};${g};${b}m`;
      const emitted = (colors as Record<string, string>)[name];
      expect(emitted === "" || emitted === expected).toBe(true);
    }
  });
});

describe('banner', () => {
  // The model column was truncated with a `width - 34` guess, which cut the
  // model id mid-word, and the hint line had no short-width fallback.
  for (const cols of [30, 40, 46, 56, 63, 64, 72, 80, 100, 120]) {
    it(`never exceeds ${cols} columns`, () => {
      const prev = process.stdout.columns;
      process.stdout.columns = cols;
      const lines = stripAnsi(banner('1.0.0', 'glm-5-3-flash', '/home/alex/Projects/beurre', 'high')).split('\n');
      process.stdout.columns = prev;
      for (const line of lines) {
        expect(stringWidth(line)).toBeLessThanOrEqual(cols);
      }
    });
  }

  it('keeps model and effort metadata compact on one headline', () => {
    const prev = process.stdout.columns;
    process.stdout.columns = 80;
    const lines = stripAnsi(banner('1.0.0', 'glm-5-3-flash', '/home/alex/Projects/beurre', 'high')).split('\n');
    process.stdout.columns = prev;
    expect(lines[0]).toContain('beurre v1.0.0');
    expect(lines[0]).toContain('GLM 5.3 Flash');
    expect(lines[0]).toContain('high');
    expect(lines[0]).not.toContain('model  ');
    expect(lines[0]).not.toContain('effort  ');
  });

  it('drops the model id and shortens hints on a narrow terminal', () => {
    const prev = process.stdout.columns;
    process.stdout.columns = 46;
    const out = stripAnsi(banner('1.0.0', 'glm-5-3-flash', '/home/alex/Projects/beurre', 'high'));
    process.stdout.columns = prev;
    expect(out).not.toContain('glm-5-3-flash');
    expect(out).toContain('/menu');
  });

  it('reads the version from package.json rather than a literal', () => {
    expect(BEURRE_VERSION).toBe(pkg.version);
  });
});

describe('the banner hint', () => {
  // The hint used to be picked by a hardcoded breakpoint, which truncated the
  // shortest tier at 24 columns into `Type a task.  /menu  /…` — a command
  // name clipped past recognition. Whichever tier is chosen it must be whole.
  it('never truncates a command name at any width', () => {
    const prev = process.stdout.columns;
    for (let w = 20; w <= 200; w++) {
      process.stdout.columns = w;
      const line = banner('1.0.0', 'glm-5-3-flash', '/tmp', 'high')
        .split('\n')
        .find((l) => l.includes('/help'));
      expect(line).toBeDefined();
      expect(line).not.toMatch(/\/\w*…/);
    }
    process.stdout.columns = prev;
  });
});

describe('the Beurre mark', () => {
  it('renders three tinted rows', () => {
    const mark = logoMark();
    expect(mark).toHaveLength(3);
    // A slab of butter, sliced: solid block in the middle, a pale cut
    // line on top, a melted taper underneath. All three rows span the
    // same six columns — the taper used to stop two columns early and
    // the mark looked bitten from the right.
    expect(stripAnsi(mark[0])).toBe('▟████▛');
    expect(stripAnsi(mark[1])).toBe('██████');
    expect(stripAnsi(mark[2])).toBe('▗▄▄▄▘');
  });

  it('leaves no row wider than the width it reserves', () => {
    // LOGO_GUTTER must cover the indent, the widest mark row and the gutter
    // between mark and content. When it was short by one, every marked row
    // landed a single column past the right margin.
    const widest = Math.max(...logoMark().map((r) => stringWidth(r)));
    expect(LOGO_GUTTER).toBeGreaterThanOrEqual(widest + 3);
    const prev = process.stdout.columns;
    process.stdout.columns = 100;
    for (const row of banner().split('\n')) {
      expect(stringWidth(row)).toBeLessThanOrEqual(100);
    }
    process.stdout.columns = prev;
  });

  it('keeps the startup banner compact instead of spending rows on the logo', () => {
    const prev = process.stdout.columns;
    process.stdout.columns = 40;
    const narrow = banner().split('\n');
    process.stdout.columns = 100;
    const wide = banner().split('\n');
    process.stdout.columns = prev;
    expect(narrow.length).toBe(3);
    expect(wide.length).toBe(3);
    expect(narrow.join('\n')).not.toContain('▄');
    expect(wide.join('\n')).not.toContain('▄');
  });

  it('never overflows the terminal, at any width', () => {
    const prev = process.stdout.columns;
    for (let w = 20; w <= 160; w += 1) {
      process.stdout.columns = w;
      for (const row of banner().split('\n')) {
        expect(stringWidth(row)).toBeLessThanOrEqual(w);
      }
    }
    process.stdout.columns = prev;
  });
});
