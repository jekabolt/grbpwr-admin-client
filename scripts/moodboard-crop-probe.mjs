// КРОП ПЛИТКИ МУДБОРДА (T01): копия встаёт НА МЕСТО оригинала в ряду доски, запись входа на тот же
// `media_id` остаётся нетронутой, порядок/вид/подпись строки сохраняются.
//
//   node scripts/moodboard-crop-probe.mjs
//   MUTATE=1 node scripts/moodboard-crop-probe.mjs   # подмена задевает и строку входа — обязана ПОКРАСНЕТЬ
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

const ANCHOR = '(isBoardRow(i) && i.mediaId === fromId ? { ...i, mediaId: toId } : i)';
const LEAK = '(i.mediaId === fromId ? { ...i, mediaId: toId } : i)';

function mutationPlugin() {
  let applied = false;
  return {
    name: 'moodboard-crop-mutation',
    setup(b) {
      b.onLoad({ filter: /design\/mood-board\.tsx$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        if (!src.includes(ANCHOR)) throw new Error(`мутация не нашла якорь в ${args.path}`);
        applied = true;
        return { contents: src.replace(ANCHOR, LEAK), loader: 'tsx' };
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
ck(next[1].mediaId === 9 && next[1].kind === MOOD && next[1].caption === 'b', 'копия на месте оригинала, вид и подпись те же', JSON.stringify(next[1]));
ck(next[0].mediaId === 1 && next[2].mediaId === 3, 'соседи не сдвинулись');
ck(next[3].mediaId === 2 && next[3].kind === REF, 'запись входа на старый media_id не тронута', JSON.stringify(next[3]));
ck(live[1].mediaId === 2, 'исходный список не мутирован');

const dup = m.swapBoardPicture([...live, { mediaId: 9, kind: MOOD, caption: '' }], 2, 9);
ck(dup.filter((i) => i.kind === MOOD && i.mediaId === 9).length === 1 && !dup.some((i) => i.kind === MOOD && i.mediaId === 2), 'копия уже на доске — дубля нет, оригинал ушёл');
ck(m.swapBoardPicture(live, 2, 2) === live, 'тот же id — список прежний');

console.log(`\n${total - bad} / ${total}, провалов ${bad}${MUTATE ? '  (MUTATE)' : ''}`);
process.exit(bad ? 1 : 0);
