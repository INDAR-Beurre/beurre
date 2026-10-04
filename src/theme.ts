// Beurre Theme — Buttery Yellow Aesthetic (ANSI 256 / TrueColor)

export const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Butter Yellow Palette
  butterGold: '\x1b[38;2;250;204;21m',       // #FACC15 (Vibrant Gold)
  butterCream: '\x1b[38;2;254;249;195m',     // #FEF9C3 (Soft Butter)
  butterMelt: '\x1b[38;2;245;158;11m',       // #F59E0B (Melted Amber)
  butterCrust: '\x1b[38;2;217;119;6m',       // #D97706 (Toasted Crust)
  butterPale: '\x1b[38;2;254;240;138m',      // #FEF08A (Light Butter)

  // Accents
  white: '\x1b[38;2;255;255;255m',
  gray: '\x1b[38;2;168;162;158m',
  darkGray: '\x1b[38;2;120;113;108m',
  green: '\x1b[38;2;132;204;22m',            // #84CC16 (Success)
  red: '\x1b[38;2;239;68;68m',               // #EF4444 (Error)
  cyan: '\x1b[38;2;56;189;248m',             // #38BDF8 (Info)

  // Backgrounds
  bgButterGold: '\x1b[48;2;250;204;21m\x1b[30m',
  bgButterMelt: '\x1b[48;2;245;158;11m\x1b[30m',
  bgCrust: '\x1b[48;2;217;119;6m\x1b[37m',
  bgDark: '\x1b[48;2;28;25;23m',
};

export const b = {
  gold: (text: string | number) => `${colors.butterGold}${text}${colors.reset}`,
  cream: (text: string | number) => `${colors.butterCream}${text}${colors.reset}`,
  melt: (text: string | number) => `${colors.butterMelt}${text}${colors.reset}`,
  crust: (text: string | number) => `${colors.butterCrust}${text}${colors.reset}`,
  pale: (text: string | number) => `${colors.butterPale}${text}${colors.reset}`,
  bold: (text: string | number) => `${colors.bold}${text}${colors.reset}`,
  dim: (text: string | number) => `${colors.dim}${text}${colors.reset}`,
  gray: (text: string | number) => `${colors.gray}${text}${colors.reset}`,
  green: (text: string | number) => `${colors.green}${text}${colors.reset}`,
  red: (text: string | number) => `${colors.red}${text}${colors.reset}`,
  cyan: (text: string | number) => `${colors.cyan}${text}${colors.reset}`,
  badge: (label: string) => `${colors.bgButterGold}${colors.bold} ${label} ${colors.reset}`,
  subagentBadge: (name: string) => `${colors.bgButterMelt}${colors.bold} 🧈 ${name} ${colors.reset}`,
};

export function banner(version = '1.0.0'): string {
  const line1 = '🧈 ╭──────────────────────────────────────────────────────────╮';
  const line2 = `   │  ${colors.bold}${colors.butterGold}B E U R R E${colors.reset}  ${colors.dim}v${version}${colors.reset} — ${colors.butterCream}L'Agent Fondant & Autonome${colors.reset}         │`;
  const line3 = `   │  ${colors.dim}Model Aggregator • Relay Gateway • Auto-Looping${colors.reset}     │`;
  const line4 = '   ╰──────────────────────────────────────────────────────────╯';
  return `\n${colors.butterMelt}${line1}\n${line2}\n${line3}\n${colors.butterMelt}${line4}${colors.reset}\n`;
}

export function butterBox(title: string, content: string, borderColor = colors.butterMelt): string {
  const width = Math.min(process.stdout.columns || 80, 80);
  const top = `${borderColor}╭─ 🧈 ${colors.bold}${title}${colors.reset}${borderColor} ${'─'.repeat(Math.max(0, width - title.length - 8))}╮${colors.reset}`;
  const bottom = `${borderColor}╰${'─'.repeat(Math.max(0, width - 2))}╯${colors.reset}`;
  const lines = content.split('\n').map((l) => `${borderColor}│${colors.reset} ${l}`).join('\n');
  return `${top}\n${lines}\n${bottom}`;
}

export class ButterSpinner {
  private frames = ['🧈 ⠋', '🧈 ⠙', '🧈 ⠹', '🧈 ⠸', '🧈 ⠼', '🧈 ⠴', '🧈 ⠦', '🧈 ⠧', '🧈 ⠇', '🧈 ⠏'];
  private idx = 0;
  private timer: Timer | null = null;
  private message = '';
  private isTTY = Boolean(process.stdout.isTTY);

  start(message: string) {
    this.message = message;
    this.idx = 0;
    if (this.timer) clearInterval(this.timer);
    if (!this.isTTY) return;
    process.stdout.write('\x1b[?25l'); // Hide cursor
    this.render();
    this.timer = setInterval(() => {
      this.idx = (this.idx + 1) % this.frames.length;
      this.render();
    }, 80);
  }

  update(message: string) {
    this.message = message;
    if (this.isTTY) {
      this.render();
    }
  }

  stop(finalText?: string) {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.isTTY) {
      process.stdout.write('\r\x1b[K'); // Clear line
      process.stdout.write('\x1b[?25h'); // Show cursor
    }
    if (finalText) {
      console.log(finalText);
    }
  }

  private render() {
    if (!this.isTTY) return;
    process.stdout.write(`\r\x1b[K${colors.butterGold}${this.frames[this.idx]}${colors.reset} ${colors.butterCream}${this.message}${colors.reset}`);
  }
}
