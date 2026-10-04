import readline from 'node:readline';
import { relay, type RelayModel, type RelayProvider, getModelDisplayName } from './relay.ts';
import { b, colors, ButterSpinner, renderToast } from './theme.ts';

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

export async function openModelPicker(
  currentModelId: string,
  onSelect: (modelId: string) => void,
  legacyRl?: readline.Interface
): Promise<string> {
  const isTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  const spinner = new ButterSpinner();
  spinner.start('Discovering live models from Relay Gateway...');
  let models: RelayModel[] = [];
  let providers: RelayProvider[] = [];

  try {
    [models, providers] = await Promise.all([
      relay.fetchLiveModels(),
      relay.fetchProviders(),
    ]);
    spinner.stop();
  } catch (err: any) {
    spinner.stop();
    console.error(`${b.red('Error loading models:')} ${err.message}`);
    return currentModelId;
  }

  if (models.length === 0) {
    console.log(`${b.red('No models available from Relay Gateway.')}`);
    return currentModelId;
  }

  if (!isTTY) {
    return openModelPickerFallback(currentModelId, models, onSelect, legacyRl);
  }

  const liveProvidersCount = providers.filter((p) => p.live).length;
  let filterQuery = '';
  let selectedIdx = 0;
  let scrollOffset = 0;
  const pageSize = 12;

  const stdin = process.stdin;
  const stdout = process.stdout;

  const render = () => {
    console.clear();
    const cols = Math.min(stdout.columns || 80, 80);
    const stripAnsi = (str: string) => str.replace(/\x1b\[[0-9;]*m/g, '');

    const title = ` 🧈 BEURRE MODEL NAVIGATOR `;
    const borderLen = Math.max(0, cols - title.length - 3);

    console.log(`${colors.butterGold}╭──${colors.bold}${title}${colors.reset}${colors.butterGold}${'─'.repeat(borderLen)}╮${colors.reset}`);
    const infoText = `  ${b.bold('Active:')} ${b.badge(currentModelId)}  ${colors.dim}•${colors.reset}  ${b.bold('Upstreams:')} ${b.green(`● ${liveProvidersCount} live`)} / ${providers.length} total`;
    const infoLen = stripAnsi(infoText).length;
    const padHeader = Math.max(0, cols - infoLen - 2);
    console.log(`${colors.butterGold}│${colors.reset}${infoText}${' '.repeat(padHeader)}${colors.butterGold}│${colors.reset}`);
    console.log(`${colors.butterGold}╰${'─'.repeat(cols - 2)}╯${colors.reset}\n`);

    const filtered = filterModelList(models, filterQuery);

    // Clamp selectedIdx and scrollOffset
    if (filtered.length === 0) {
      selectedIdx = 0;
      scrollOffset = 0;
    } else {
      if (selectedIdx >= filtered.length) {
        selectedIdx = filtered.length - 1;
      }
      if (selectedIdx < 0) {
        selectedIdx = 0;
      }
      if (selectedIdx < scrollOffset) {
        scrollOffset = selectedIdx;
      } else if (selectedIdx >= scrollOffset + pageSize) {
        scrollOffset = selectedIdx - pageSize + 1;
      }
    }

    const queryDisplay = filterQuery ? b.gold(`"${filterQuery}"`) : b.dim('(all models - type to filter)');
    console.log(`  ${colors.dim}Search / Filter:${colors.reset} ${queryDisplay}`);
    console.log(`  ${colors.dim}Showing ${filtered.length} of ${models.length} models (↑/↓ to navigate, Enter to select, Esc to cancel)${colors.reset}`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);

    const visibleList = filtered.slice(scrollOffset, scrollOffset + pageSize);

    if (filtered.length === 0) {
      console.log(`  ${b.red('No models matched your filter.')} Press Backspace or Esc to reset search.\n`);
    } else {
      visibleList.forEach((m, idx) => {
        const actualIdx = scrollOffset + idx;
        const isSelected = actualIdx === selectedIdx;
        const isCurrent = m.id === currentModelId;

        const pointer = isSelected ? `${colors.butterGold}🧈 ❯${colors.reset} ` : '     ';
        const activeBadge = isCurrent ? ` ${colors.green}${colors.bold}[ACTIVE]${colors.reset}` : '';

        const displayName = getModelDisplayName(m.id, models);
        const hasCustomName = displayName !== m.id;
        const fullLabel = hasCustomName ? `${displayName} (${m.id})` : m.id;

        let formattedLabel = '';
        if (filterQuery && fullLabel.toLowerCase().includes(filterQuery.toLowerCase())) {
          const matchIdx = fullLabel.toLowerCase().indexOf(filterQuery.toLowerCase());
          const before = fullLabel.slice(0, matchIdx);
          const match = fullLabel.slice(matchIdx, matchIdx + filterQuery.length);
          const after = fullLabel.slice(matchIdx + filterQuery.length);
          formattedLabel = `${before}${colors.butterGold}${colors.underline}${match}${colors.reset}${after}`;
        } else {
          formattedLabel = hasCustomName
            ? `${colors.bold}${colors.butterCream}${displayName}${colors.reset} ${colors.dim}(${m.id})${colors.reset}`
            : `${colors.bold}${m.id}${colors.reset}`;
        }

        const modelLabel = isSelected
          ? `${colors.bold}${colors.butterGold}${formattedLabel}${colors.reset}`
          : formattedLabel;

        const modelPad = Math.max(1, 38 - stripAnsi(modelLabel).length);

        const ctxTag = m.context_length
          ? `${colors.cyan}${Math.round(m.context_length / 1000)}k ctx${colors.reset}`
          : '';
        const reasonTag = m.reasoning_efforts && m.reasoning_efforts.length > 0
          ? `${colors.butterPale}🧠 ${m.reasoning_efforts.slice(0, 3).join(',')}${colors.reset}`
          : (m.reasoning ? `${colors.butterPale}🧠 reasoning${colors.reset}` : '');
        const providerTag = m.owned_by ? `${colors.dim}via ${m.owned_by}${colors.reset}` : '';

        const tags = [ctxTag, reasonTag, providerTag].filter(Boolean).join(' • ');

        console.log(`${pointer}${modelLabel}${' '.repeat(modelPad)} ${tags}${activeBadge}`);
      });

      if (filtered.length > scrollOffset + pageSize) {
        const remaining = filtered.length - (scrollOffset + pageSize);
        console.log(`\n  ${colors.dim}↓ ... and ${remaining} more models. Scroll down or type to refine.${colors.reset}`);
      } else if (scrollOffset > 0) {
        console.log(`\n  ${colors.dim}↑ ... scrolled down (${scrollOffset} above)${colors.reset}`);
      }
    }

    console.log(`\n${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`  ${b.bold('Shortcuts:')} ${b.gold('Enter')} Select  •  ${b.gold('PgUp/PgDn')} Jump page  •  ${b.gold('Esc')} Cancel/Clear  •  ${b.gold('Backspace')} Delete`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
  };

  return new Promise<string>((resolve) => {
    stdin.setRawMode(true);
    stdin.resume();

    render();

    const onData = (chunk: Buffer) => {
      const str = chunk.toString('utf-8');

      // Esc: If filter query exists, clear search first. If already empty, cancel and exit.
      if (str === '\x1b') {
        if (filterQuery.length > 0) {
          filterQuery = '';
          selectedIdx = 0;
          scrollOffset = 0;
          render();
          return;
        }
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        console.clear();
        console.log(`\n${b.dim('Model selection cancelled.')}\n`);
        resolve(currentModelId);
        return;
      }

      // Ctrl+C
      if (str === '\x03') {
        stdin.removeListener('data', onData);
        stdin.setRawMode(false);
        console.clear();
        console.log(`\n${b.dim('Model selection cancelled.')}\n`);
        resolve(currentModelId);
        return;
      }

      // Enter
      if (str === '\r' || str === '\n') {
        const filtered = filterModelList(models, filterQuery);
        if (filtered.length > 0 && selectedIdx >= 0 && selectedIdx < filtered.length) {
          const chosen = filtered[selectedIdx].id;
          stdin.removeListener('data', onData);
          stdin.setRawMode(false);
          console.clear();
          onSelect(chosen);
          console.log(`\n${renderToast(`Model switched to: ${chosen}`, true)}\n`);
          resolve(chosen);
          return;
        }
      }

      // Up arrow: \x1b[A
      if (str === '\x1b[A') {
        if (selectedIdx > 0) {
          selectedIdx--;
        }
        render();
        return;
      }

      // Down arrow: \x1b[B
      if (str === '\x1b[B') {
        const filtered = filterModelList(models, filterQuery);
        if (selectedIdx < filtered.length - 1) {
          selectedIdx++;
        }
        render();
        return;
      }

      // PageUp: \x1b[5~
      if (str === '\x1b[5~') {
        selectedIdx = Math.max(0, selectedIdx - pageSize);
        render();
        return;
      }

      // PageDown: \x1b[6~
      if (str === '\x1b[6~') {
        const filtered = filterModelList(models, filterQuery);
        selectedIdx = Math.min(Math.max(0, filtered.length - 1), selectedIdx + pageSize);
        render();
        return;
      }

      // Home: \x1b[H or \x1b[1~ or Ctrl+A (\x01)
      if (str === '\x1b[H' || str === '\x1b[1~' || str === '\x01') {
        selectedIdx = 0;
        scrollOffset = 0;
        render();
        return;
      }

      // End: \x1b[F or \x1b[4~ or Ctrl+E (\x05)
      if (str === '\x1b[F' || str === '\x1b[4~' || str === '\x05') {
        const filtered = filterModelList(models, filterQuery);
        selectedIdx = Math.max(0, filtered.length - 1);
        render();
        return;
      }

      // Backspace: \x7f or \x08
      if (str === '\x7f' || str === '\x08') {
        if (filterQuery.length > 0) {
          filterQuery = filterQuery.slice(0, -1);
          selectedIdx = 0;
          scrollOffset = 0;
          render();
        }
        return;
      }

      // Printable character typing (search filter)
      // Exclude escape sequences, tabs, carriage returns, etc.
      if (!str.startsWith('\x1b') && str.length >= 1 && !['\r', '\n', '\t', '\x03', '\x04'].includes(str)) {
        filterQuery += str;
        selectedIdx = 0;
        scrollOffset = 0;
        render();
      }
    };

    stdin.on('data', onData);
  });
}

async function openModelPickerFallback(
  currentModelId: string,
  models: RelayModel[],
  onSelect: (modelId: string) => void,
  legacyRl?: readline.Interface
): Promise<string> {
  const ask = (query: string): Promise<string> => {
    if (legacyRl) {
      return new Promise((resolve) => legacyRl.question(query, (ans) => resolve(ans.trim())));
    }
    const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      tempRl.question(query, (ans) => {
        tempRl.close();
        resolve(ans.trim());
      });
    });
  };

  models.slice(0, 15).forEach((m, idx) => {
    const displayName = getModelDisplayName(m.id, models);
    const label = displayName !== m.id ? `${displayName} (${m.id})` : m.id;
    console.log(`[${idx + 1}] ${label}`);
  });
  const input = await ask('Select model number or ID: ');
  const num = parseInt(input, 10);
  if (!isNaN(num) && num >= 1 && num <= 10) {
    const chosen = models[num - 1].id;
    onSelect(chosen);
    return chosen;
  }
  const match = models.find((m) => m.id.toLowerCase() === input.toLowerCase());
  if (match) {
    onSelect(match.id);
    return match.id;
  }
  return currentModelId;
}
