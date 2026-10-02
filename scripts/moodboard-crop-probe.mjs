// КРОП ПЛИТКИ МУДБОРДА (T01; 03.10, gate FX2): копия встаёт НА МЕСТО оригинала в ряду доски и во
// входе (роль на сервере переезжает за ней: сначала новому, потом снять со старого); указания
// переносятся в рамку кропа, вне её — снимаются; без рамки плитка с указаниями остаётся, копия
// встаёт за ней, а на полной доске кроп не теряется молча (`refused`).
//
//   node scripts/moodboard-crop-probe.mjs
//   MUTATE=1      node scripts/moodboard-crop-probe.mjs   # подмена доски задевает и строку входа
//   MUTATE=input  node scripts/moodboard-crop-probe.mjs   # вход не переезжает на кроп
//   MUTATE=remap  node scripts/moodboard-crop-probe.mjs   # указания не переносятся в рамку
//   MUTATE=full   node scripts/moodboard-crop-probe.mjs   # полная доска молча роняет кроп
//   MUTATE=order  node scripts/moodboard-crop-probe.mjs   # роль снимается со старого ДО нового
// Каждая мутация обязана ПОКРАСНЕТЬ.
import { build as esbuild } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `moodboard-crop-${process.pid}.mjs`);
const MUTATE = process.env.MUTATE || '';

const MUTATIONS = {
  1: [
    /design\/mood-board\.tsx$/,
    '(isBoardRow(i) && i.mediaId === fromId ? { ...i, mediaId: toId } : i)',
    '(i.mediaId === fromId ? { ...i, mediaId: toId } : i)',
  ],
  input: [/design\/mood-board\.tsx$/, 'if (input.moveInput && fromId !== toId) {', 'if (false) {'],
  remap: [
    /design\/mood-board\.tsx$/,
    'return { x: (t.x - frame.x) / frame.w, y: (t.y - frame.y) / frame.h };',
    'return { x, y };',
  ],
  full: [
    /design\/mood-board\.tsx$/,
    "return { mode: 'refused', items: live, callouts, dropped: 0, inputMoved: false };",
    "return { mode: 'next-to', items: live, callouts, dropped: 0, inputMoved: false };",
  ],
  order: [
    /design\/carry-reference\.ts$/,
    '  await write({\n    mediaId: toId,',
    "  await write({ mediaId: fromId, role: '', ordinal: 0, note: '' });\n  await write({\n    mediaId: toId,",
  ],
};

function mutationPlugin() {
  const m = MUTATIONS[MUTATE];
  if (!m) throw new Error(`нет мутации ${MUTATE}`);
  const [filter, anchor, broken] = m;
  let applied = false;
  return {
    name: 'moodboard-crop-mutation',
    setup(b) {
      b.onLoad({ filter }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!src.includes(anchor)) throw new Error(`мутация не нашла якорь в ${args.path}`);
        applied = true;
        return {
          contents: src.replace(anchor, broken),
          loader: args.path.endsWith('.ts') ? 'ts' : 'tsx',
        };
      });
      b.onEnd(() => {
        if (!applied) throw new Error('мутация не применилась');
      });
    },
  };
}

await esbuild({
  entryPoints: [resolve(HERE, 'moodboard-crop-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: MUTATE ? [mutationPlugin()] : [],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'),
    utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'),
    constants: resolve(REPO, 'src/constants'),
    hooks: resolve(REPO, 'src/hooks'),
    types: resolve(REPO, 'src/types'),
    styles: resolve(REPO, 'src/styles'),
    context: resolve(REPO, 'src/context'),
  },
});
const m = await import(pathToFileURL(outfile).href);
rmSync(outfile, { force: true });

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const MOOD = 'TECH_CARD_MEDIA_KIND_MOODBOARD';
const REF = 'TECH_CARD_MEDIA_KIND_REFERENCE';
const live = [
  { mediaId: 1, kind: MOOD, caption: 'a' },
  { mediaId: 2, kind: MOOD, caption: 'b' },
  { mediaId: 3, kind: MOOD, caption: 'c' },
  { mediaId: 2, kind: REF, caption: 'role' },
];

