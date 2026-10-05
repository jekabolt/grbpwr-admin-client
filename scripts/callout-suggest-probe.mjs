#!/usr/bin/env node
// `suggest ✦` НА ЛИСТЕ ARTIFACTS (T28, R36). Настоящий ArtifactsPanel; SuggestCallouts — ЗАГЛУШКА
// `page.route` (реальный бэкенд не трогается никогда: весь трафик стенда уходит на probe.local).
//
//   node scripts/callout-suggest-probe.mjs [--mutate=oplink|dismiss|replace] [--shots=<dir>]
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir, tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';
const MUTATIONS = {
  // ✓ не пишет номер в операцию-источник.
  oplink: { file: /design\/artifacts-panel\.tsx$/, from: 'if (number > 0 && opNumber != null)', to: 'if (false)' },
  // Отклонённое не уходит в следующий прогон.
  dismiss: { file: /design\/artifacts-panel\.tsx$/, from: 'dismissedSourceIds: readDismissed(techCardId)', to: 'dismissedSourceIds: []' },
  // Новый прогон дописывает к старым призракам вместо замены.
  replace: { file: /design\/artifacts-panel\.tsx$/, from: 'setSuggestions(next);', to: 'setSuggestions((l) => [...l, ...next]);' },
  // Отмена только рвёт запрос — как до ревью: висящий сейв держит thinking….
  cancel: { file: /design\/artifacts-panel\.tsx$/, from: 'const cancelSuggest = () => {\n    suggestRun.current += 1;', to: 'const cancelSuggest = () => {\n    suggestAbort.current?.abort();\n    return;' },
  // Ответ без проверки.
  normalize: { file: /design\/artifacts-panel\.tsx$/, from: 'const next = normalizeSuggestions(res.suggestions, liveFlats.current);', to: 'const next = (res.suggestions ?? []).filter((x) => !!x?.id);' },
  // Двойной ✓ не помечен.
  consumed: { file: /design\/artifacts-panel\.tsx$/, from: "!suggestConsumed.current.has(x.id ?? '') &&", to: '' },
  // Снятый флэт не чистит предложения.
  live: { file: /design\/artifacts-panel\.tsx$/, from: 'list.every((x) => live.has(x.mediaId ?? 0))', to: 'true' },
};
const mutation = MUTATE && {
  name: 'mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE];
    b.onLoad({ filter: m.file }, async (a) => {
      let src = await readFile(a.path, 'utf8');
      if (!src.includes(m.from)) throw new Error(`мутация «${MUTATE}» не нашла строку`);
      src = src.replace(m.from, m.to);
      return { contents: src, loader: 'tsx' };
    });
  },
};
const r = (p) => resolve(REPO, 'src', p);
const outfile = resolve(tmpdir(), `callout-suggest-${process.pid}.js`);
await build({
  entryPoints: [resolve(HERE, 'callout-suggest-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile, jsx: 'automatic', logLevel: 'error', absWorkingDir: REPO,
  plugins: mutation ? [mutation] : [],
  loader: { '.svg': 'dataurl', '.png': 'dataurl', '.woff2': 'dataurl', '.ttf': 'dataurl', '.css': 'css' },
  define: { 'process.env.NODE_ENV': '"development"', 'import.meta.env': '__STUB_ENV__' },
  banner: { js: 'var __STUB_ENV__ = {};' },
  alias: { components: r('components'), lib: r('lib'), api: r('api'), utils: r('utils'), ui: r('ui'), constants: r('constants'), store: r('store'), hooks: r('hooks'), types: r('types'), context: r('context'), styles: r('styles') },
});

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch { /* кэш npx */ }
  const root = `${homedir()}/.npm/_npx`;
  if (!existsSync(root)) return null;
  const found = execFileSync('find', [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'], { encoding: 'utf8' }).split('\n').filter(Boolean);
  return found[0] ? `${found[0]}/index.js` : null;
}
const pwPath = resolvePlaywright();
if (!pwPath) { console.log('playwright не найден — проба пропущена'); process.exit(0); }
const pw = await import(pwPath);
const chromium = pw.chromium ?? pw.default?.chromium;
const cssDir = resolve(REPO, 'dist/assets');
const CSS = existsSync(cssDir)
  ? execFileSync('find', [cssDir, '-maxdepth', '1', '-name', 'index-*.css'], { encoding: 'utf8' }).split('\n').filter(Boolean).map((f) => readFileSync(f, 'utf8')).join('\n')
  : '';

let pass = 0;
let fail = 0;
const check = (name, ok, detail = '') => {
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

const dec = (v) => ({ value: String(v) });
const pt = (x, y) => ({ x: dec(x), y: dec(y) });
const FIXTURE = [
  {
    id: 's1', sourceId: 'op:10', sourceLabel: 'op 10 · side seam', mediaId: 11,
    kind: 'TECH_CARD_ANNOTATION_KIND_LABEL', points: [pt(0.27, 0.6)], posX: dec(0.12), posY: dec(0.45),
    spec: JSON.stringify({ t: 'stitch', iso: '301', seam: 'TECH_CARD_SEAM_CLASS_SS_PLAIN', stcm: '4' }),
    description: 'side seam', parts: ['front', 'back'], missing: ['allowance'], fromData: true,
  },
  {
    id: 's2', sourceId: 'bom:01HZIP', sourceLabel: 'BOM · YKK zip #5', mediaId: 11,
    kind: 'TECH_CARD_ANNOTATION_KIND_LABEL', points: [pt(0.5, 0.4)], posX: dec(0.8), posY: dec(0.25),
    spec: JSON.stringify({ t: 'material', lineKey: '01HZIP', name: 'YKK zip #5' }),
    description: 'YKK zip #5', parts: ['front'], missing: [], fromData: true,
  },
  {
    id: 's3', sourceId: 'pic:1', sourceLabel: 'from picture', mediaId: 12,
    kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON', points: [pt(0.38, 0.3), pt(0.62, 0.3), pt(0.62, 0.42), pt(0.38, 0.42)],
    posX: dec(0.5), posY: dec(0.2),
    spec: JSON.stringify({ t: 'artwork', sub: 'print' }),
    description: 'back neck print', parts: [], missing: ['size'], fromData: false,
  },
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1480, height: 980 }, deviceScaleFactor: 2 })).newPage();
page.on('pageerror', (e) => check('page error', false, e.message));
const asked = [];
let suggestDelay = 400;
let suggestStatus = 200;
let realBackend = 0;
let override = null;
await page.route('**/*', async (rt) => {
  const url = rt.request().url();
  if (!url.startsWith('http://probe.local/') && !url.startsWith('data:')) {
    realBackend++;
    return rt.abort();
  }
  if (url.endsWith('/api/admin/ai/suggest-callouts')) {
    const body = JSON.parse(rt.request().postData() ?? '{}');
    asked.push(body);
    await new Promise((ok) => setTimeout(ok, suggestDelay));
    if (suggestStatus !== 200)
      return rt.fulfill({ status: suggestStatus, contentType: 'application/json', body: JSON.stringify({ message: 'model unavailable' }) }).catch(() => {});
    if (override) return rt.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: override }) }).catch(() => {});
    const dismissed = new Set(body.dismissedSourceIds ?? []);
    return rt
      .fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ suggestions: FIXTURE.filter((s) => !dismissed.has(s.sourceId)), model: 'stub' }) })
      .catch(() => {});
  }
  if (url.includes('/api/')) return rt.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  return rt.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' });
});
await page.goto('http://probe.local/');
if (CSS) await page.addStyleTag({ content: CSS });
await page.addScriptTag({ content: readFileSync(outfile, 'utf8') });
await page.waitForSelector('[data-callout-suggest]', { timeout: 15000 });
await page.waitForTimeout(400);

