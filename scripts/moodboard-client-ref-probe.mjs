// МУДБОРДНАЯ ВЫНОСКА НЕ УНОСИТ `client_ref` НА ПРОВОД — исполняемая половина флага
// MOODBOARD_CALLOUTS_CARRY_CLIENT_REF (`design/mood-callouts.tsx`).
//
// ЧТО ЗДЕСЬ МЕРИТСЯ И ПОЧЕМУ ЭТО НЕ ПРОЗА. Список полей в сборщике payload
// (`mapFormToTechCardInsert`, schema.ts) перечислен ИМЕНАМИ. Такой список утекает молча: сосед,
// дописывающий одну строку, не видит ни этого комментария, ни того флага. Поэтому проверяется не
// комментарий, а сам сборщик — на форме, у которой мудбордная выноска ЕСТЬ и `client_ref` у неё
// заполнен.
//
// ЦЕНА ОШИБКИ: `MintCalloutNumbers` (`internal/dto/techcard.go:440-442`, ветка beta) минтит номер
// любой выноске с `number == 0 && client_ref != ""` — предиката по медиа нет. Мудбордная заметка
// съедает номер ЛИСТА, нумерация листа идёт дырами на живых карточках, и откат клиента этого не
// чинит: испорчены данные, а не экран.
//
//   node scripts/moodboard-client-ref-probe.mjs
//   MUTATE=mapper-leaks node scripts/moodboard-client-ref-probe.mjs   # обязан ПОКРАСНЕТЬ
import { build as esbuild } from 'esbuild';
import { readFile } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `moodboard-client-ref-${process.pid}.mjs`);
const MUTATE = process.env.MUTATE || '';

// МУТАЦИЯ. Сборщик payload сегодня `clientRef` НЕ перечисляет — то есть проба зелена и на пустом
// месте, а зелень на пустом месте это сторож у мёртвого кода. Мутация дописывает поле ровно туда,
// куда его дописал бы человек, и проба обязана покраснеть. Не покраснела — значит она смотрит не
// на тот код.
const MAPPER_ANCHOR = '      posX: inputToDecimal(c.posX),';
const MAPPER_LEAK = '      clientRef: c.clientRef ?? undefined,\n' + MAPPER_ANCHOR;

function mutationPlugin(kind) {
  if (kind !== 'mapper-leaks') throw new Error(`неизвестная мутация: ${kind}`);
  let applied = false;
  return {
    name: 'moodboard-client-ref-mutation',
    setup(b) {
      b.onLoad({ filter: /tech-card\/components\/schema\.ts$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!src.includes(MAPPER_ANCHOR)) {
          throw new Error(`мутация не нашла якорь в ${args.path}`);
        }
        applied = true;
        return { contents: src.replace(MAPPER_ANCHOR, MAPPER_LEAK), loader: 'ts' };
      });
      // ЗАБЫТЫЙ ПЛАГИН ДАЁТ ЛОЖНУЮ ЗЕЛЕНЬ — поэтому применение мутации проверяется, а не
      // предполагается: несработавший onLoad означал бы «проба измерила НЕмутированное дерево и
      // честно позеленела», то есть ровно тот отчёт, которого мутация должна не допустить.
      b.onEnd(() => {
        if (!applied) throw new Error('мутация не применилась ни к одному файлу');
      });
    },
  };
}