const next = m.swapBoardPicture(live, 2, 9);
ck(next.length === live.length, 'число строк не меняется', `${next.length}`);
ck(
  next[1].mediaId === 9 && next[1].kind === MOOD && next[1].caption === 'b',
  'копия на месте оригинала, вид и подпись те же',
  JSON.stringify(next[1]),
);
ck(next[0].mediaId === 1 && next[2].mediaId === 3, 'соседи не сдвинулись');
ck(
  next[3].mediaId === 2 && next[3].kind === REF,
  'запись входа на старый media_id не тронута',
  JSON.stringify(next[3]),
);
ck(live[1].mediaId === 2, 'исходный список не мутирован');

const dup = m.swapBoardPicture([...live, { mediaId: 9, kind: MOOD, caption: '' }], 2, 9);
ck(
  dup.filter((i) => i.kind === MOOD && i.mediaId === 9).length === 1 &&
    !dup.some((i) => i.kind === MOOD && i.mediaId === 2),
  'копия уже на доске — дубля нет, оригинал ушёл',
);
ck(m.swapBoardPicture(live, 2, 2) === live, 'тот же id — список прежний');

// ── FX2: кроп заменяет и на доске, и во входе; указания — в рамку ─────────────────────────────
const C = (mediaId, posX, posY, points = [], kind = 'pin') => ({
  mediaId,
  posX,
  posY,
  points,
  kind,
  description: `${mediaId}@${posX},${posY}`,
});
const callouts = [
  C(2, '0.300', '0.300'), // внутри рамки x 0.2–0.6, y 0.2–0.6
  C(2, '0.900', '0.900'), // вне
  C(
    2,
    '0.400',
    '0.500',
    [
      { x: '0.2500', y: '0.2500' },
      { x: '0.5000', y: '0.5000' },
    ],
    'line',
  ),
  C(
    2,
    '0.400',
    '0.500',
    [
      { x: '0.2500', y: '0.2500' },
      { x: '0.9000', y: '0.5000' },
    ],
    'line',
  ), // хвост вне
  C(1, '0.100', '0.100'), // чужая плитка
];
const frame = { x: 0.2, y: 0.2, w: 0.4, h: 0.4, rotation: 0 };
const plan = m.planBoardCrop({
  live,
  callouts,
  fromId: 2,
  toId: 9,
  frame,
  moveInput: true,
  boardMax: 12,
});
ck(plan.mode === 'replace', 'с рамкой — замена', plan.mode);
ck(
  plan.items[1].mediaId === 9 && plan.items[1].kind === MOOD,
  'доска: кроп на месте оригинала',
  JSON.stringify(plan.items[1]),
);
ck(
  plan.items[3].mediaId === 9 && plan.items[3].kind === REF && plan.inputMoved,
  'вход: строка переехала на кроп',
  JSON.stringify(plan.items[3]),
);
ck(!plan.items.some((i) => i.mediaId === 2), 'оригинала больше нет ни на доске, ни во входе');
const on9 = plan.callouts.filter((c) => c.mediaId === 9);
ck(
  on9.length === 2 && plan.dropped === 2,
  'указания: 2 перенесены, 2 вне рамки сняты',
  `${on9.length} / ${plan.dropped}`,
);
ck(
  on9[0]?.posX === '0.250' && on9[0]?.posY === '0.250',
  'пин (0.3,0.3) → (0.25,0.25) в кропе',
  `${on9[0]?.posX},${on9[0]?.posY}`,
);
ck(
  JSON.stringify(on9[1]?.points) ===
    JSON.stringify([
      { x: '0.1250', y: '0.1250' },
      { x: '0.7500', y: '0.7500' },
    ]),
  'точки линии пересчитаны в рамку',
  JSON.stringify(on9[1]?.points),
);
ck(
  plan.callouts.some((c) => c.mediaId === 1 && c.posX === '0.100'),
  'указания чужой плитки не тронуты',
);
ck(callouts[0].mediaId === 2 && callouts[0].posX === '0.300', 'исходные указания не мутированы');