const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) ?? '').split('=')[1] ?? '';
const shot = async (name) => {
  if (!SHOTS) return;
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};
const count = (sel) => page.$$eval(sel, (els) => els.length);
const chipText = () => page.$eval('[data-callout-suggest]', (el) => el.textContent?.trim());
const form = () => page.evaluate(() => {
  const v = window.__form.getValues();
  return { callouts: v.callouts, operations: v.operations };
});
const log = () => page.evaluate(() => window.__log.slice());

await shot('28-before');
check('чип suggest ✦ в ряду инструментов', (await chipText()) === 'suggest ✦');
check('чип в той же строке, что назначения', await page.$eval('[data-callout-suggest]', (el) => !!el.parentElement?.querySelector('[data-tool="section"]')));

// 1. Нажатие: сейв, потом запрос; пока ждём — `thinking…`.
await page.click('[data-callout-suggest]');
await page.waitForTimeout(120);
check('во время прогона чип читает thinking…', (await chipText()) === 'thinking…');
await shot('28-thinking');
await page.waitForSelector('[data-callout-suggestion]');
await page.waitForTimeout(200);
const l1 = await log();
const iFlush = l1.indexOf('flush:suggest-callouts');
const iAsk = l1.findIndex((x) => x.includes('suggest-callouts') && x.startsWith('fetch:'));
check('сейв карточки ДО запроса', iFlush >= 0 && iAsk > iFlush, JSON.stringify(l1.slice(-4)));
check('запрос: карточка и оба карточных флэта', asked[0]?.techCardId === 7 && JSON.stringify(asked[0]?.mediaIds) === '[11,12]', JSON.stringify(asked[0]));
check('запрос: отклонённых пока нет', JSON.stringify(asked[0]?.dismissedSourceIds) === '[]');
check('три призрака-фигуры на плитах', (await count('[data-callout-ghost-shape]')) === 3);
check('три плашки-призрака', (await count('[data-callout-ghost]')) === 3);
check('у плашек-призраков нет номера', await page.$$eval('[data-callout-ghost]', (els) => els.every((el) => !el.querySelector('.tabular-nums'))));
check('призраки не берут мышь', await page.$$eval('[data-callout-ghost]', (els) => els.every((el) => getComputedStyle(el).pointerEvents === 'none')));
check('группа suggested · 3 открыта', (await page.$eval('[data-callout-suggested-toggle]', (el) => el.textContent ?? '')).includes('suggested · 3'));
check('строки: 3', (await count('[data-callout-suggestion]')) === 3);
check('модельная строка помечена from picture', (await page.$eval('[data-callout-suggestion="s3"] [data-callout-suggestion-label]', (el) => el.textContent)) === 'from picture');
check('пробел данных — тихая метка no allowance', (await page.$eval('[data-callout-suggestion="s1"]', (el) => el.textContent ?? '')).includes('no allowance'));
check('чип вернулся к suggest ✦', (await chipText()) === 'suggest ✦');
await page.hover('[data-callout-suggestion="s1"]');
await shot('28-ghosts');

