#!/usr/bin/env node
// THE FLAT'S ONE LINE OF WORDS FOLLOWS THE CATEGORY (M10, 07.10).
//
// A flat sends only «garment: <class>» from WORDS. WORDS are seeded once with the category's class
// (`composeWords`), so a later category change left the old class behind: card 38 went from
// `tops › shirts › short_sleeve` to `tops › tanks` and every flat still said «short sleeve shirt».
// `followCategory` (flat-route.ts) moves a SEEDED class line (a class some dictionary category
// names) to the card's category and keeps a class the designer wrote. Run on the beta dictionary.
//
//   node scripts/garment-class-probe.mjs                     прогон
//   node scripts/garment-class-probe.mjs --mutate=no-follow  класс не двигается — красное
//   node scripts/garment-class-probe.mjs --mutate=any-class  двигается и написанный — красное
import { build } from 'esbuild';
import { rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
const HERE = dirname(fileURLToPath(import.meta.url));
const root = resolve(HERE, '..');
const D = `${root}/src/components/managers/tech-card/components/design`;

const MUTATIONS = {
  'no-follow': { from: '    lines[i] = `${m[1]}${now}`;', to: '    void now;' },
  'any-class': {
    from: '|| !seeded.has(cls.toLowerCase())) return words;',
    to: ') return words;',
  },
};
const mutation = MUTATIONS[MUTATE];
if (MUTATE && !mutation) {
  console.log(`unknown mutation ${MUTATE}`);
  process.exit(2);
}

const out = resolve(tmpdir(), `garment-class-probe-${process.pid}.mjs`);
await build({
  stdin: {
    contents: `export { followCategory, flatWordsSent } from '${D}/flat-route';
export { garmentNameOf } from '${D}/core/card-facts';
export { categoryChain } from '${D}/fit-vocabulary';`,
    resolveDir: root,
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: out,
  logLevel: 'error',
  plugins: [
    {
      name: 'mutate',
      setup(b) {
        if (!mutation) return;
        b.onLoad({ filter: /design\/flat-route\.ts$/ }, async (args) => {
          const { readFile } = await import('node:fs/promises');
          const src = await readFile(args.path, 'utf8');
          if (!src.includes(mutation.from)) throw new Error(`mutation ${MUTATE}: anchor not found`);
          return { contents: src.replace(mutation.from, mutation.to), loader: 'ts' };
        });
      },
    },
  ],
});
const m = await import(pathToFileURL(out).href);
rmSync(out, { force: true });

// The beta dictionary's categories (GET api/admin/dictionary, 07.10): [id, name, level, parentId].
const RAW = [
  [1, 'outerwear', 1, 0],
  [2, 'tops', 1, 0],
  [3, 'bottoms', 1, 0],
  [4, 'dresses', 1, 0],
  [10, 'jackets', 2, 1],
  [17, 'blazer', 3, 10],
  [34, 'shirts', 2, 2],
  [35, 'short_sleeve', 3, 34],
  [36, 'overshirts', 3, 34],
  [42, 'tshirts', 2, 2],
  [43, 'crew_neck', 3, 42],
  [58, 'tanks', 2, 2],
  [67, 'crop', 2, 2],
  [68, 'pants', 2, 3],
  [70, 'cargo', 3, 68],
  [100, 'shirt', 3, 4],
  [192, 'bodysuits', 2, 2],
];
const LEVEL = { 1: 'top_category', 2: 'sub_category', 3: 'type' };
const cats = RAW.map(([id, name, level, parentId]) => ({
  id,
  name,
  level: LEVEL[level],
  parentId,
}));
const classOf = (id) =>
  m.garmentNameOf(
    m
      .categoryChain(cats, id)
      .map((c) => c.name)
      .join(' › '),
  );
const seeded = new Set(cats.map((c) => classOf(c.id).toLowerCase()).filter(Boolean));

let fails = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) fails += 1;
  console.log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n     got  ${JSON.stringify(got)}\n     want ${JSON.stringify(want)}`}`,
  );
};

const words38 = 'garment: short sleeve shirt\nfit: slim\nTwo-layer sleeveless top, slim body.';
check(
  'class names: 35 / 58 / 17',
  [classOf(35), classOf(58), classOf(17)].join(' | '),
  'short sleeve shirt | tank top | blazer',
);
check(
  '38: a seeded class moves to the new category',
  m.followCategory(words38, classOf(58), seeded),
  'garment: tank top\nfit: slim\nTwo-layer sleeveless top, slim body.',
);
check(
  '38: what the flat sends',
  m.flatWordsSent(m.followCategory(words38, classOf(58), seeded)),
  'garment: tank top',
);
check(
  'same category: untouched',
  m.followCategory('garment: blazer\nfit: regular', classOf(17), seeded),
  'garment: blazer\nfit: regular',
);
check(
  'a class the designer wrote stays',
  m.followCategory('garment: cross-back layered top\nfit: slim', classOf(58), seeded),
  'garment: cross-back layered top\nfit: slim',
);
check(
  'no class line: untouched',
  m.followCategory('Two-layer top.', classOf(58), seeded),
  'Two-layer top.',
);
check('empty words: untouched', m.followCategory('', classOf(58), seeded), '');
check(
  'an empty «garment:» line is skipped, the next one moves (as FlatConstructionNote reads)',
  m.followCategory('garment:\ngarment: shirt\nfit: loose', classOf(35), seeded),
  'garment:\ngarment: short sleeve shirt\nfit: loose',
);
check(
  'only the first class line moves',
  m.followCategory('garment: shirt\nnotes\ngarment: shirt', classOf(58), seeded),
  'garment: tank top\nnotes\ngarment: shirt',
);
check(
  '«- garment:» list form keeps its prefix',
  m.followCategory('- garment: shirt', classOf(58), seeded),
  '- garment: tank top',
);
check(
  'case of the class does not matter',
  m.followCategory('Garment: Short Sleeve Shirt', classOf(58), seeded),
  'Garment: tank top',
);
check('no category on the card: untouched', m.followCategory(words38, '', seeded), words38);

if (fails) {
  console.log(`\n${fails} FAILED${MUTATE ? ` (mutation ${MUTATE}: red as expected)` : ''}`);
  process.exit(1);
}
console.log(`\nall ok${MUTATE ? ` — MUTATION ${MUTATE} STAYED GREEN` : ''}`);
process.exit(MUTATE ? 1 : 0);
