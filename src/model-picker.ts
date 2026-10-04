import readline from 'node:readline';
import { relay, type RelayModel, type RelayProvider } from './relay.ts';
import { b, colors, ButterSpinner } from './theme.ts';

export async function openModelPicker(
  currentModelId: string,
  onSelect: (modelId: string) => void,
  rl?: readline.Interface
): Promise<string> {
  const ask = (query: string): Promise<string> => {
    if (rl) {
      return new Promise((resolve) => rl.question(query, (ans) => resolve(ans.trim())));
    }
    const tempRl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise((resolve) => {
      tempRl.question(query, (ans) => {
        tempRl.close();
        resolve(ans.trim());
      });
    });
  };

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

  const liveProvidersCount = providers.filter((p) => p.live).length;
  let filterQuery = '';

  while (true) {
    console.clear();
    console.log(`\n${colors.butterGold}╭── 🧈 BEURRE MODEL NAVIGATOR ──────────────────────────────────────────────╮${colors.reset}`);
    console.log(`${colors.butterGold}│${colors.reset}  ${b.bold('Active Model:')} ${b.badge(currentModelId)}   ${colors.dim}•${colors.reset}   ${b.bold('Relay Upstreams:')} ${b.green(`● ${liveProvidersCount} live`)} / ${providers.length} total ${colors.butterGold}│${colors.reset}`);
    console.log(`${colors.butterGold}╰───────────────────────────────────────────────────────────────────────────╯${colors.reset}`);

    // Filter models
    const filtered = models.filter((m) => {
      if (!filterQuery) return true;
      const q = filterQuery.toLowerCase();
      return (
        m.id.toLowerCase().includes(q) ||
        (m.name && m.name.toLowerCase().includes(q)) ||
        (m.owned_by && m.owned_by.toLowerCase().includes(q))
      );
    });

    console.log(`\n  ${colors.dim}Filter:${colors.reset} ${filterQuery ? b.gold(`"${filterQuery}"`) : b.dim('(all models)')} ${colors.dim}— showing ${filtered.length} of ${models.length} models${colors.reset}`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}\n`);

    // Categorized Sections if no filter, or search list if filtered
    const displayList = filtered.slice(0, 15);

    if (displayList.length === 0) {
      console.log(`  ${b.red('No models matched your filter.')} Try a different search query.\n`);
    } else {
      displayList.forEach((m, idx) => {
        const num = (idx + 1).toString().padStart(2, ' ');
        const isCurrent = m.id === currentModelId;
        const selectorBadge = isCurrent
          ? `${colors.bgButterGold}${colors.bold} 🧈 ACTIVE ${colors.reset} `
          : `   ${b.gold(`[${num}]`)}   `;

        const ctxTag = m.context_length
          ? `${colors.cyan}${Math.round(m.context_length / 1000)}k ctx${colors.reset}`
          : '';
        const reasonTag = m.reasoning ? `${colors.butterPale}🧠 reasoning${colors.reset}` : '';
        const providerTag = m.owned_by ? `${colors.dim}via ${m.owned_by}${colors.reset}` : '';

        const tags = [ctxTag, reasonTag, providerTag].filter(Boolean).join(' • ');

        console.log(`${selectorBadge}${b.bold(m.id.padEnd(28))} ${tags}`);
      });

      if (filtered.length > 15) {
        console.log(`\n  ${colors.dim}... and ${filtered.length - 15} more models. Type to search/filter.${colors.reset}`);
      }
    }

    console.log(`\n${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);
    console.log(`  ${b.bold('Commands:')} ${b.gold('[1..15]')} select  •  ${b.gold('/f <query>')} filter  •  ${b.gold('/all')} reset filter  •  ${b.gold('/q')} back`);
    console.log(`${colors.dim}─────────────────────────────────────────────────────────────────────────────${colors.reset}`);

    const input = await ask(`\n${b.gold('🧈 Select [1-15], search term, or model ID:')} `);

    if (!input || input === '/q' || input.toLowerCase() === 'exit') {
      break;
    }

    if (input.startsWith('/f ')) {
      filterQuery = input.slice(3).trim();
      continue;
    }

    if (input === '/all') {
      filterQuery = '';
      continue;
    }

    const num = parseInt(input, 10);
    if (!isNaN(num) && num >= 1 && num <= displayList.length) {
      const selected = displayList[num - 1].id;
      onSelect(selected);
      console.log(`\n${b.green('🧈 Model successfully switched to:')} ${b.gold(selected)}\n`);
      return selected;
    }

    // Direct model match or search string
    const directMatch = models.find((m) => m.id.toLowerCase() === input.toLowerCase());
    if (directMatch) {
      onSelect(directMatch.id);
      console.log(`\n${b.green('🧈 Model successfully switched to:')} ${b.gold(directMatch.id)}\n`);
      return directMatch.id;
    }

    // If input is text, treat it as a filter search query
    filterQuery = input;
  }

  return currentModelId;
}
