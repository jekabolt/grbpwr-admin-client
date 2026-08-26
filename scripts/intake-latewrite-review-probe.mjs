#!/usr/bin/env node
// ПРОБА РЕВЬЮЕРА: ОКНО ПОЗДНЕЙ ЗАПИСИ ОБМЕРА — ДОСТИЖИМО ЛИ ОНО ВООБЩЕ.
//
//   node scripts/intake-latewrite-review-probe.mjs                    прогон (обязан быть зелёным)
//   node scripts/intake-latewrite-review-probe.mjs --mutate=noguard   снять сторожа поздней записи
//   node scripts/intake-latewrite-review-probe.mjs --mutate=nowait    снять ожидание обещания
//
// Зачем отдельная проба, когда есть media-intake-probe: там мутации `nowait` и `noguard` ЗЕЛЁНЫЕ —
// декодирование кадра в том стенде стабильно обгоняет заглушенный бакет, и окно не открывается.
// Это «не успело», а не «нечему ломаться». Здесь порядок ИНВЕРТИРУЕТСЯ управляемо.
//
// ИНСТРУМЕНТ — ЗАДЕРЖКА РЕЗОЛВА `measure` В СБОРКЕ, а не подмена `window.Image`: у той был
// замеренный порок — `getCroppedImg` сам декодирует ДВА data-адреса (`getCropped.ts:106,149`),
// и глобальная задержка декода откладывала сам кроп, так что мутация `nowait` оставалась
// зелёной по вине прибора. Здесь `measure` переименовывается в `measureRaw`, а сверху ложится
// делегат, который только ЗАДЕРЖИВАЕТ резолв на `window.__measureHoldMs` — ни статусов, ни
// логики он не трогает. Это и есть свободная переменная гонки: «декод кончился поздно».
//
// Считаются ИСХОДЫ. Положительный контроль прибора — счётчик задержанных обмеров: ноль значит
// «прибор не включился», и это провал, а не зелень.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build as esbuild } from 'esbuild';

const MUTATE = (process.argv.find((a) => a.startsWith('--mutate=')) ?? '').split('=')[1] ?? '';
const MUTATE_LIST = MUTATE ? MUTATE.split(',').filter(Boolean) : [];

function resolvePlaywright() {
  const require = createRequire(import.meta.url);
  try { return require.resolve('playwright'); } catch {}
  try {
    const root = `${homedir()}/.npm/_npx`;
    if (!existsSync(root)) return null;
    const found = execFileSync('find',
      [root, '-maxdepth', '4', '-type', 'd', '-name', 'playwright', '-path', '*node_modules*'],
      { encoding: 'utf8' }).split('\n').filter(Boolean)[0];
    return found ? `${found}/index.js` : null;
  } catch { return null; }
}
const entryPath = resolvePlaywright();
if (!entryPath) { console.log('playwright не найден — проба пропущена (это не отказ)'); process.exit(0); }
const mod = await import(entryPath);
const chromium = mod.chromium ?? mod.default?.chromium;
if (!chromium) { console.log('playwright найден, но без chromium — проба пропущена'); process.exit(0); }

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `intake-latewrite-${process.pid}.js`);

// Те же строки, что и в media-intake-probe: мутация возвращает РОВНО строку починки.
const MUTATIONS = {
  nowait: {
    file: 'dialog',
    from: "    const status = await engine.setCroppedUrl(index, url);\n    setCroppingId(null);\n    if (guided && status === 'wait') beginUpload();",
    to: '    void engine.setCroppedUrl(index, url);\n    setCroppingId(null);\n    if (guided) beginUpload();',
  },
  noguard: {
    file: 'pending',
    from: '      if (!RECHECKABLE.includes(live.status)) return live.status;',
    to: '      // МУТАЦИЯ: сторож поздней записи снят',
  },
};
for (const name of MUTATE_LIST) {
  if (!MUTATIONS[name]) {
    console.log(`неизвестная мутация «${name}»; есть: ${Object.keys(MUTATIONS).join(', ')}`);
    process.exit(2);
  }
}