await esbuild({
  entryPoints: [resolve(HERE, 'moodboard-client-ref-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: MUTATE ? [mutationPlugin(MUTATE)] : [],
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
const ck = (ok, what, detail = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};

const MOOD_MEDIA = 501;
const SKETCH_MEDIA = 601;
const MOOD_REF = 'mood-ref-0001';
const SKETCH_REF = 'sketch-ref-0001';

// ── 1. Флаг опущен, и это утверждение, а не догадка ─────────────────────────────────────────────
console.log('\n══ флаг ══');
ck(
  m.MOODBOARD_CALLOUTS_CARRY_CLIENT_REF === false,
  'MOODBOARD_CALLOUTS_CARRY_CLIENT_REF опущен',
  `сейчас ${m.MOODBOARD_CALLOUTS_CARRY_CLIENT_REF}`,
);

// ── 2. Фильтр снимает ref у мудбордных и НЕ трогает выноски листа ───────────────────────────────
console.log('\n══ фильтр ══');
const gated = m.gateMoodboardClientRefs(
  [
    { mediaId: MOOD_MEDIA, number: 0, clientRef: MOOD_REF },
    { mediaId: SKETCH_MEDIA, number: 0, clientRef: SKETCH_REF },
    { mediaId: 0, number: 7, clientRef: 'stray-0001' },
  ],
  new Set([MOOD_MEDIA]),
);
ck(!('clientRef' in gated[0]), 'у мудбордной выноски КЛЮЧ УДАЛЁН, а не обнулён');
ck(gated[0].clientRef === undefined, 'и читается как отсутствующий');
ck(gated[1].clientRef === SKETCH_REF, 'выноска ЭСКИЗА свой ключ сохранила — минт листа не сломан');
ck(
  gated[2].clientRef === 'stray-0001',
  'открепившаяся выноска мудборду не принадлежит и не тронута',
);
ck(gated[0].number === 0 && gated[1].number === 0, 'ничего, кроме client_ref, фильтр не трогает');

// ── 3. ГЛАВНОЕ: настоящий сборщик payload ───────────────────────────────────────────────────────
//
// Форма собирается с мудбордной картинкой, мудбордной выноской (несущей client_ref, как её родил
// `useMoodCallouts`) и технической выноской рядом — чтобы «отсутствует» нельзя было получить
// пустым массивом.
console.log('\n══ payload ══');
const form = {
  ...m.techCardDefaultData,
  styleNumber: 'PROBE-1',
  name: 'probe',
  moodboardMedia: [{ mediaId: MOOD_MEDIA, kind: 'TECH_CARD_MEDIA_KIND_MOODBOARD', caption: '' }],
  technicalMedia: [{ mediaId: SKETCH_MEDIA, kind: 'TECH_CARD_MEDIA_KIND_FRONT', caption: '' }],
  callouts: [
    {
      number: 0,
      part: '',
      parts: [],
      description: 'this palette',
      dimensions: '',
      mediaId: MOOD_MEDIA,
      posX: '0.500',
      posY: '0.500',
      kind: 'pin',
      points: [],
      color: '',
      dashed: false,
      filled: false,
      clientRef: MOOD_REF,
    },
    {
      number: 3,
      part: '',
      parts: [],
      description: 'sleeve cap ease',
      dimensions: '',
      mediaId: SKETCH_MEDIA,
      posX: '0.400',
      posY: '0.400',
      kind: 'pin',
      points: [],
      color: '',
      dashed: false,
      filled: false,
      clientRef: SKETCH_REF,
    },
  ],
};

const payload = m.mapFormToTechCardInsert(form);
const wire = JSON.stringify(payload);

// СНАЧАЛА — БЫЛО ЛИ ЧТО ИСКАТЬ. Пустой массив выносок дал бы «ключа нет» бесплатно, и все
// остальные строки этого раздела ничего бы не значили.
ck(
  Array.isArray(payload.callouts) && payload.callouts.length === 2,
  'payload вообще донёс ОБЕ выноски — искать есть в чём',
  `${payload.callouts?.length ?? 0} шт.`,
);
const moodOut = (payload.callouts ?? []).find((c) => c.mediaId === MOOD_MEDIA);
ck(!!moodOut, 'мудбордная выноска в payload найдена по своему media_id');
ck(
  !!moodOut && moodOut.description === 'this palette',
  'и это именно она — текст доехал',
  moodOut?.description,
);

ck(
  !!moodOut && !('clientRef' in moodOut),
  'у мудбордной выноски в payload НЕТ client_ref — номер листа она съесть не может',
  moodOut && 'clientRef' in moodOut ? `утёк: ${JSON.stringify(moodOut.clientRef)}` : '',
);
ck(
  !wire.includes(MOOD_REF),
  'значение мудбордного client_ref не встречается в payload НИГДЕ',
  wire.includes(MOOD_REF) ? 'найдено в сериализованном payload' : '',
);
ck(
  !wire.includes(SKETCH_REF),
  'и эскизный тоже не уезжает — сборщик про поле пока молчит целиком',
  wire.includes(SKETCH_REF) ? 'найдено в сериализованном payload' : '',
);

console.log(
  bad === 0
    ? '\nВСЁ ЗЕЛЁНОЕ' + (MUTATE ? '  ← ЭТО ПРОВАЛ: мутация обязана была покраснеть' : '')
    : `\nПРОВАЛОВ: ${bad}` + (MUTATE ? '  ← так и надо: мутация поймана' : ''),
);
// Под мутацией зелень — это провал пробы, а не успех кода.
const success = MUTATE ? bad > 0 : bad === 0;
process.exit(success ? 0 : 1);
