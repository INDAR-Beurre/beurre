import readline from 'node:readline';
import { relay, type RelayModel, type RelayProvider, getModelDisplayName } from './relay.ts';
import { b, colors, ButterSpinner, renderToast } from './theme.ts';
import { box, padTo, stringWidth, truncate } from './layout.ts';

export function filterModelList(models: RelayModel[], query: string): RelayModel[] {
  if (!query) return models;
  const q = query.toLowerCase().trim();
  return models.filter((m) => {
    const disp = getModelDisplayName(m.id, models);
    return (
      m.id.toLowerCase().includes(q) ||
      (m.name && m.name.toLowerCase().includes(q)) ||
      (disp && disp.toLowerCase().includes(q)) ||
      (m.owned_by && m.owned_by.toLowerCase().includes(q))
    );
  });
}

/**
 * Pure renderer for the model picker: state in, lines out. Kept at module level
 * so the width and viewport invariants are testable without a pty — the old
 * inline version wrote straight to stdout using raw `.length` on ANSI-bearing
 * strings, which is why it went ragged below 80 columns.
 */
export function renderModelList(
  models: RelayModel[],
  selected: number,
  query: string,
  width: number,
  currentModelId: string,
  opts: { scrollOffset?: number; pageSize?: number; liveProviders?: number; totalProviders?: number } = {},
): string[] {
  // box() floors its own width at 20; clamping to 24 here instead made the
  // picker 4 columns wider than the terminal it was asked to fit in, and
  // every row wrapped mid-frame at 20-23 columns.
  const cols = Math.max(20, Math.min(width, 120));
  const scrollOffset = Math.max(0, Math.min(opts.scrollOffset ?? 0, models.length));
  const pageSize = opts.pageSize ?? Math.max(3, Math.min(20, Math.floor(cols / 2)));
  const filtered = filterModelList(models, query);
  const selectedIdx = filtered.length === 0 ? 0 : Math.max(0, Math.min(selected, filtered.length - 1));

  // Every other surface in the app is a `box()`: titled, bordered, with a
  // footer of key hints. The picker floated free of all of it, so opening
  // /models looked like a different program had taken over the screen.
  const lines: string[] = [
    `${colors.dim}current${colors.reset} ${colors.butterCream}${truncate(getModelDisplayName(currentModelId), cols - 22)}${colors.reset}` +
      `${colors.dim}  ·  ${opts.liveProviders ?? 0} live of ${opts.totalProviders ?? 0} providers${colors.reset}`,
    '',
    `  ${colors.butterGold}search${colors.reset} ${
      query ? `${colors.white}${truncate(query, cols - 12)}${colors.reset}` : `${colors.darkGray}type to filter…${colors.reset}`
    }`,
  ];

  if (filtered.length === 0) {
    lines.push(truncate(`  ${colors.dim}no model matches “${query}”`, cols));
  } else {
    const start = Math.min(scrollOffset, Math.max(0, filtered.length - 1));
    const visible = filtered.slice(start, start + pageSize);

    // Two columns, not one. Measuring name+id together put the id flush
    // against the name ("GLM 5.3 Flash glm-5-3-flash"), which reads as a
    // single token. Measure each independently.
    const nameCol = Math.min(
      Math.max(8, ...visible.map((m) => stringWidth(getModelDisplayName(m.id, models)))),
      Math.floor(cols * 0.45),
    );
    const idCol = Math.min(
      Math.max(6, ...visible.map((m) => stringWidth(m.id))),
      Math.floor(cols * 0.3),
    );

    visible.forEach((m, i) => {
      const isSelected = start + i === selectedIdx;
      const pointer = isSelected ? `${colors.butterGold}❯${colors.reset}` : ' ';
      const displayName = getModelDisplayName(m.id, models);

      // Highlight the matched run so the user can see *why* a row matched;
      // the old plain substring filter never explained its results.
      const at = query ? displayName.toLowerCase().indexOf(query.toLowerCase()) : -1;
      const name = displayName;
      const painted = isSelected
        ? `${colors.bold}${colors.butterGold}${name}${colors.reset}`
        : at < 0
          ? `${colors.white}${name}${colors.reset}`
          : `${colors.white}${name.slice(0, at)}${colors.reset}${colors.bold}${colors.butterGold}${name.slice(at, at + query.length)}${colors.reset}${colors.white}${name.slice(at + query.length)}${colors.reset}`;
      const ctxTag = m.context_length ? `${colors.cyan}${Math.round(m.context_length / 1000)}k${colors.reset}` : '';
      const reasonTag = m.reasoning_efforts?.length
        ? `${colors.butterPale}${m.reasoning_efforts.slice(0, 2).join(',')}${colors.reset}`
        : m.reasoning ? `${colors.butterPale}reasoning${colors.reset}` : '';
      const viaTag = m.owned_by ? `${colors.dim}${truncate(m.owned_by, 18)}${colors.reset}` : '';
      const activeTag = m.id === currentModelId ? `${colors.green}active${colors.reset}` : '';
      const tags = [ctxTag, reasonTag, viaTag, activeTag].filter(Boolean).join(` ${colors.dim}·${colors.reset} `);

      // The id only gets its own column when the terminal is wide enough to
      // keep both legible; below that it is dropped rather than truncated.
      const room = cols - nameCol - 12;
      const idCell = room >= idCol ? `${colors.dim}${padTo(m.id, idCol)}${colors.reset}` : '';
      const row = `  ${pointer} ${padTo(painted, nameCol)}  ${idCell}  ${tags}`;
      lines.push(truncate(row, cols));
    });
    if (start + pageSize < filtered.length) {
      lines.push(truncate(`  ${colors.dim}↓ ${filtered.length - start - pageSize} more${colors.reset}`, cols));
    }
  }

  return box({
    title: 'select a model',
    width: cols,
    lines,
    footer: `${colors.dim}${filtered.length} of ${models.length} models · ↑↓ move · enter select · esc close${colors.reset}`,
  });
}