// Инструмент задержки обмера. Переименование + делегат: function-объявления всплывают, поэтому
// делегат можно дописать в конец файла, не трогая порядок определений.
const MEASURE_DECL =
  'function measure(url: string, isVideo: boolean): Promise<{ width: number; height: number } | null> {';
const MEASURE_INSTRUMENT = `
/* ИНСТРУМЕНТ ПРОБЫ: задержка резолва обмера. Семантика не тронута — только время. */
function measure(url: string, isVideo: boolean): Promise<{ width: number; height: number } | null> {
  const w = window as unknown as { __measureHoldMs?: number; __measureHeld?: number };
  const raw = measureRaw(url, isVideo);
  const hold = w.__measureHoldMs ?? 0;
  if (!hold) return raw;
  w.__measureHeld = (w.__measureHeld ?? 0) + 1;
  return raw.then((v) => new Promise<{ width: number; height: number } | null>((res) => {
    setTimeout(() => res(v), hold);
  }));
}
`;

// ОДИН плагин на оба файла: два onLoad с одним фильтром не складываются (esbuild берёт первый
// ответивший), поэтому инструмент и мутации применяются последовательно в одном колбэке.
const plugin = {
  name: 'latewrite-instrument-and-mutations',
  setup(b) {
    b.onLoad({ filter: /usePendingFiles\.ts$/ }, async (args) => {
      let src = await readFile(args.path, 'utf8');
      if (!src.includes(MEASURE_DECL)) throw new Error('инструмент не нашёл объявление measure');
      src = src.replace(MEASURE_DECL, MEASURE_DECL.replace('function measure', 'function measureRaw'));
      src += MEASURE_INSTRUMENT;
      if (MUTATE_LIST.includes('noguard')) {
        const m = MUTATIONS.noguard;
        if (!src.includes(m.from)) throw new Error('мутация «noguard» не нашла свою строку');
        src = src.replace(m.from, m.to);
      }
      return { contents: src, loader: 'ts' };
    });
    if (MUTATE_LIST.includes('nowait')) {
      b.onLoad({ filter: /media-intake-dialog\.tsx$/ }, async (args) => {
        const src = await readFile(args.path, 'utf8');
        const m = MUTATIONS.nowait;
        if (!src.includes(m.from)) throw new Error('мутация «nowait» не нашла свою строку');
        return { contents: src.replace(m.from, m.to), loader: 'tsx' };
      });
    }
  },
};

await esbuild({
  entryPoints: [resolve(HERE, 'media-intake-entry.tsx')],
  bundle: true, platform: 'browser', format: 'iife', target: 'es2020', outfile,
  logLevel: 'warning', absWorkingDir: REPO, jsx: 'automatic',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl' },
  plugins: [plugin],
  define: {
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'process.env.NODE_ENV': '"production"',
  },
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
    store: resolve(REPO, 'src/store'), hooks: resolve(REPO, 'src/hooks'),
  },
});
const bundle = readFileSync(outfile, 'utf8');

function adminCss() {
  const dir = resolve(REPO, 'dist/assets');
  if (!existsSync(dir)) return null;
  const files = execFileSync('find', [dir, '-maxdepth', '1', '-name', '*.css'], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
  if (!files.length) return null;
  return files.map((f) => readFileSync(f, 'utf8')).join('\n');
}
const CSS = adminCss();

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };
const head = (s) => console.log(`\n${s}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.route('http://probe.local/**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html', body: '<div id="root"></div>' }),
);

// Бакет с задержкой НА КАЖДЫЙ запрос отдельно: первый кадр обязан уметь кончиться раньше, чем
// второй начнёт, — иначе строка «done при живой пачке» не строится вовсе.
let uploadN = 0;
let uploadDelays = [];
await page.route('http://stub.invalid/**', async (route) => {
  uploadN += 1;
  const d = uploadDelays[uploadN - 1] ?? 0;
  if (d) await new Promise((r) => setTimeout(r, d));
  const id = 1000 + uploadN;
  return route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ media: { id, media: { fullSize: { mediaUrl: `https://cdn/${id}.jpg`, width: 2, height: 2 } } } }),
  });
});