const turned = m.remapCalloutsIntoCrop([C(2, '0.100', '0.200')], 2, 9, {
  x: 0,
  y: 0,
  w: 1,
  h: 1,
  rotation: 90,
});
ck(
  turned.next[0]?.posX === '0.800' && turned.next[0]?.posY === '0.100',
  'поворот 90° по часовой: (0.1,0.2) → (0.8,0.1)',
  `${turned.next[0]?.posX},${turned.next[0]?.posY}`,
);

const busy = m.planBoardCrop({
  live,
  callouts: [],
  fromId: 2,
  toId: 9,
  frame,
  moveInput: false,
  boardMax: 12,
});
ck(
  busy.items[3].mediaId === 2 && !busy.inputMoved && busy.items[1].mediaId === 9,
  'вход занят: доска заменена, вход на оригинале',
);

const noFrame = m.planBoardCrop({
  live,
  callouts,
  fromId: 2,
  toId: 9,
  moveInput: true,
  boardMax: 12,
});
ck(noFrame.mode === 'next-to', 'без рамки и с указаниями — рядом', noFrame.mode);
ck(
  noFrame.items[1].mediaId === 2 &&
    noFrame.items[2].mediaId === 9 &&
    noFrame.items[2].kind === MOOD,
  'оригинал на месте, кроп сразу за ним',
  JSON.stringify(noFrame.items.map((i) => i.mediaId)),
);
ck(
  noFrame.callouts === callouts && noFrame.items.find((i) => i.kind === REF)?.mediaId === 9,
  'указания остались на оригинале, вход — на кропе',
);

const plain = m.planBoardCrop({
  live,
  callouts: [],
  fromId: 2,
  toId: 9,
  moveInput: true,
  boardMax: 12,
});
ck(plain.mode === 'replace' && plain.items[1].mediaId === 9, 'без рамки и без указаний — замена');

const fullBoard = Array.from({ length: 12 }, (_, n) => ({
  mediaId: n + 1,
  kind: MOOD,
  caption: '',
}));
const full = m.planBoardCrop({
  live: fullBoard,
  callouts,
  fromId: 2,
  toId: 99,
  moveInput: true,
  boardMax: 12,
});
ck(
  full.mode === 'refused' && full.items === fullBoard,
  'полная доска без рамки: отказ, а не молчаливая потеря',
  full.mode,
);
const fullFramed = m.planBoardCrop({
  live: fullBoard,
  callouts,
  fromId: 2,
  toId: 99,
  frame,
  moveInput: true,
  boardMax: 12,
});
ck(
  fullFramed.mode === 'replace' && fullFramed.items[1].mediaId === 99,
  'полная доска с рамкой: замена проходит',
);

const writes = [];
await m.carryReferenceRole(
  async (w) => void writes.push(w),
  { role: 'front', note: 'n', detailSlotId: 0 },
  2,
  9,
  1,
);
ck(
  writes.length === 2 &&
    writes[0].mediaId === 9 &&
    writes[0].role === 'front' &&
    writes[1].mediaId === 2 &&
    writes[1].role === '',
  'роль: сначала новому медиа, потом снять со старого',
  JSON.stringify(writes),
);
const failed = [];
await m
  .carryReferenceRole(
    async (w) => {
      failed.push(w);
      throw new Error('refused');
    },
    { role: 'front', note: '', detailSlotId: 0 },
    2,
    9,
    1,
  )
  .catch(() => {});
ck(
  failed.length === 1 && failed[0].mediaId === 9,
  'отказ первой записи — со старого не снимается',
  JSON.stringify(failed),
);

console.log(`\n${total - bad} / ${total}, провалов ${bad}${MUTATE ? '  (MUTATE)' : ''}`);
process.exit(bad ? 1 : 0);