/**
 * Interactive model picker. Renders through `renderModelList` (pure, testable)
 * and drives navigation itself so it stays usable on a non-TTY stdin.
 */
export async function openModelPicker(
  currentModelId: string,
  onSelect: (modelId: string) => void,
  legacyRl?: readline.Interface,
): Promise<string> {
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const spinner = new ButterSpinner();
  spinner.start('Discovering live models from Relay Gateway...');
  let models: RelayModel[] = [];
  let providers: RelayProvider[] = [];

  try {
    // These were `relay.listModels()` / `relay.listProviders()`, which do not
    // exist on RelayClient — the picker threw a TypeError, the catch fired,
    // and /models silently returned to the prompt with no picker ever drawn.
    const [m, p] = await Promise.all([relay.fetchLiveModels(), relay.fetchProviders()]);
    models = m ?? [];
    providers = p ?? [];
  } catch (caught: unknown) {
    const err = caught as { message?: unknown } | null | undefined; // Preserve optional message access and the original thrown-value fallback.
    spinner.stop();
    renderToast(`Could not reach the Relay Gateway: ${err?.message ?? err}`, false);
    return currentModelId;
  }
  spinner.stop();

  if (models.length === 0) {
    renderToast('No models available from the Relay Gateway.', false);
    return currentModelId;
  }

  if (!isTTY) {
    return openModelPickerFallback(currentModelId, models, onSelect, legacyRl);
  }

  const liveProvidersCount = providers.filter((p) => p.live).length;
  let filterQuery = '';
  let selectedIdx = 0;
  let scrollOffset = 0;
  // Chrome costs 7 rows (title, current, blank, search, blank, blank, status),
  // so a fixed page size overflowed short terminals and wasted tall ones.
  const pageSize = () => Math.max(3, Math.min(20, (process.stdout.rows || 24) - 11));

  const stdin = process.stdin;
  const stdout = process.stdout;

  stdout.write('\x1b[?1049h\x1b[?25l');

  const cleanupAndExit = () => {
    stdout.write('\x1b[?25h\x1b[?1049l');
  };

  const paint = () => {
    const width = Math.max(24, Math.min(stdout.columns || 80, 120));
    const lines = renderModelList(models, selectedIdx, filterQuery, width, currentModelId, {
      scrollOffset,
      pageSize: pageSize(),
      liveProviders: liveProvidersCount,
      totalProviders: providers.length,
    });
    stdout.write(`\x1b[H\x1b[2J${lines.join('\n')}\n`);
  };

  return new Promise<string>((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();
    paint();

    const finish = (chosen: string, commit: boolean) => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      cleanupAndExit();
      if (commit) onSelect(chosen);
      resolve(chosen);
    };

    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf-8');
      const filtered = filterModelList(models, filterQuery);
      const repaint = () => paint();

      // Esc clears the query first, then closes — matching every other picker.
      if (str === '\x1b') {
        if (filterQuery.length > 0) {
          filterQuery = '';
          selectedIdx = 0;
          scrollOffset = 0;
          repaint();
          return;
        }
        finish(currentModelId, false);
        return;
      }

      if (str === '\x03') return finish(currentModelId, false);

      if (str === '\r' || str === '\n') {
        if (selectedIdx >= 0 && selectedIdx < filtered.length) finish(filtered[selectedIdx].id, true);
        return;
      }

      if (str === '\x1b[A') {
        if (selectedIdx > 0) selectedIdx--;
        repaint();
        return;
      }

      if (str === '\x1b[B') {
        if (selectedIdx < filtered.length - 1) selectedIdx++;
        repaint();
        return;
      }

      if (str === '\x1b[5~') {
        selectedIdx = Math.max(0, selectedIdx - pageSize());
        repaint();
        return;
      }

      if (str === '\x1b[6~') {
        selectedIdx = Math.min(Math.max(0, filtered.length - 1), selectedIdx + pageSize());
        repaint();
        return;
      }

      if (str === '\x1b[H' || str === '\x1b[1~' || str === '\x01') {
        selectedIdx = 0;
        scrollOffset = 0;
        repaint();
        return;
      }

      if (str === '\x1b[F' || str === '\x1b[4~' || str === '\x05') {
        selectedIdx = Math.max(0, filtered.length - 1);
        repaint();
        return;
      }

      if (str === '\x7f' || str === '\b') {
        if (filterQuery.length > 0) {
          filterQuery = filterQuery.slice(0, -1);
          selectedIdx = 0;
          scrollOffset = 0;
          repaint();
        }
        return;
      }

      // Printable input extends the filter. Pasted text arrives as one chunk,
      // so append it whole rather than dropping all but the first character.
      const control = ['\r', '\n', '\t', '\x03', '\x04', '\x7f', '\b'];
      if (!str.startsWith('\x1b') && str.length > 0 && ![...str].some((ch) => control.includes(ch))) {
        filterQuery += str;
        selectedIdx = 0;
        scrollOffset = 0;
        repaint();
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Non-TTY path: print the catalogue and take an index on stdin so piped runs
 * and CI never block on a full-screen picker.
 */
async function openModelPickerFallback(
  currentModelId: string,
  models: RelayModel[],
  onSelect: (modelId: string) => void,
  legacyRl?: readline.Interface,
): Promise<string> {
  console.log(`\nAvailable models (current: ${getModelDisplayName(currentModelId)}):\n`);
  models.forEach((m, i) => {
    const mark = m.id === currentModelId ? '*' : ' ';
    console.log(`${mark} ${String(i + 1).padStart(3)}. ${m.id}`);
  });

  const rl = legacyRl ?? readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise<string>((resolve) => rl.question('Model number (blank to cancel): ', resolve));
  rl.close();

  const idx = Number.parseInt(answer.trim(), 10);
  if (!Number.isFinite(idx) || idx < 1 || idx > models.length) {
    renderToast('Model unchanged.', false);
    return currentModelId;
  }
  const chosen = models[idx - 1].id;
  onSelect(chosen);
  renderToast(`Model switched to ${getModelDisplayName(chosen)}`);
  return chosen;
}