const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR4nGP8z8DAwMDAwMDEAAMADgIBAWiJ8fMAAAAASUVORK5CYII=';

async function mount(opts = {}) {
  await page.goto('http://probe.local/');
  if (CSS) await page.addStyleTag({ content: CSS });
  await page.addScriptTag({ content: bundle });
  await page.evaluate(() => { window.__measureHoldMs = 0; window.__measureHeld = 0; });
  await page.evaluate((o) => window.__intake.mount(o), opts);
  await page.waitForSelector('[data-slot]', { timeout: 15000 });
  await page.locator('[data-slot]').hover();
}

async function paste({ count = 1, kind = 'image' } = {}) {
  await page.evaluate(
    ({ count, kind, b64 }) => {
      const dt = new DataTransfer();
      for (let i = 0; i < count; i += 1) {
        let file;
        if (kind === 'big') {
          const c = document.createElement('canvas');
          c.width = 1600; c.height = 1600;
          const g = c.getContext('2d');
          const img = g.createImageData(1600, 1600);
          for (let k = 0; k < img.data.length; k += 4) {
            img.data[k] = (k * 7) % 255; img.data[k + 1] = (k * 13) % 255;
            img.data[k + 2] = (k * 29) % 255; img.data[k + 3] = 255;
          }
          g.putImageData(img, 0, 0);
          const bin = Uint8Array.from(atob(c.toDataURL('image/png').split(',')[1]), (ch) => ch.charCodeAt(0));
          file = new File([bin], `big-${Date.now()}-${i}.png`, { type: 'image/png' });
        } else {
          const bin = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
          file = new File([bin], `shot-${Date.now()}-${i}.png`, { type: 'image/png' });
        }
        dt.items.add(file);
      }
      document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    },
    { count, kind, b64: PNG_B64 },
  );
  await page.waitForTimeout(350);
}

const tiles = () => page.locator('[role="listitem"]').count();
const dialogOpen = () => page.locator('[role="dialog"]').count();
const pillText = async () => {
  const n = await page.locator('[role="dialog"]').count();
  if (n) return '';
  const b = page.locator('body > div > button').filter({ hasText: /upload/i });
  return (await b.count()) ? ((await b.first().textContent()) ?? '').trim() : '';
};
const calls = () => page.evaluate(() => window.__intake.calls());
const delivered = () => page.evaluate(() => window.__intake.delivered());
const heldCount = () => page.evaluate(() => window.__measureHeld);
const setHold = (ms) => page.evaluate((v) => { window.__measureHoldMs = v; }, ms);
async function tryClick(locator, timeout = 4000) {
  try { await locator.click({ timeout }); return true; } catch { return false; }
}

// ── 1. ОКНО ПОЗДНЕЙ ЗАПИСИ: done-СТРОКА ПРИ ЖИВОЙ ПАЧКЕ ───────────────────────────────────────
//
// Кроп кадра №1, «upload all» сразу следом. Обмер кадрированного варианта держится 900 мс; кадр
// №1 уезжает за ~50 мс, кадр №2 держит пачку 2500 мс. Обмер резолвится, когда №1 уже `done`, а
// расчёт с владельцем ещё не случился (пачка жива). Сторож обязан вернуть `done` и НЕ трогать
// строку; без него поздняя запись кладёт `wait` поверх `done`, и расчёт отдаёт форме ОДИН кадр
// из двух — второй лежит в бакете сиротой, а окно предлагает отправить его ещё раз.
head('1. поздний обмер против done-строки в живой пачке');
uploadN = 0; uploadDelays = [50, 2500];
await mount({ aspect: 1 });
await paste({ count: 1, kind: 'big' });
await paste({ count: 1 });
ck((await tiles()) === 2, 'в очереди два кадра', `их ${await tiles()}`);
const tile1 = page.locator('[role="listitem"]').first();
await tile1.hover();
ck(await tryClick(tile1.locator('button', { hasText: /^crop$/ }).first()), 'кроп кадра №1 открылся');
await page.waitForTimeout(500);
await setHold(900);
ck(await tryClick(page.locator('[role="dialog"] button', { hasText: /^apply crop$/i }).first()),
  'нажат «apply crop» — обмер кадрированного варианта пошёл в задержанный резолв');
