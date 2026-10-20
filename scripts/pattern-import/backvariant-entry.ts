// PATTERN-IMPORT · L15 BACK-VARIANT probe (node scripts/pattern-import/backvariant.mjs).
//   1 · notchVariantOf on synthetic labels: a label naming the model is proven and applied; the
//       same pair with the model's name stripped (the mutation) asks; alternatives without any
//       sheet word ask with no suggestion; a non-variant pair stays as drawn; answers apply.
//   2 · kombinezon A and B (e2e cases): P03 «High back notch» / «Low back notch» is ONE question
//       per run with both options in every size; the answer leaves exactly one back notch per size.
//   3 · the real sheet's texts, mutated: without the «Style A … High» words the question stays but
//       has no suggestion; relabelled «Style A/B back notch» it is applied without a question.
// Exit 1 on any failed check.
import type { PtMm, SemanticsOutput, Sheet } from 'lib/pattern-import/types';
import { notchVariantOf, type NotchVariantRead } from 'lib/pattern-import/semantics/notch-variants';
import { CASES, runCase } from './e2e-entry';

const fails: string[] = [];
const check = (ok: boolean, what: string) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`);
  if (!ok) fails.push(what);
};

const at = (x: number, y: number): PtMm => ({ x, y });
const readOf = (labels: (string | null)[], sizes = ['S', 'M', 'L']): NotchVariantRead => ({
  sizes: sizes.map((size, k) => ({
    size,
    notches: labels.map((label, j) => ({ at: at(10 * j, 100 + k), label })),
  })),
});
const MODELS = ['Style A', 'Style B'];

function synthetic() {
  const base = { seed: 1 as const, models: MODELS, chosen: 'Style A' };
  // proven: the label names the model
  const named = notchVariantOf({
    ...base,
    read: readOf(['Style A back notch', 'Style B back notch', null]),
    texts: [],
  });
  check(
    named.kind === 'apply' && named.from === 'label' && [...named.drop].join() === 'style b back',
    `named labels: Style A keeps its own, drops «Style B back notch» (${named.kind})`,
  );
  // the mutation: the model's name removed from the labels — never a guess, a question
  const stripped = notchVariantOf({
    ...base,
    read: readOf(['High back notch', 'Low back notch']),
    texts: ['Cutting line Style A - High Waisted', 'Cutting line Style B - Low waisted'],
  });
  check(
    stripped.kind === 'ask' &&
      stripped.ask.question === 'which back: high / low?' &&
      stripped.ask.options.length === 2 &&
      stripped.ask.suggested === 'high back',
    `model name stripped: asks «which back: high / low?», hint high (${stripped.kind})`,
  );
  // the sheet's words removed too: still a question, no suggestion
  const bare = notchVariantOf({
    ...base,
    read: readOf(['High back notch', 'Low back notch']),
    texts: [],
  });
  check(
    bare.kind === 'ask' && bare.ask.suggested === undefined,
    `no variant words on the sheet: asks, no suggestion (${bare.kind})`,
  );
  // a sheet line naming both models with the word says nothing
  const both = notchVariantOf({
    ...base,
    read: readOf(['High back notch', 'Low back notch']),
    texts: ['Style A and B high waist'],
  });
  check(
    both.kind === 'ask' && both.ask.suggested === undefined,
    `a text naming both models is no hint (${both.kind})`,
  );
  // not variants: front / back, sleeve / bodice
  const plain = notchVariantOf({
    ...base,
    read: readOf(['Front notch', 'Back notch']),
    texts: [],
  });
  check(plain.kind === 'none', `«Front notch» / «Back notch» are not variants (${plain.kind})`);
  // one model only on the sheet, or no model chosen: every notch as drawn
  check(
    notchVariantOf({
      ...base,
      models: ['Style A'],
      read: readOf(['High back notch', 'Low back notch']),
      texts: [],
    }).kind === 'none',
    'a sheet with one model: nothing asked',
  );
  check(
    notchVariantOf({
      ...base,
      chosen: '',
      read: readOf(['High back notch', 'Low back notch']),
      texts: [],
    }).kind === 'none',
    'no model chosen: nothing asked',
  );
  // the answers
  const ans = (answer: string) =>
    notchVariantOf({
      ...base,
      read: readOf(['High back notch', 'Low back notch']),
      texts: [],
      answer,
    });
  const hi = ans('high back');
  check(
    hi.kind === 'apply' && hi.from === 'operator' && [...hi.drop].join() === 'low back',
    'answer «high back»: low back dropped',
  );
  const all = ans('all');
  check(all.kind === 'apply' && all.drop.size === 0, "answer 'all': every notch kept");
  check(ans('sideways').kind === 'ask', 'an answer naming no option asks again');
  // a lone label whose word the sheet ties to the other model
  const lone = notchVariantOf({
    ...base,
    read: readOf(['Low back notch']),
    texts: ['Style B: low waist'],
  });
  check(lone.kind === 'ask', `a lone «Low back notch» tied to Style B: asks (${lone.kind})`);
}

type Seen = {
  pieces: string[];
  question: string;
  options: { key: string; label: string; model: string | null; perSize: number }[];
  suggested: string | null;
  picked: string;
};

export async function main(args: string[]): Promise<boolean> {
  synthetic();
  const want: Record<string, { piece: RegExp; y: number; pick: string }> = {
    'kombinezon-A': { piece: /^P03_/, y: 1271, pick: 'high back' },
    'kombinezon-B': { piece: /^P02_/, y: 1026, pick: 'low back' },
  };
  for (const id of args.length ? args : Object.keys(want)) {
    const c = CASES.find((x) => x.id === id)!;
    let sheet: Sheet | null = null;
    let sem: SemanticsOutput | null = null;
    const rec = (await runCase(c, {
      onWrite: (s) => {
        const S = s as unknown as { sheet: Sheet; semantics: SemanticsOutput };
        sheet = S.sheet;
        sem = S.semantics;
      },
    })) as unknown as { notchVariant?: Seen[]; clicks?: unknown };
    const w = want[id];
    const nv = rec.notchVariant ?? [];
    console.log(`${id} asked: ${JSON.stringify(nv)}`);
    check(nv.length === 1, `${id}: one notch-variant question (${nv.length})`);
    const q = nv[0];
    check(
      !!q &&
        q.question === 'which back: high / low?' &&
        q.options.map((o) => o.key).join('|') === 'high back|low back' &&
        q.options.every((o) => o.perSize === 8),
      `${id}: «which back: high / low?», both options in all 8 sizes`,
    );
    if (w) check(q?.picked === w.pick, `${id}: e2e operator picks the suggested «${w.pick}»`);
    const pieces = (sem as SemanticsOutput | null)?.pieces ?? [];
    const backs = pieces.filter((p) => w && w.piece.test(p.identity));
    check(
      backs.length === 2,
      `${id}: both hands of the back written (${backs.map((p) => p.identity)})`,
    );
    for (const p of backs) {
      const bad = p.sizes.filter(
        (z) => z.notches.length !== 1 || Math.abs(z.notches[0].at.y - w.y) > 2,
      );
      check(
        !bad.length && p.notchVariant === w.pick,
        `${id} ${p.identity}: exactly one back notch per size at y≈${w.y} (${p.sizes.map((z) => z.notches.map((n) => n.at.y.toFixed(0)).join('+')).join(' ')}), answer recorded «${p.notchVariant}»`,
      );
    }
    // 3 · the real labels and the real sheet's words, mutated
    const sh = sheet as Sheet | null;
    if (q && sh) {
      const read: NotchVariantRead = {
        sizes: Array.from({ length: 8 }, (_, k) => ({
          size: String(k),
          notches: [
            { at: at(0, 1271), label: 'High back notch' },
            { at: at(0, 1026), label: 'Low back notch' },
          ],
        })),
      };
      const texts = sh.texts.map((t) => t.text);
      const chosen = id.endsWith('A') ? 'Style A' : 'Style B';
      const full = notchVariantOf({ seed: 1, read, models: MODELS, chosen, texts });
      check(
        full.kind === 'ask' && full.ask.suggested === (id.endsWith('A') ? 'high back' : 'low back'),
        `${id} real sheet words: asks, hint ${full.kind === 'ask' ? full.ask.suggested : '-'}`,
      );
      const noWords = texts.filter((t) => !/\b(high|low)\b/i.test(t) || !/style/i.test(t));
      const mut = notchVariantOf({ seed: 1, read, models: MODELS, chosen, texts: noWords });
      check(
        mut.kind === 'ask' && mut.ask.suggested === undefined,
        `${id} mutation (no «Style … High/Low» text): still asks, no suggestion`,
      );
      const relabel: NotchVariantRead = {
        sizes: read.sizes.map((s) => ({
          ...s,
          notches: [
            { at: at(0, 1271), label: 'Style A back notch' },
            { at: at(0, 1026), label: 'Style B back notch' },
          ],
        })),
      };
      const named = notchVariantOf({ seed: 1, read: relabel, models: MODELS, chosen, texts });
      check(
        named.kind === 'apply' && named.from === 'label' && named.drop.size === 1,
        `${id} relabelled «Style A/B back notch»: applied without a question (${named.kind})`,
      );
    }
  }
  console.log(fails.length ? `BACKVARIANT FAIL ${fails.length}` : 'BACKVARIANT PASS');
  return fails.length > 0;
}