// 2. ✓ по шву из операции 10.
await page.click('[data-callout-accept="s1"]');
await page.waitForTimeout(150);
let f = await form();
const c1 = f.callouts?.[0];
const sp1 = c1 ? JSON.parse(c1.spec || '{}') : {};
check('✓ → настоящее указание', f.callouts?.length === 1 && c1.number === 1 && c1.kind === 'label' && c1.mediaId === 11, JSON.stringify(c1));
check('✓ → spec, текст и детали из предложения', sp1.t === 'stitch' && sp1.iso === '301' && sp1.stcm === '4' && c1.description === 'side seam' && JSON.stringify(c1.parts) === '["front","back"]', JSON.stringify(c1));
check('✓ → точки и позиция плашки', c1.points?.length === 1 && c1.points[0].x === '0.2700' && c1.posX === '0.120', JSON.stringify(c1));
check('✓ → операция 10 ссылается на номер', f.operations?.[0]?.calloutNumber === 1 && f.operations?.[1]?.calloutNumber === 0, JSON.stringify(f.operations));
check('✓ → призраков 2, строк 2', (await count('[data-callout-ghost-shape]')) === 2 && (await count('[data-callout-suggestion]')) === 2);
check('✓ → плашка-призрак принятого ушла', (await count('[data-callout-ghost]')) === 2);
await shot('28-accepted');

// 3. ✕ по молнии: память этой карточки.
await page.click('[data-callout-dismiss="s2"]');
await page.waitForTimeout(100);
const stored = await page.evaluate(() => localStorage.getItem('plm.techcard.7.callout-suggest.dismissed'));
check('✕ → источник запомнен на карточку', stored === '["bom:01HZIP"]', String(stored));
check('✕ → строка ушла', (await count('[data-callout-suggestion]')) === 1);
await shot('28-dismissed');

// 4. Новый прогон: отклонённое уходит в запрос, непринятые призраки ЗАМЕНЯЮТСЯ.
await page.click('[data-callout-suggest]');
await page.waitForFunction(() => document.querySelector('[data-callout-suggest]')?.textContent?.trim() === 'suggest ✦');
await page.waitForTimeout(150);
check('повтор: отклонённое отправлено', JSON.stringify(asked[1]?.dismissedSourceIds) === '["bom:01HZIP"]', JSON.stringify(asked[1]));
check('повтор: призраки заменены, не дописаны', (await count('[data-callout-suggestion]')) === 2 && (await count('[data-callout-ghost-shape]')) === 2);
f = await form();
check('повтор: поставленное указание не тронуто', f.callouts?.length === 1 && f.callouts[0].description === 'side seam');

// 5. Отмена: второе нажатие во время прогона.
suggestDelay = 1500;
await page.click('[data-callout-suggest]');
await page.waitForTimeout(150);
await page.click('[data-callout-suggest]');
await page.waitForTimeout(250);
check('второе нажатие отменяет — чип снова suggest ✦', (await chipText()) === 'suggest ✦');
check('отмена: предложения прежние', (await count('[data-callout-suggestion]')) === 2);
await page.waitForTimeout(1500);
check('отмена: поздний ответ не применён', (await count('[data-callout-suggestion]')) === 2);
suggestDelay = 100;

