#!/usr/bin/env node
// FLATS: `custom` РЯДОМ С GENERATE И НОВОЕ УМОЛЧАНИЕ (T18 / T19, волна moodboard-flats 03.10).
//
// Владелец: «будет кнопка custom и там мы можем выбрать one picture или per picture и так же
// FRONT / BACK / SIDE LEFT / SIDE RIGHT» и «по дефолту мы генерируем one image и FRONT BACK SIDE
// LEFT SIDE RIGHT».
//
//   node scripts/flat-custom-probe.mjs                  прогон
//   node scripts/flat-custom-probe.mjs --mutate=default умолчание снова front+back (до T19) — красное
//   node scripts/flat-custom-probe.mjs --mutate=open    панель рисуется и закрытой (до T18) — красное
import { build } from 'esbuild';
import { readFileSync, rmSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');
const DESIGN = resolve(root, 'src/components/managers/tech-card/components/design');

const MUTATIONS = {
  default: {
    file: /design\/flat-input\.ts$/,
    from: 'return Object.fromEntries(ACTIVE_VIEWS.map((v) => [v, true]));',
    to: 'return { front: true, back: true };',
  },
  open: {
    file: /design\/flat-custom\.tsx$/,
    from: '{open && (',
    to: '{(true || open) && (',
  },
};
const mut = MUTATE ? MUTATIONS[MUTATE] : null;
if (MUTATE && !mut) {
  console.log(`unknown mutation ${MUTATE}`);
  process.exit(2);
}
let hit = false;
const plugins = mut
  ? [
      {
        name: 'mutate',
        setup(b) {
          b.onLoad({ filter: mut.file }, async (args) => {
            const src = await readFile(args.path, 'utf8');
            if (!src.includes(mut.from)) throw new Error('mutation did not find its line');
            hit = true;
            return {
              contents: src.replace(mut.from, mut.to),
              loader: args.path.endsWith('.tsx') ? 'tsx' : 'ts',
            };
          });
        },
      },
    ]
  : [];

const outfile = resolve(root, `scripts/.flat-custom-${process.pid}.mjs`);
await build({
  entryPoints: [resolve(root, 'scripts/flat-custom-probe-entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  jsx: 'automatic',
  absWorkingDir: root,
  outfile,
  logLevel: 'warning',
  plugins,
  external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime'],
  banner: {
    js: "import { createRequire as __cr } from 'node:module';\nvar require = __cr(import.meta.url);",
  },
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(root, 'src/components'),
    lib: resolve(root, 'src/lib'),
    api: resolve(root, 'src/api'),
    utils: resolve(root, 'src/utils'),
    ui: resolve(root, 'src/ui'),
    constants: resolve(root, 'src/constants'),
    hooks: resolve(root, 'src/hooks'),
  },
});
let M;
try {
  M = await import(pathToFileURL(outfile).href);
} finally {
  rmSync(outfile, { force: true });
}
if (mut && !hit) {
  console.log('mutation did not reach the bundle');
  process.exit(2);
}

let bad = 0;
let total = 0;
const ck = (ok, what, detail = '') => {
  total++;
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${detail ? `  — ${detail}` : ''}`);
};
const on = (r) =>
  Object.entries(r)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(',');

console.log('\nT19 · умолчание');
{
  const v = M.defaultFlatViews();
  ck(
    on(v) === 'front,back,side_l,side_r',
    'default views = front, back, side left, side right',
    on(v),
  );
  ck(M.DEFAULT_FLAT_LAYOUT === 'one', 'default layout = one picture', M.DEFAULT_FLAT_LAYOUT);
  ck(M.defaultFlatViews() !== v, 'each call hands out a fresh record (no shared mutable default)');
  ck(
    M.isDefaultFlatChoice({ views: v, detailTicks: {}, layout: 'one' }),
    'the default choice reads as default (custom carries no dot)',
  );
  ck(
    !M.isDefaultFlatChoice({ views: { front: true, back: true }, detailTicks: {}, layout: 'one' }),
    'the old front+back reads as custom',
  );
  ck(
    !M.isDefaultFlatChoice({ views: v, detailTicks: {}, layout: 'per_view' }),
    'per picture reads as custom',
  );
  ck(
    !M.isDefaultFlatChoice({ views: {}, detailTicks: { 7: true }, layout: 'one' }),
    'a detail run reads as custom',
  );
  ck(
    M.isDefaultFlatChoice({
      views: { ...v, three_quarter_l: false },
      detailTicks: { 7: false },
      layout: 'one',
    }),
    'false entries do not make a choice custom',
  );
}

console.log('\nT18 · дверь custom');
{
  const closed = M.render(false, false);
  ck(/aria-expanded="false"/.test(closed), 'closed: the door says it is collapsed');
  ck(!closed.includes('data-flat-views'), 'closed: no layout / view panel in the markup');
  ck(!closed.includes('data-panel-body'), 'closed: the panel body is not rendered');
  ck(closed.includes('custom ▸') && !closed.includes('•'), 'closed default: «custom ▸», no dot');
  ck(
    closed.indexOf('custom') < closed.indexOf('data-after'),
    'the door stands before the inventory door',
  );
  const open = M.render(true, false);
  ck(/aria-expanded="true"/.test(open), 'open: the door says it is expanded');
  ck(
    open.includes('data-flat-views') && open.includes('data-panel-body'),
    'open: the panel is drawn',
  );
  ck(open.includes('basis-full'), 'open: the panel takes its own line under the run row');
  const mod = M.render(false, true);
  ck(
    mod.includes('custom •') && !mod.includes('data-flat-views'),
    'closed custom choice: a dot, still no panel',
  );
}

console.log('\nпровод: ряд берёт умолчание и дверь отсюда');
{
  const row = readFileSync(resolve(DESIGN, 'flat-run-row.tsx'), 'utf8');
  ck(row.includes('ask?.views ?? defaultFlatViews()'), 'row ticks start from defaultFlatViews()');
  ck(row.includes('?.layout ?? DEFAULT_FLAT_LAYOUT'), 'row layout starts from DEFAULT_FLAT_LAYOUT');
  ck(!row.includes('{ front: true, back: true }'), 'the old front+back literal is gone');
  ck(row.includes('<FlatCustom'), 'row renders FlatCustom');
  ck(row.includes('applyTicks(tickView(views, detailTicks, view))'), 'view chip → tickView (T07)');
  ck(
    row.includes('applyTicks(tickDetail(views, detailTicks, id))'),
    'detail chip → tickDetail (T07)',
  );
}

console.log(
  `\n${total - bad} / ${total}, failures ${bad}${MUTATE ? `  (--mutate=${MUTATE})` : ''}`,
);
process.exit(bad ? 1 : 0);
