// Permanent width contract for every renderer, including empty and hostile
// inputs.
//
// The defect this catches is between surfaces, not inside one: a renderer a
// column too wide makes its overlay erase by the wrong line count, so the whole
// screen drifts. That is invisible in a screenshot of one command and obvious
// the moment two commands are used in a row.

import { describe, expect, test } from 'bun:test';
import {
  renderCheckpoints,
  renderCost,
  renderDoctor,
  renderGrep,
  renderHistory,
  renderOutline,
  renderSnippets,
  renderStats,
  renderToolCatalog,
} from '../src/features.ts';
import { renderAuthors, renderDecisions, renderHotspots, renderReplay, renderReview } from '../src/features3.ts';
import { stringWidth } from '../src/layout.ts';

const WIDTHS = [20, 26, 30, 34, 46, 62, 80, 120, 200];

// One entry per renderer branch, each taking the width as its last argument.
// Both the empty and the populated branch, because the empty branch is where
// the bugs actually were: it is the branch nobody screenshots.
const CASES: [string, (w: number) => string[] | string][] = [
  ['checkpoints empty', (w) => renderCheckpoints([], w)],
  ['checkpoints full', (w) => renderCheckpoints([{ id: 'a', label: 'l', at: '2026-01-01T00:00:00Z' }], w)],
  ['cost known model', (w) => renderCost('gpt-4', 0, w)],
  ['cost unknown model', (w) => renderCost('unknown-model', 100, w)],
  ['doctor empty', (w) => renderDoctor([], w)],
  ['doctor full', (w) => renderDoctor([{ name: 'n', ok: true, detail: 'd' }], w)],
  ['doctor one failed', (w) => renderDoctor([{ name: 'n', ok: false, detail: 'd' }], w)],
  ['grep empty', (w) => renderGrep([], 'pat', w)],
  ['history empty', (w) => renderHistory([], w)],
  ['history long message', (w) => renderHistory([{ role: 'assistant', content: 'x'.repeat(900) }], w)],
  ['outline empty', (w) => renderOutline([], w)],
  ['snippets empty', (w) => renderSnippets([], w)],
  ['stats zeroed', (w) => renderStats({ turns: 0, user: 0, assistant: 0, tools: 0, thinking: 0, estTokens: 0 }, 'm', w)],
  ['tool catalog empty', (w) => renderToolCatalog([], w)],
  ['decisions empty', (w) => renderDecisions([], w)],
  ['decisions full', (w) => renderDecisions([{ title: 't', rationale: 'r', area: 'a', at: '2026-01-01T00:00:00Z' }], w)],
  ['replay empty', (w) => renderReplay('/f', [], w)],
  ['replay unreadable', (w) => renderReplay('/f', null, w)],
  ['replay long message', (w) => renderReplay('/f', [{ role: 'assistant', content: 'y'.repeat(900) }], w)],
  ['review clean tree', (w) => renderReview([], '/tmp', w)],
  ['review full', (w) => renderReview([{ status: 'M', file: 'src/theme.ts', adds: 12, dels: 3 }], '/tmp', w)],
  ['hotspots empty', (w) => renderHotspots([], w)],
  ['authors empty', (w) => renderAuthors([], '/f', w)],
];

// Renderers return either `string[]` or a joined string; both are printed one
// line at a time, so split before measuring or the newline counts as width.
function widest(out: string[] | string): number {
  const arr = Array.isArray(out) ? out : String(out).split('\n');
  return Math.max(...arr.map((l) => stringWidth(l)));
}

describe('every renderer fits the terminal', () => {
  for (const [name, render] of CASES) {
    test(`${name} never exceeds the width`, () => {
      for (const w of WIDTHS) {
        const got = widest(render(w));
        // `box()` floors at 20 columns, so a terminal narrower than that cannot
        // be satisfied; those widths are excluded above rather than asserted.
        expect(got).toBeLessThanOrEqual(w);
      }
    });
  }
});