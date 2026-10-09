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
  // T29 (R38/R39). Лидеры колонны не разводятся.
  uncross: { file: /annotation\/margin-layout\.ts$/, from: 'if (!segmentsCross(leader(a), leader(b))) continue;', to: 'continue;' },
  // Плашки колонны без зазора — стоят на якорях друг на друге.
  gap: { file: /annotation\/margin-layout\.ts$/, from: 'ys[i] = Math.max(ys[i], ys[i - 1] + step);', to: 'ys[i] = ys[i];' },
  // Колонны не держатся внутри кадра.
  frame: { file: /annotation\/margin-layout\.ts$/, from: "? Math.max(EDGE + x.w, Math.min(W - EDGE, l - OFFSET))", to: '? l - OFFSET - 150' },
  // ✓ пишет позицию с провода, а не ту, что видели.
  seed: { file: /design\/artifacts-panel\.tsx$/, from: "seedOf(x, ghostLayout[x.id ?? ''])", to: 'seedOf(x)' },
  // Плашка призрака печатает описание.
  label: { file: /design\/callout-suggest\.ts$/, from: 'text: suggestionLabel(s),', to: "text: s.description ?? ''," },
  // Призраки всех флэтов — на первом.
  // Раскладка пересчитывается по оставшимся — соседний призрак едет на принятое указание.
  basis: { file: /design\/artifacts-panel\.tsx$/, from: 'suggestBasis.filter((x) => (x.mediaId ?? 0) === mediaId),', to: 'suggestions.filter((x) => (x.mediaId ?? 0) === mediaId),', and: ['}, [suggestBasis, ghostFrames]);', '}, [suggestions, ghostFrames]);'] },
  flats: { file: /design\/artifacts-panel\.tsx$/, from: '.filter((x) => (x.mediaId ?? 0) === mediaId)\n          .map((x) => {', to: '.filter((x) => mediaId === 11)\n          .map((x) => {' },
};
const mutation = MUTATE && {
  name: 'mutation',
  setup(b) {
    const m = MUTATIONS[MUTATE];
    b.onLoad({ filter: m.file }, async (a) => {
      let src = await readFile(a.path, 'utf8');
      if (!src.includes(m.from)) throw new Error(`мутация «${MUTATE}» не нашла строку`);
      src = src.replace(m.from, m.to);
      if (m.and) {
        if (!src.includes(m.and[0])) throw new Error(`мутация «${MUTATE}» не нашла вторую строку`);
        src = src.replace(m.and[0], m.and[1]);
      }
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

// ── РАСКЛАДКА ПО ПОЛЯМ — ЧИСТАЯ ФУНКЦИЯ, В NODE (T29, R38) ────────────────────────────────────
// 300 случайных плотных флэтов по 12 якорей (сид фиксирован): плашки не налезают, внутри кадра,
// лидеры не пересекаются; тот же вход — тот же выход.
const layoutOut = resolve(tmpdir(), `margin-layout-${process.pid}.mjs`);
await build({
  entryPoints: [r('ui/components/annotation/margin-layout.ts')],
  bundle: true, platform: 'node', format: 'esm', outfile: layoutOut, logLevel: 'error',
  plugins: mutation ? [mutation] : [],
});
const ML = await import(layoutOut);
{
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const words = ['301 · side seam', 'main label', 'YKK zip #5', 'collar · raw edge', 'chest pocket', 'back neck print · 80×40 mm', 'horn button 18L', 'cuff'];
  let overlap = 0, outside = 0, crossed = 0, unstable = 0;
  for (let n = 0; n < 300; n++) {
    const frame = { w: 360 + Math.floor(rnd() * 400), h: 420 + Math.floor(rnd() * 400) };
    const items = Array.from({ length: 12 }, (_, i) => ({
      key: `k${String(i).padStart(2, '0')}`,
      anchor: { x: 0.18 + rnd() * 0.64, y: 0.08 + rnd() * 0.84 },
      text: words[Math.floor(rnd() * words.length)],
    }));
    const at = ML.marginLayout(items, frame);
    if (JSON.stringify(ML.marginLayout([...items].reverse(), frame)) !== JSON.stringify(at)) unstable++;
    const boxes = items.map((it) => {
      const w = ML.plateWidth(it.text, frame.w), h = ML.MARGIN_PLATE_H, p = at[it.key];
      return { l: p.x * frame.w - w / 2, r: p.x * frame.w + w / 2, t: p.y * frame.h - h / 2, b: p.y * frame.h + h / 2 };
    });
    for (const b of boxes) if (b.l < -0.01 || b.t < -0.01 || b.r > frame.w + 0.01 || b.b > frame.h + 0.01) outside++;
    for (let i = 0; i < 12; i++)
      for (let j = i + 1; j < 12; j++) {
        const a = boxes[i], b = boxes[j];
        if (a.l < b.r - 0.01 && b.l < a.r - 0.01 && a.t < b.b - 0.01 && b.t < a.b - 0.01) overlap++;
        if (ML.segmentsCross(ML.marginLeader(items[i], at[items[i].key], frame), ML.marginLeader(items[j], at[items[j].key], frame))) crossed++;
      }
  }
  console.log(`  раскладка: 300 флэтов × 12 — налезаний ${overlap}, вне кадра ${outside}, пересечений ${crossed}, нестабильных ${unstable}`);
  if (overlap || outside || crossed || unstable) process.exitCode = 1;
  globalThis.__layoutFail = overlap + outside + crossed + unstable;
}

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
if (globalThis.__layoutFail) { fail++; console.log('  FAIL раскладка по полям (чистая функция)'); } else pass++;
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

/** Центры плашек-призраков в долях кадра, прямоугольники в пикселях страницы — по флэту. */
const ghostGeometry = (media) =>
  page.evaluate((media) => {
    const tile = document.querySelector(`[data-plate-media="${media}"]`);
    const frame = tile?.querySelector('[data-annot-frame]');
    if (!frame) return null;
    const fr = frame.getBoundingClientRect();
    const ox = fr.left + frame.clientLeft;
    const oy = fr.top + frame.clientTop;
    const W = frame.clientWidth;
    const H = frame.clientHeight;
    const plates = [...tile.querySelectorAll('[data-callout-ghost]')].map((el) => {
      const r = el.getBoundingClientRect();
      return {
        key: el.getAttribute('data-callout-ghost'),
        text: (el.innerText ?? '').trim(),
        l: r.left - ox, t: r.top - oy, r: r.right - ox, b: r.bottom - oy,
        cx: (r.left + r.width / 2 - ox) / W, cy: (r.top + r.height / 2 - oy) / H,
        oneLine: el.scrollHeight <= r.height + 1 && r.height < 22,
      };
    });
    return { W, H, plates };
  }, media);

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

// 2. ✓ по шву из операции 10 — плашка ложится туда, где стоял призрак (раскладка по полям).
const g2 = (await ghostGeometry(11))?.plates.find((p) => p.key === 's1');
await page.click('[data-callout-accept="s1"]');
await page.waitForTimeout(150);
let f = await form();
const c1 = f.callouts?.[0];
const sp1 = c1 ? JSON.parse(c1.spec || '{}') : {};
check('✓ → настоящее указание', f.callouts?.length === 1 && c1.number === 1 && c1.kind === 'label' && c1.mediaId === 11, JSON.stringify(c1));
check('✓ → spec, текст и детали из предложения', sp1.t === 'stitch' && sp1.iso === '301' && sp1.stcm === '4' && c1.description === 'side seam' && JSON.stringify(c1.parts) === '["front","back"]', JSON.stringify(c1));
check('✓ → точки и позиция плашки = место призрака', c1.points?.length === 1 && c1.points[0].x === '0.2700' && !!g2 && Math.abs(Number(c1.posX) - g2.cx) < 0.003 && Math.abs(Number(c1.posY) - g2.cy) < 0.003, JSON.stringify([c1.posX, c1.posY, g2?.cx, g2?.cy]));
check('✓ → позиция не та, что пришла с провода', c1.posX !== '0.120');
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


// 10. ПЛОТНЫЙ ПЕРЕД + СПИНА (R38/R39): 12 предложений на одном флэте и 4 на другом.
const LONG = 'Collar on a stand, interlined to hold shape; collar and stand edges left raw/frayed as a design detail rather than finished with a binding or topstitch.';
const sug = (id, media, kind, points, extra = {}) => ({
  id, sourceId: `pic:${id}`, sourceLabel: 'from picture', mediaId: media, kind: `TECH_CARD_ANNOTATION_KIND_${kind}`,
  points: points.map(([x, y]) => pt(x, y)), posX: dec(0.5), posY: dec(0.5), spec: '{}', description: LONG,
  parts: [], missing: [], fromData: false, ...extra,
});
const L = 'LABEL';
const zone = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// Спина вернулась на лист (её сняли в шаге 8); указания прошлых шагов сняты — чистый лист.
await page.evaluate(() => {
  const f = window.__form;
  f.setValue('callouts', [], { shouldDirty: true });
  f.setValue('technicalMedia', [...f.getValues('technicalMedia'), { mediaId: 12, kind: 'TECH_CARD_MEDIA_KIND_BACK' }], { shouldDirty: true });
});
await page.waitForTimeout(300);
override = [
  sug('f01', 11, L, [[0.5, 0.13]], { label: 'collar · raw edge', spec: JSON.stringify({ t: 'detail', scale: 2 }) }),
  sug('f02', 11, L, [[0.47, 0.17]], { label: 'main label', sourceLabel: 'label · main', fromData: true }),
  sug('f03', 11, L, [[0.34, 0.19]], { label: '301 · shoulder seam', spec: JSON.stringify({ t: 'stitch', iso: '301' }), fromData: true, sourceLabel: 'op 20 · shoulder' }),
  sug('f04', 11, L, [[0.66, 0.2]], { label: '301 · shoulder seam' }),
  sug('f05', 11, L, [[0.49, 0.36]], { label: 'front placket button', spec: JSON.stringify({ t: 'material', lineKey: 'B1', name: 'front placket button' }), fromData: true, sourceLabel: 'BOM · horn button 18L', missing: ['size'] }),
  sug('f06', 11, 'POLYGON', zone(0.6, 0.3, 0.72, 0.42), { label: 'chest pocket' }),
  sug('f07', 11, L, [[0.42, 0.52]], { label: 'main fabric · oxford 140 g/m²' }),
  sug('f08', 11, L, [[0.27, 0.6]], { label: '401 · side seam' }),
  sug('f09', 11, L, [[0.73, 0.61]], { label: '401 · side seam' }),
  sug('f10', 11, L, [[0.17, 0.8]], { label: 'button cuff · vent' }),
  sug('f11', 11, L, [[0.83, 0.81]], { label: 'button cuff · vent' }),
  sug('f12', 11, 'DIM', [[0.3, 0.9], [0.7, 0.9]], { spec: JSON.stringify({ t: 'stitch', iso: '301', stcm: '4' }) }),
  sug('b01', 12, L, [[0.5, 0.15]], { label: 'back yoke' }),
  sug('b02', 12, 'POLYGON', zone(0.42, 0.25, 0.58, 0.35), { label: 'back neck print', spec: JSON.stringify({ t: 'artwork', sub: 'print' }) }),
  sug('b03', 12, L, [[0.5, 0.5]], { label: 'box pleat' }),
  sug('b04', 12, L, [[0.3, 0.88]], { label: 'raw hem · 1 cm' }),
];
await page.click('[data-callout-suggest]');
await page.waitForFunction(() => document.querySelector('[data-callout-suggest]')?.textContent?.trim() === 'suggest ✦');
await page.waitForTimeout(300);
const front = await ghostGeometry(11);
const back = await ghostGeometry(12);
check('перед: 12 плашек-призраков', front?.plates.length === 12, String(front?.plates.length));
check('спина: свои 4 призрака (R39)', back?.plates.length === 4, String(back?.plates.length));
const overlaps = (ps) => {
  const bad = [];
  for (let i = 0; i < ps.length; i++)
    for (let j = i + 1; j < ps.length; j++) {
      const a = ps[i], b = ps[j];
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) bad.push(`${a.key}×${b.key}`);
    }
  return bad;
};
for (const [name, g] of [['перед', front], ['спина', back]]) {
  const ov = overlaps(g.plates);
  check(`${name}: плашки не налезают друг на друга`, ov.length === 0, ov.join(' '));
  const out = g.plates.filter((p) => p.l < -0.5 || p.t < -0.5 || p.r > g.W + 0.5 || p.b > g.H + 0.5).map((p) => p.key);
  check(`${name}: все плашки внутри кадра`, out.length === 0, out.join(' '));
  check(`${name}: каждая плашка — одна строка`, g.plates.every((p) => p.oneLine), g.plates.filter((p) => !p.oneLine).map((p) => p.key).join(' '));
}
check('плашки не печатают описание', front.plates.every((p) => !p.text.includes('interlined') && p.text.length <= 32), JSON.stringify(front.plates.map((p) => p.text)));
check('без label — короткая сводка назначения', front.plates.find((p) => p.key === 'f12')?.text === '301 · 4 st/cm (10 spi)', front.plates.find((p) => p.key === 'f12')?.text);
// Лидеры: от внутреннего края плашки к якорю (якорь — точка, середина линии, среднее зоны).
const anchorOf = (s) => {
  const ps = s.points.map((q) => ({ x: Number(q.x.value), y: Number(q.y.value) }));
  if (s.kind.endsWith('LABEL')) return ps[0];
  return { x: ps.reduce((a, q) => a + q.x, 0) / ps.length, y: ps.reduce((a, q) => a + q.y, 0) / ps.length };
};
const leaders = (g, media) =>
  g.plates.map((p) => {
    const s = override.find((x) => x.id === p.key) ?? { kind: 'LABEL', points: [pt(0.5, 0.5)] };
    const an = anchorOf(s);
    const ax = an.x * g.W, ay = an.y * g.H;
    const left = (p.l + p.r) / 2 < ax;
    return { key: p.key, a: { x: left ? p.r : p.l, y: (p.t + p.b) / 2 }, b: { x: ax, y: ay } };
  });
const orient = (p, q, r) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
const cross = (s, t) => orient(t.a, t.b, s.a) * orient(t.a, t.b, s.b) < 0 && orient(s.a, s.b, t.a) * orient(s.a, s.b, t.b) < 0;
for (const [name, g, media] of [['перед', front, 11], ['спина', back, 12]]) {
  const ls = leaders(g, media);
  const bad = [];
  for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) if (cross(ls[i], ls[j])) bad.push(`${ls[i].key}×${ls[j].key}`);
  check(`${name}: лидеры не пересекаются`, bad.length === 0, bad.join(' '));
}
const flatsOrder = await page.$$eval('[data-callout-suggested-flat]', (els) => els.map((el) => `${el.getAttribute('data-callout-suggested-flat')}:${el.querySelectorAll('[data-callout-suggestion]').length}`));
check('группа suggested — по флэтам: перед 12, спина 4', JSON.stringify(flatsOrder) === '["11:12","12:4"]', JSON.stringify(flatsOrder));
check('строки группы — одна строка', await page.$$eval('[data-callout-suggestion]', (els) => els.every((el) => el.getBoundingClientRect().height < 30)));
await page.hover('[data-callout-suggestion="f05"]');
await page.waitForTimeout(100);
await shot('29-dense-front-back');
const tileShot = async (media, name) => {
  if (!SHOTS) return;
  await (await page.$(`[data-plate-media="${media}"]`)).screenshot({ path: `${SHOTS}/${name}.png` });
};
await tileShot(11, '29-front');
await tileShot(12, '29-back');
if (SHOTS) await (await page.$('[data-callout-suggested]')).screenshot({ path: `${SHOTS}/29-suggested-group.png` });
// ✓ одного: остальные призраки стоят где стояли, принятое — на месте своего призрака.
await page.click('[data-callout-accept="f02"]');
await page.waitForTimeout(200);
const front2 = await ghostGeometry(11);
const moved = front2.plates.filter((p) => {
  const q = front.plates.find((x) => x.key === p.key);
  return !q || Math.abs(q.cx - p.cx) > 0.001 || Math.abs(q.cy - p.cy) > 0.001;
}).map((p) => p.key);
check('✓ одного — остальные призраки не сдвинулись', front2.plates.length === 11 && moved.length === 0, moved.join(' '));
const before10 = (await form()).callouts.length;
await page.click('[data-callout-accept-all]');
await page.waitForTimeout(250);
f = await form();
const added = f.callouts.slice(before10);
const posOk = added.length === 15 && added.every((c) => {
  const g = (c.mediaId === 11 ? front : back).plates.find((p) => p.text && c.description === LONG && Math.abs(Number(c.posX) - p.cx) < 0.003 && Math.abs(Number(c.posY) - p.cy) < 0.003);
  return !!g;
});
check('accept all → 15 указаний на местах призраков, текст — полное описание', posOk, JSON.stringify(added.map((c) => [c.mediaId, c.posX, c.posY])));
await shot('29-accepted-all');
override = null;

check('ни одного запроса мимо заглушки', realBackend === 0, String(realBackend));
await browser.close();
console.log(`${pass} из ${pass + fail} проверок прошло${MUTATE ? ` (мутация ${MUTATE})` : ''}`);
process.exit(fail ? 1 : 0);