// 6. accept all.
await page.click('[data-callout-accept-all]');
await page.waitForTimeout(150);
f = await form();
check('accept all → все указания с новыми номерами', f.callouts?.length === 3 && f.callouts.map((c) => c.number).join(',') === '1,2,3', JSON.stringify(f.callouts?.map((c) => [c.number, c.description])));
check('accept all → зона арта пунктиром, 4 угла', f.callouts?.[2]?.kind === 'polygon' && f.callouts[2].points.length === 4 && f.callouts[2].dashed === true);
check('accept all → группа исчезла', (await count('[data-callout-suggested]')) === 0 && (await count('[data-callout-ghost-shape]')) === 0);
await shot('28-accept-all');

// 7. Мусор в ответе: до экрана доходит только годное.
const lbl = (id, media, extra = {}) => ({ id, sourceId: `pic:${id}`, sourceLabel: '', mediaId: media, kind: 'TECH_CARD_ANNOTATION_KIND_LABEL', points: [pt(0.4, 0.5)], posX: dec(0.2), posY: dec(0.2), spec: '{}', description: id, parts: [], missing: [], fromData: false, ...extra });
override = [
  lbl('ok', 11),
  lbl('ok', 11, { description: 'dupe' }),
  { ...lbl('pin', 12), kind: 'TECH_CARD_ANNOTATION_KIND_PIN', points: [pt(0.5, 0.5)] },
  lbl('nan', 11, { points: [{ x: dec('NaN'), y: dec(0.3) }] }),
  lbl('out', 11, { posX: dec(1.5) }),
  lbl('poly2', 11, { kind: 'TECH_CARD_ANNOTATION_KIND_POLYGON', points: [pt(0.1, 0.1), pt(0.2, 0.2)] }),
  lbl('nopts', 11, { points: [] }),
  lbl('unknown', 11, { kind: 'TECH_CARD_ANNOTATION_KIND_WHATEVER' }),
  lbl('gone', 99),
  lbl('numx', 11, { points: [{ x: 0.3, y: dec(0.3) }] }),
  lbl('', 11),
  null,
];
await page.click('[data-callout-suggest]');
await page.waitForFunction(() => document.querySelector('[data-callout-suggest]')?.textContent?.trim() === 'suggest ✦');
await page.waitForTimeout(200);
const ids7 = await page.$$eval('[data-callout-suggestion]', (els) => els.map((el) => el.getAttribute('data-callout-suggestion')));
check('мусорный ответ: дошли только годные и без повторов', JSON.stringify(ids7) === '["ok","pin"]', JSON.stringify(ids7));
check('мусорный ответ: призраков 2', (await count('[data-callout-ghost]')) === 2);
override = null;

// 8. Флэт сняли — его предложения уходят; двойной ✓ не рождает два указания.
const before8 = (await form()).callouts.length;
await page.evaluate(() => {
  const f = window.__form;
  f.setValue('technicalMedia', f.getValues('technicalMedia').filter((m) => m.mediaId !== 12), { shouldDirty: true });
});
await page.waitForTimeout(250);
const ids8 = await page.$$eval('[data-callout-suggestion]', (els) => els.map((el) => el.getAttribute('data-callout-suggestion')));
check('снятый флэт: его предложение ушло', JSON.stringify(ids8) === '["ok"]', JSON.stringify(ids8));
await page.evaluate(() => {
  const b = document.querySelector('[data-callout-accept="ok"]');
  b.click();
  b.click();
});
await page.waitForTimeout(200);
f = await form();
check('двойной ✓ → одно указание', f.callouts.length === before8 + 1, String(f.callouts.length - before8));
check('ни одного указания на снятом флэте', f.callouts.every((c) => c.mediaId !== 12 || c.description !== 'pin'));

// 9. Отмена, пока ещё идёт сейв: thinking… гаснет сразу, запроса нет.
const asked9 = asked.length;
await page.evaluate(() => { window.__flushGate = new Promise((ok) => { window.__openGate = ok; }); });
await page.click('[data-callout-suggest]');
await page.waitForTimeout(120);
check('сейв висит → thinking…', (await chipText()) === 'thinking…');
await page.click('[data-callout-suggest]');
await page.waitForTimeout(60);
check('отмена во время сейва → сразу suggest ✦', (await chipText()) === 'suggest ✦');
await page.evaluate(() => { window.__flushGate = undefined; window.__openGate(); });
await page.waitForTimeout(400);
check('отменённый прогон после сейва не спрашивает и не трогает чип', asked.length === asked9 && (await chipText()) === 'suggest ✦', String(asked.length - asked9));

check('ни одного запроса мимо заглушки', realBackend === 0, String(realBackend));
await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло${MUTATE ? ` (мутация ${MUTATE})` : ''}`);
process.exit(fail ? 1 : 0);
