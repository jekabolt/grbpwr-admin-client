#!/usr/bin/env node
// CONSTRUCTION DRAFT НЕ ПРЕДЛАГАЕТ СНОВА ТО, ЧТО УЖЕ ЕСТЬ (T06, волна moodboard-flats 03.10).
//
// Владелец: «повторный CONSTRUCTION DRAFT на мудборде все равно создает колорвеи которые уже
// предлагал и которые я зааксептил на предыдущих ранах».
//
// Проверяется НАСТОЯЩИЙ путь (бандл esbuild): `proposedColourways` → `setProposals(card, list,
// known)` стора памяти черновика. Повтор — совпадение имени ИЛИ главного Pantone ИЛИ hex с
// сохранённым колорвеем карточки или с подтверждённым предложением прошлого ответа.
//   node scripts/colourway-dedup-probe.mjs                 прогон
//   node scripts/colourway-dedup-probe.mjs --mutate-store  стор кладёт список как есть (до T06)
//   node scripts/colourway-dedup-probe.mjs --mutate-code   совпадение только по имени (без Pantone/hex)

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE_STORE = process.argv.includes('--mutate-store');
const MUTATE_CODE = process.argv.includes('--mutate-code');
const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const swap = (filter, needle, replacement) => ({
  name: `swap:${needle.slice(0, 24)}`,
  setup(b) {
    b.onLoad({ filter }, async (args) => {
      const src = await readFile(args.path, 'utf8');
      if (!src.includes(needle)) throw new Error(`mutation did not find its line in ${args.path}`);
      return { contents: src.replace(needle, replacement), loader: 'ts' };
    });
  },
});
const plugins = [];
if (MUTATE_STORE)
  plugins.push(
    swap(
      /head\/use-draft-fills\.ts$/,
      'proposals: list.filter((p) => kept[p.id] || fresh.has(p.id)),',
      'proposals: list,',
    ),
  );
if (MUTATE_CODE)
  plugins.push(
    swap(
      /colourway-proposals-model\.ts$/,
      `    a.pantones.some((x) => b.pantones.includes(x)) ||
    a.hexes.some((x) => b.hexes.includes(x))`,
      '    false',
    ),
  );

// Стор поднимает память из localStorage: в node его нет — пустая заглушка.
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k),
};
globalThis.window ??= globalThis;

const outfile = resolve(REPO, `scripts/.colourway-dedup-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'colourway-dedup-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: REPO,
  outfile,
  logLevel: 'silent',
  plugins,
  alias: {
    api: resolve(REPO, 'src/api'),
    components: resolve(REPO, 'src/components'),
    ui: resolve(REPO, 'src/ui'),
    lib: resolve(REPO, 'src/lib'),
    constants: resolve(REPO, 'src/constants'),
    hooks: resolve(REPO, 'src/hooks'),
    utils: resolve(REPO, 'src/utils'),
    types: resolve(REPO, 'src/types'),
    context: resolve(REPO, 'src/context'),
    '@': resolve(REPO, 'src'),
  },
});
const M = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

const CARD = 41;
const store = M.useDraftMemory;
const names = () =>
  (store.getState().byCard[CARD]?.proposals ?? [])
    .map((p) => p.name)
    .sort()
    .join(',');
const answer = (gen, colourways) => M.proposedColourways({ colourways }, gen);

// Карточка уже несёт: «midnight» (имя), колорвей без имени с Pantone 19-4052 TCX, и один с hex.
const saved = [
  { colorwayId: 1, devName: 'Midnight', colorCode: 'BLU', pantone: '19-4010 TCX' },
  { colorwayId: 2, devName: '', colorCode: 'BLU', colours: [{ pantone: '19-4052 TCX', hex: '' }] },
  { colorwayId: 3, devName: 'Bone', colorCode: 'WHT', devHex: '#efe9dd' },
];
const known = saved.map(M.savedColourwayIdentity);

console.log('\nсохранённые на карточке');
store.getState().setProposals(
  CARD,
  answer('r1', [
    { name: 'MIDNIGHT', colorCode: 'BLK', pantone: '19-3920 TCX' }, // имя (регистр другой)
    { name: 'Classic blue', colorCode: 'BLU', pantone: 'PANTONE 19-4052 TPX' }, // Pantone, другая книга
    { name: 'Ecru', colorCode: 'WHT', hex: '#EFE9DD' }, // hex
    { name: 'Rosso', colorCode: 'RED', pantone: '18-1664 TCX', hex: '#c8102e' }, // новый
    { name: 'Olive', colorCode: 'BLK', pantone: '18-0430 TCX' }, // то же семейство — не повтор
  ]),
  known,
);
ck(
  names() === 'Olive,Rosso',
  'name / pantone / hex repeats dropped, family alone is not a repeat',
  names(),
);

console.log('\nподтверждённое прошлым ответом, карточка ещё не перечитана');
{
  const rosso = store.getState().byCard[CARD].proposals.find((p) => p.name === 'Rosso');
  store.getState().setVerdict(CARD, rosso.id, { status: 'confirmed', colorwayId: 9 });
  store.getState().setProposals(
    CARD,
    answer('r2', [
      { name: 'Red', colorCode: 'RED', pantone: '18-1664 TCX' }, // тот же Pantone, что у Rosso
      { name: 'Sand', colorCode: 'BRN', pantone: '14-1122 TCX' },
    ]),
    known,
  );
  ck(names() === 'Sand', 'a repeat of the confirmed one is not proposed again', names());
  ck(
    store.getState().byCard[CARD].verdicts[rosso.id]?.status === 'confirmed',
    'the confirmed receipt itself is kept',
  );
}

console.log('\nповтор того же ответа');
{
  const list = answer('r3', [{ name: 'Moss', colorCode: 'GRN', pantone: '17-0525 TCX' }]);
  store.getState().setProposals(CARD, list, known);
  const moss = store.getState().byCard[CARD].proposals[0];
  store.getState().setVerdict(CARD, moss.id, { status: 'confirmed', colorwayId: 10 });
  store.getState().setProposals(CARD, list, known);
  ck(names() === 'Moss', 'the same answer re-applied keeps its own confirmed proposal', names());
}

console.log('\nбез сохранённых и подтверждённых — список как есть');
{
  const list = answer('r4', [
    { name: 'Moss', colorCode: 'GRN' },
    { name: 'Sky', colorCode: 'BLU' },
  ]);
  ck(M.withoutKnownColourways(list, []).length === 2, 'nothing known → nothing dropped');
}

console.log('\nпровод: CONSTRUCTION DRAFT передаёт сохранённые колорвеи карточки');
{
  const src = readFileSync(
    resolve(
      REPO,
      'src/components/managers/tech-card/components/design/head/construction-draft.tsx',
    ),
    'utf8',
  );
  ck(
    src.includes('(savedCard?.colorways ?? []).map(savedColourwayIdentity)'),
    'setProposals gets the saved colourways as `known`',
  );
}

console.log(
  `\n${total - bad} / ${total}, failures ${bad}${MUTATE_STORE ? '  (--mutate-store)' : ''}${MUTATE_CODE ? '  (--mutate-code)' : ''}`,
);
process.exit(bad ? 1 : 0);