// Кроп рисуется и режется своим ходом (getCroppedImg не задет инструментом); ждём, пока патч
// `croppedUrl` осядет, и жмём отправку ВНУТРИ окна задержанного обмера.
await page.waitForFunction(() => window.__measureHeld >= 1, null, { timeout: 10000 }).catch(() => {});
ck(await tryClick(page.locator('button', { hasText: /^upload all \(2\)$/i }).first()),
  'и сразу следом — «upload all (2)»');
await page.waitForFunction(() => window.__intake.delivered().length >= 1, null, { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(600);
ck((await heldCount()) >= 1, 'прибор включался: задержанный обмер отработал', `задержано ${await heldCount()}`);
ck((await delivered()).length === 2, 'доставлены ОБА кадра — поздний обмер не выбил done-строку из расчёта',
  `их ${(await delivered()).length}`);
ck((await calls()) === 1, 'одним вызовом', `вызовов ${await calls()}`);
ck(uploadN === 2, 'бакет получил РОВНО два запроса — повторной отправки нет', `их ${uploadN}`);
ck((await dialogOpen()) === 0 && (await pillText()) === '', 'очередь пуста: ни окна, ни пилюли',
  `пилюля «${await pillText()}»`);

// ── 2. ВЕДОМЫЙ СЦЕНАРИЙ: ОТПРАВКА ЖДЁТ ОБМЕРА, А НЕ НАОБОРОТ ──────────────────────────────────
//
// «Отправка начинается СТРОГО ПОСЛЕ патча обмера» — утверждение из комментария к setCroppedUrl.
// Здесь оно меряется: обмер держится 3000 мс, и до его конца в бакет не имеет права уйти ни
// одного запроса. Чекпоинт — 1500-я мс ПОСЛЕ того, как обмер реально начал держаться (рендер и
// резка кропа легально съедают своё до этого): мутация `nowait` начинает отправку сразу после
// резки — счётчик выдаст её задолго до чекпоинта.
head('2. «crop & add»: до конца обмера в бакет не уходит ничего');
uploadN = 0; uploadDelays = [];
await mount({ lockAspect: true, aspect: 1 });
await paste({ count: 1, kind: 'big' });
await page.waitForTimeout(700);
await setHold(3000);
ck(await tryClick(page.locator('[role="dialog"] button', { hasText: /^crop & add$/i }).first()),
  'нажат «crop & add»');
await page.waitForFunction(() => window.__measureHeld >= 1, null, { timeout: 10000 }).catch(() => {});
await page.waitForTimeout(1500);
ck((await heldCount()) >= 1, 'обмер действительно в задержке', `задержано ${await heldCount()}`);
ck(uploadN === 0, 'посреди задержанного обмера бакет пуст — отправка ждёт его конца', `запросов ${uploadN}`);
await page.waitForFunction(() => window.__intake.calls() > 0, null, { timeout: 25000 }).catch(() => {});
ck((await delivered()).length === 1, 'после обмера кадр доехал', `их ${(await delivered()).length}`);

// ── 3. НАКОПЛЕНИЕ ПЕРЕЖИВАЕТ СВОРАЧИВАНИЕ: ⌘V В СВЁРНУТУЮ ОТПРАВКУ ────────────────────────────
//
// Владелец: «мы можем добавлять больше чем одну картинку через cmd v и за один раз и за
// несколько». Здесь «несколько заходов» растянуто через сворачивание: вставил два, отправил,
// вставил третий ПОКА ПАЧКА ЛЕТИТ. Третий обязан пережить и доставку первых двух, и пилюлю.
head('3. ⌘V во время свёрнутой отправки не теряется');
uploadN = 0; uploadDelays = [900, 900];
await mount({});
await paste({ count: 2 });
await tryClick(page.locator('button', { hasText: /^upload all \(2\)$/i }).first());
await page.waitForTimeout(250);
ck((await dialogOpen()) === 0 && /uploading/i.test(await pillText()), 'отправка свёрнута в пилюлю',
  `«${await pillText()}»`);
await paste({ count: 1 });
await page.waitForFunction(() => window.__intake.delivered().length >= 2, null, { timeout: 25000 });
await page.waitForTimeout(500);
ck((await delivered()).length === 2, 'первая пачка доехала целиком', `их ${(await delivered()).length}`);
const leftover = await pillText();
ck(/show the upload \(1\)/i.test(leftover), 'вставленный в полёте кадр ЖИВ и назван в пилюле', `«${leftover}»`);
await tryClick(page.locator('body > div > button').filter({ hasText: /upload/i }).first());
await page.waitForTimeout(300);
ck((await dialogOpen()) === 1 && (await tiles()) === 1, 'разворот показывает ровно его',
  `окон ${await dialogOpen()}, плиток ${await tiles()}`);
await tryClick(page.locator('[role="dialog"] button', { hasText: /^upload$/i }).first());
await page.waitForFunction(() => window.__intake.delivered().length >= 3, null, { timeout: 25000 });
ck((await delivered()).length === 3, 'и он доезжает вторым заходом', `их ${(await delivered()).length}`);
ck((await calls()) === 2, 'двумя вызовами — по одному на пачку', `вызовов ${await calls()}`);

// ── 4. ПИЛЮЛЯ НЕ ЗАБИРАЕТ ЧУЖОГО: ХОЗЯЙСКОЕ ОКНО КЛИКАБЕЛЬНО И ЗАКРЫВАЕТСЯ ПО ESC ─────────────
//
// Обратная сторона F1: `pointer-events-auto` не должен открыть дырку В ДРУГУЮ сторону. Кнопка
// внутри хозяйского окна обязана получать клики при живой пилюле, а Esc — закрывать хозяйское
// окно как раньше (пилюля не ловушка фокуса и не слой).
head('4. пилюля рядом с чужим модальным окном — не барьер');
uploadN = 0; uploadDelays = [2000];
await mount({ insideModal: true });
await paste({ count: 1 });
await tryClick(page.locator('[role="dialog"] button', { hasText: /^upload$/i }).last());
await page.waitForTimeout(300);
// Хозяйское окно ОТКРЫТО, поэтому пилюля ищется напрямую, а не через «нет ни одного диалога».
const pillBtn = page.locator('body > div > button').filter({ hasText: /uploading/i });
ck((await pillBtn.count()) === 1, 'пилюля стоит, пачка летит',
  `их ${await pillBtn.count()}: «${(await pillBtn.count()) ? await pillBtn.first().textContent() : ''}»`);
await page.locator('[data-neighbour]').click();
ck((await page.evaluate(() => window.__intake.clicks())) === 1,
  'кнопка ВНУТРИ хозяйского окна получает клик при живой пилюле');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
ck((await page.evaluate(() => window.__intake.hostOpen())) === false,
  'Esc закрывает хозяйское окно — пилюля ему не мешает');

ck(pageErrors.length === 0, 'за весь прогон ни одного исключения на странице', pageErrors[0] ?? '');

await browser.close();
console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad === 0 ? 0 : 1);
