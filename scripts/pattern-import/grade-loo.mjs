#!/usr/bin/env node
// PATTERN-IMPORT · leave-one-out grade measurement. One PDF per process, no parallelism.
//   node scripts/pattern-import/grade-loo.mjs "<folder>" [--limit 1200]
//   node scripts/pattern-import/grade-loo.mjs --selftest
//   node scripts/pattern-import/grade-loo.mjs --report     (rebuild the markdown from the json)
// Writes docs/pattern-import/grade-loo-report.md (kept: fit.ts quotes it) and
// scripts/pattern-import/out/grade-loo-results.json (git-ignored; input of --report).
// Does not touch the regression baseline and does not run yarn patimport:regress.
import { build as esbuild } from 'esbuild';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '../..');
const REPORT = resolve(REPO, 'docs/pattern-import/grade-loo-report.md');
const RESULTS = resolve(REPO, 'scripts/pattern-import/out/grade-loo-results.json');
const WANT = [
  '2-A4-MDF-349-The-Leah-Shift-Dress-00-32-.pdf',
  '2-MDF350-The-Dyanna-Dress-00-32-A4-PATTERNS.pdf',
  'A4-MDF348-The-Cassandra-Kaftan-Dress-Sizes-00-32.pdf',
];
const BINS = [
  [0.5, '≤ 0.5'],
  [1, '≤ 1'],
  [2, '≤ 2'],
  [5, '≤ 5'],
  [10, '≤ 10'],
  [Infinity, '> 10'],
];

const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n, d) => (args.includes(n) ? args[args.indexOf(n) + 1] : d);

if (flag('--report')) {
  const data = JSON.parse(readFileSync(RESULTS, 'utf8'));
  writeFileSync(REPORT, render(data));
  console.log(REPORT);
  process.exit(0);
}

const dir = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--limit');
if (!flag('--selftest') && !dir) {
  console.error('usage: grade-loo.mjs <folder> [--limit 1200] | --selftest | --report');
  process.exit(2);
}

const work = resolve(tmpdir(), 'patimport-grade-loo');
mkdirSync(work, { recursive: true });
const outfile = resolve(work, `entry-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'grade-loo-entry.ts')],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  outfile,
  logLevel: 'warning',
  absWorkingDir: REPO,
  external: ['pdfjs-dist', 'pdfjs-dist/*'],
  alias: {
    components: resolve(REPO, 'src/components'),
    lib: resolve(REPO, 'src/lib'),
    utils: resolve(REPO, 'src/utils'),
  },
});
const runner = resolve(work, `run-${process.pid}.mjs`);
writeFileSync(
  runner,
  `process.env.PATIMPORT_REPO=${JSON.stringify(REPO)};\nconst m = await import(${JSON.stringify(pathToFileURL(outfile).href)});\nawait m.main(process.argv.slice(2));\n`,
);

function runOne(argv, limitMs) {
  return new Promise((done) => {
    const ch = spawn('node', ['--max-old-space-size=4096', runner, ...argv], {
      env: { ...process.env, REGRESS_CACHE: '/tmp/patimport-regress-cache' },
    });
    let out = '';
    let err = '';
    ch.stdout.on('data', (d) => (out += d));
    ch.stderr.on('data', (d) => {
      err += d;
      process.stderr.write(d);
    });
    const timer = setTimeout(() => ch.kill('SIGKILL'), limitMs);
    ch.on('close', (code, signal) => {
      clearTimeout(timer);
      const line = out.split('\n').find((l) => l.startsWith('GRADELOO '));
      if (!line) {
        done({
          error: signal ? 'timeout' : `no result (exit ${code})`,
          tail: (err || out).slice(-400),
        });
        return;
      }
      try {
        done(JSON.parse(line.slice(9)));
      } catch (e) {
        done({ error: `bad json: ${e.message}` });
      }
    });
  });
}

if (flag('--selftest')) {
  const r = await runOne(['--selftest'], 120000);
  if (r.error || r.selftest !== 'ok') {
    console.error(r.error || JSON.stringify(r));
    process.exit(1);
  }
  process.exit(0);
}

const limitMs = Number(opt('--limit', 1200)) * 1000;
const files = [];
for (const name of WANT) {
  const pdf = resolve(dir, name);
  if (!existsSync(pdf)) {
    console.error(`missing ${pdf}`);
    files.push({ name, short: name, error: 'missing file' });
    continue;
  }
  console.error(`\n--- ${name} ---`);
  files.push(await runOne([pdf], limitMs));
}

const data = { generated: new Date().toISOString(), folder: dir, files };
mkdirSync(dirname(RESULTS), { recursive: true });
writeFileSync(RESULTS, JSON.stringify(data));
writeFileSync(REPORT, render(data));
console.log(`\n${REPORT}`);

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function n2(v) {
  const x = num(v);
  return x == null ? '—' : x.toFixed(2);
}

function pct(k, n) {
  if (!n) return '—';
  return `${((100 * k) / n).toFixed(0)}% (${k}/${n})`;
}

function methodName(r) {
  const base = r.method === 'near2' ? '2 ближних' : r.method === 'far2' ? '2 дальних' : '3 ближних';
  const extra = [];
  if (r.extrapolated) extra.push('экстрап.');
  if (r.samePair && r.method === 'far2') extra.push('те же, что ближние');
  return extra.length ? `${base}, ${extra.join(', ')}` : base;
}

function areaCell(r) {
  const cm = r.dAreaMm2 / 100;
  const sign = cm > 0 ? '+' : '';
  return `${sign}${cm.toFixed(1)} см² (${sign}${r.dAreaPct.toFixed(1)}%)`;
}

/** Bbox of the piece, y up: top-centre scoop, upper side, mid side. Not garment-up if the piece is drawn on its side. */
function pieceName(hint, label) {
  const parts = String(hint || '')
    .split(/\s*·\s*/)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const i = parts.findIndex((s) => /^[A-Z] - /.test(s));
  if (i < 0) return String(label);
  const bits = [parts[i]];
  for (let k = i + 1; k < parts.length; k++) {
    if (/^[A-Z][A-Z /]+$/.test(parts[k]) && parts[k].length < 24) bits.push(parts[k]);
    else break;
  }
  return bits.join(' ');
}

/** Zone from the piece title (`E - SLEEVES`), not from a notch note elsewhere in the hint. */
function garment(hint, row) {
  const title = pieceName(hint, '').toLowerCase();
  if (/sleeve/.test(title) && !/ruffle/.test(title)) return 'окат';
  if (/ruffle/.test(title)) return 'волан';
  if (/neck/.test(title)) return 'вырез';
  if (/armhole|top front|front top/.test(title)) return 'пройма';
  if (/godet/.test(title)) return 'клин';
  if (/skirt/.test(title)) return row.hot && row.hot.relY > 0.65 ? 'пояс' : 'юбка';
  if (/shoulder/.test(title)) return 'плечо';
  const z = zone(row);
  return z || 'край';
}

function zone(row) {
  const h = row.hot;
  if (!h) return '';
  if (h.spanFrac > 0.4) return 'весь контур';
  if (h.spanMm < 12 && row.max > 4 && row.max > row.p95 * 2.5) return 'вершина';
  if (h.pieceH < 110 && h.pieceW > 2.2 * h.pieceH) return 'пояс';
  if (h.concave && h.spanMm < 45 && h.depthMm > 8 && h.pieceH > 180) return 'вытачка';
  if (h.concave && h.relY > 0.68 && h.relX > 0.18 && h.relX < 0.82) return 'вырез';
  if (h.concave && h.relY > 0.48 && (h.relX < 0.28 || h.relX > 0.72)) return 'пройма';
  if (h.concave && h.relY > 0.25 && h.relY < 0.72 && (h.relX < 0.32 || h.relX > 0.68) && h.pieceH > 160)
    return 'пояс';
  if (!h.concave && h.relY > 0.7 && h.depthMm < -2) return 'окат';
  return 'край';
}

function eligiblePieces(data) {
  const out = [];
  for (const f of data.files) {
    if (f.error || !f.pieces) continue;
    for (const p of f.pieces) if (p.eligible) out.push({ file: f.short || f.name, p });
  }
  return out;
}

function maxOf(rows) {
  let m = null;
  for (const r of rows) if (m == null || r.p95 > m) m = r.p95;
  return m;
}

function median(xs) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

function quantileOf(xs, q) {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.max(0, Math.ceil(q * s.length) - 1))];
}

function share(xs, lim) {
  if (!xs.length) return null;
  return xs.filter((v) => v <= lim).length / xs.length;
}

function histRows(xs) {
  const lines = [
    '| ошибка p95 куска | кусков | доля | накоплено |',
    '| --- | ---: | ---: | ---: |',
  ];
  let prev = -Infinity;
  let acc = 0;
  for (const [lim, name] of BINS) {
    const k = xs.filter((v) => v > prev && v <= lim).length;
    acc += k;
    lines.push(`| ${name} мм | ${k} | ${pct(k, xs.length)} | ${pct(acc, xs.length)} |`);
    prev = lim;
  }
  return lines.join('\n');
}

function pieceErr(p, pred) {
  return maxOf(p.rows.filter(pred));
}

function interp2(r) {
  return (r.method === 'near2' || r.method === 'far2') && !r.extrapolated;
}

function render(data) {
  const pieces = eligiblePieces(data);
  const allFamilies = data.files.reduce((a, f) => a + (f.families || 0), 0);
  const allPieces = data.files.reduce((a, f) => a + (f.pieces?.length || 0), 0);
  const eligible = pieces.length;

  const nearAll = pieces.map(({ p }) => pieceErr(p, (r) => r.method === 'near2')).filter((v) => v != null);
  const nearIn = pieces
    .map(({ p }) => pieceErr(p, (r) => r.method === 'near2' && !r.extrapolated))
    .filter((v) => v != null);
  const farIn = pieces
    .map(({ p }) => pieceErr(p, (r) => r.method === 'far2' && !r.extrapolated && !r.samePair))
    .filter((v) => v != null);
  const near3In = pieces
    .map(({ p }) => pieceErr(p, (r) => r.method === 'near3' && !r.extrapolated))
    .filter((v) => v != null);
  // linearity: worst bracketed prediction from two sizes (near or far; a 3-size piece's only pair counts once)
  const lin = pieces
    .map(({ p }) => {
      const seen = new Set();
      let m = null;
      for (const r of p.rows) {
        if (!interp2(r)) continue;
        const k = `${r.value}|${r.from.join('+')}`;
        if (seen.has(k)) continue;
        seen.add(k);
        if (m == null || r.p95 > m) m = r.p95;
      }
      return m;
    })
    .filter((v) => v != null);

  const sizeNear = [];
  const sizeNearIn = [];
  const sizeFarIn = [];
  for (const { p } of pieces) {
    for (const r of p.rows) {
      if (r.method === 'near2') sizeNear.push(r.p95);
      if (r.method === 'near2' && !r.extrapolated) sizeNearIn.push(r.p95);
      if (r.method === 'far2' && !r.extrapolated && !r.samePair) sizeFarIn.push(r.p95);
    }
  }

  const deltas = [];
  for (const { file, p } of pieces) {
    const vals = new Set(p.rows.map((r) => r.value));
    for (const v of vals) {
      const a = p.rows.find((r) => r.value === v && r.method === 'near2');
      const b = p.rows.find((r) => r.value === v && r.method === 'near3');
      if (!a || !b || a.extrapolated || b.extrapolated) continue;
      deltas.push({ d: a.p95 - b.p95, file, label: p.label, size: a.label });
    }
  }
  const help = deltas.filter((x) => x.d > 0.5).length;
  const hurt = deltas.filter((x) => x.d < -0.5).length;

  const nearMed = [];
  for (const { p } of pieces) {
    const xs = p.rows.filter((r) => r.method === 'near2' && !r.extrapolated).map((r) => r.p95);
    const m = median(xs);
    if (m != null) nearMed.push(m);
  }
  const localFail = [];
  for (const { file, p } of pieces) {
    for (const r of p.rows) {
      if (r.method !== 'near2' || r.extrapolated || r.p95 <= 2) continue;
      localFail.push({ file, p, r, why: garment(p.hint, r) });
    }
  }
  const globalMid = [];
  for (const { file, p } of pieces) {
    const rs = p.rows.filter((r) => r.method === 'far2' && !r.extrapolated && !r.samePair);
    if (!rs.length) continue;
    const worst = rs.reduce((a, b) => (a.p95 >= b.p95 ? a : b));
    globalMid.push({ file, p, r: worst });
  }

  const lines = [];
  const w = (s = '') => lines.push(s);

  w('# Leave-one-out градация: Leah, Dyanna, Cassandra');
  w();
  w(`Снято ${data.generated.slice(0, 16).replace('T', ' ')}. Папка \`${data.folder}\`.`);
  w('Один процесс на PDF, кэш извлечения `/tmp/patimport-regress-cache`. Конвейер не менялся.');
  w();
  w('## Как сведены контуры');
  w();
  w('Размеры одной детали лежат на одном листе, общая кромка уже совпадает в миллиметрах, поэтому контуры не сдвигаются к центру. Предсказание не видит удерживаемый контур: соответствие строится только по опорным размерам.');
  w();
  w('1. Обход против часовой стрелки (y вверх), повтор точки замыкания снимается.');
  w('2. Вершины — поворот на ±2 мм. Берётся самый жёсткий порог из 70°, 55°, 40°, 30°, 22°, при котором у всех опорных контуров одинаковое число вершин и их не меньше трёх. Из двух вершин ближе 4 мм остаётся более острая.');
  w('3. Циклический сдвиг на контур среднего по значению размера: знак поворота совпадает, цена — сумма квадратов расстояний вершин. Если вторая фаза дороже первой меньше чем в 1.5 раза, фаза помечена неоднозначной, берётся всё равно более дешёвая. Старт отсчёта — вершина, которая меньше всего разъезжается между опорными размерами (общая кромка).');
  w('4. Между соседними вершинами оба контура режутся по доле длины дуги на одно и то же число точек, шаг 1.5 мм по более длинному ребру. Одинаковый индекс — одно и то же место детали.');
  w('5. Если общего набора вершин нет (или лучшая фаза разъезжается больше чем на 150 мм среднеквадратично), запасной путь: начало в вершине, ближайшей к устойчивому излому опорного контура, дальше равномерная длина дуги.');
  w();
  w('Линейно по значению `parseSizeToken`, не по номеру ранга. «00» становится −2, «0» — 0, «2» — 2: шаг ряда 00, 0, 2, 4, … равен 2. Как целые «00» и «0» схлопнулись бы в один размер. На полном ряде без пропусков значение аффинно рангу, и веса совпали бы; они расходятся, когда метка не встала на этот ряд.');
  w();
  w('Два опорных размера: `P(v) = A + (v − va) / (vb − va) · (B − A)`. Три (только если закрытых размеров ≥ 4): МНК `x = a + b·v` по каждой точке, то же для y. «2 ближних» и «2 дальних» — по |значению − v|. Если опорные не окружают v, строка помечена «экстрап.».');
  w();
  w('Ошибка: точки предсказания каждые 0.5 мм, расстояние до полилинии настоящего контура (предсказанный → настоящий), p95 и максимум. Δплощади — шнуровка предсказания минус шнуровка настоящего.');
  w();
  w('## Где сведение ломается');
  w();
  w('Запасной путь по длине дуги включается, когда вершины не совпали числом. Так бывает, если вытачка или метка размера попала в контур только одного размера, или если линия гладкая и порог не набирает трёх углов (окат, плавный вырез). Фаза тогда привязана к ближайшей вершине: если эта точка сама уезжает с размером, весь контур сдвигается вдоль себя, и лерп срезает угол, которого в параметризации уже нет.');
  w();
  w('Неоднозначная фаза — почти симметричный кусок (пояс-прямоугольник, симметричная обтачка): две фазы почти равны по цене, и пространственный критерий не знает, какой конец какой. Общая кромка это обычно разруливает; если её нет и кусок растёт от центра, старт может встать не туда.');
  w();
  w('Соответствие по вершинам не лечит контур, который заливка закрыла не по линии этого размера (`continuity`, `repair`, длинный derived-мостик). Большая ошибка на таком размере — про конвейер, не про градацию. Ниже это выписано отдельно и в коде не чинилось.');
  w();

  const arcRows = [];
  const ambRows = [];
  const slideRows = [];
  for (const { file, p } of pieces) {
    for (const r of p.rows) {
      if (r.align === 'arc') arcRows.push({ file, label: p.label, hint: p.hint, r });
      if (r.ambiguous) ambRows.push({ file, label: p.label, hint: p.hint, r });
      if (r.stableMm > 8) slideRows.push({ file, label: p.label, hint: p.hint, r });
    }
  }
  const arcLocal = arcRows.filter((x) => x.r.method === 'near2' && !x.r.extrapolated);
  w(`На этих трёх файлах запасной путь по дуге сработал в ${arcRows.length} предсказаниях (включая экстраполяцию через весь ряд), неоднозначная фаза — в ${ambRows.length}, старт разъехался больше чем на 8 мм — в ${slideRows.length}. Из локальных интерполяций по двум ближним на дугу село ${arcLocal.length}.`);
  const arcBad = arcLocal.filter((x) => x.r.p95 > 2).sort((a, b) => b.r.p95 - a.r.p95);
  if (arcBad.length) {
    w();
    w('Локальная интерполяция, где вершины не сошлись и p95 > 2 мм (это и есть поломка сведения, не «размер уехал на 100 мм при экстраполяции с 30 на 00»):');
    w();
    for (const x of arcBad.slice(0, 15))
      w(`- ${x.file} · ${pieceName(x.hint, x.label)} · размер ${x.r.label} · p95 ${n2(x.r.p95)} мм · старт ${n2(x.r.stableMm)} мм`);
  }
  if (ambRows.length) {
    w();
    w('Неоднозначная фаза (первые 8 по ошибке):');
    w();
    for (const x of ambRows.sort((a, b) => b.r.p95 - a.r.p95).slice(0, 8))
      w(`- ${x.file} · ${x.label} · размер ${x.r.label} · ${methodName(x.r)} · p95 ${n2(x.r.p95)} · margin ${n2(x.r.margin)}`);
  }

  w();
  w('## Сводка');
  w();
  w(`Семейств (кусков заливки, включая семена без единого закрытого размера): ${allFamilies}. Из них с хотя бы одним кандидатом в выдаче: ${allPieces}. **Пригодны к замеру — закрылись минимум на 3 размерах с разобранной меткой: ${eligible}.**`);
  w();
  w('Две доли. «Худший размер» — кусок проходит, только если проходит каждый его размер. «Медиана размеров» — типичный размер того же куска. Обе считаются от пригодных кусков.');
  w();
  w('| метод | ≤ 1 мм | ≤ 2 мм | ≤ 5 мм | кусков |');
  w('| --- | ---: | ---: | ---: | ---: |');
  const rowShare = (title, xs) =>
    w(
      `| ${title} | ${pct(xs.filter((v) => v <= 1).length, xs.length)} | ${pct(xs.filter((v) => v <= 2).length, xs.length)} | ${pct(xs.filter((v) => v <= 5).length, xs.length)} | ${xs.length} |`,
    );
  rowShare('2 ближних, худший размер (с экстраполяцией краёв)', nearAll);
  rowShare('2 ближних, худший размер, только интерполяция', nearIn);
  rowShare('2 ближних, медиана размеров, только интерполяция', nearMed);
  rowShare('2 дальних, интерполяция, пара не совпала с ближними', farIn);
  rowShare('3 ближних, только интерполяция', near3In);
  rowShare('худшая окружающая пара, включая концы ряда', lin);
  w();
  w('Та же доля по отдельным размерам, не по кускам:');
  w();
  w('| метод | ≤ 1 мм | ≤ 2 мм | ≤ 5 мм | размеров |');
  w('| --- | ---: | ---: | ---: | ---: |');
  rowShare('2 ближних, все размеры', sizeNear);
  rowShare('2 ближних, интерполяция', sizeNearIn);
  rowShare('2 дальних, интерполяция', sizeFarIn);
  w();
  w('Распределение худшего p95 куска, 2 ближних, только интерполяция. p90 здесь большой из‑за одного-двух размеров на кусок, не из‑за типичного шага:');
  w();
  w(histRows(nearIn));
  w();
  w(`Худший размер куска: медиана ${n2(median(nearIn))} мм, p90 ${n2(quantileOf(nearIn, 0.9))} мм, максимум ${n2(nearIn.length ? Math.max(...nearIn) : null)} мм. Медиана размеров куска: медиана ${n2(median(nearMed))} мм, p90 ${n2(quantileOf(nearMed, 0.9))} мм. По отдельным размерам медиана p95 ${n2(median(sizeNearIn))} мм.`);
  w();
  w('### По файлам');
  w();
  w('| файл | семейств | пригодны | < 3 закрытых | ошибка чтения |');
  w('| --- | ---: | ---: | ---: | --- |');
  for (const f of data.files) {
    const el = f.pieces?.filter((p) => p.eligible).length ?? 0;
    const low = f.pieces?.filter((p) => !p.eligible).length ?? 0;
    w(`| ${f.short || f.name} | ${f.families ?? '—'} | ${el} | ${low} | ${f.error || '—'} |`);
  }
  w();
  for (const f of data.files) {
    if (!f.run) continue;
    const labels = f.run.map((s) => `${s.label || '∅'}→${s.value == null ? '?' : s.value}`).join(', ');
    w(`Ряд ${f.short}: ${labels}.`);
    const parsed = f.run.filter((s) => s.value != null);
    if (parsed.length >= 2) {
      const r0 = parsed[0].rank;
      const v0 = parsed[0].value;
      const r1 = parsed[parsed.length - 1].rank;
      const v1 = parsed[parsed.length - 1].value;
      const b = r1 === r0 ? 0 : (v1 - v0) / (r1 - r0);
      let worst = 0;
      for (const s of parsed) worst = Math.max(worst, Math.abs(s.value - (v0 + b * (s.rank - r0))));
      w(`Значение относительно ранга: шаг ${n2(b)}, наибольший остаток ${n2(worst)} (0 — ряд аффинен рангу, веса leave-one-out совпали бы).`);
    }
  }

  w();
  w('## Третий размер');
  w();
  w('Для каждого размера, который можно окружить, сравнивается p95 по двум ближайшим и по трём ближайшим (МНК). Положительная разница — третий уменьшил ошибку.');
  w();
  w(`Таких размеров ${deltas.length}. Медиана (p95₂ − p95₃) = ${n2(median(deltas.map((d) => d.d)))} мм. Третий помогает больше чем на 0.5 мм в ${help}, вредит больше чем на 0.5 мм в ${hurt}, в остальных он внутри ±0.5 мм.`);
  w();
  if (hurt) {
    w('Где третий вредит (линейная модель уводит в сторону; невязка опорных между собой):');
    w();
    for (const x of deltas.filter((d) => d.d < -0.5).sort((a, b) => a.d - b.d).slice(0, 15))
      w(`- ${x.file} · ${x.label} · размер ${x.size}: ${n2(-x.d)} мм хуже`);
  }

  w();
  w('## Где градация не линейна');
  w();
  w('Две разные нелинейности. Локальная: два ближайших закрытых размера, которые окружают удерживаемый, не попадают в него. Это проверка из плана (третий размер). Глобальная: прямая через концы ряда (00 и 32) не попадает в середину, даже когда локальный шаг почти точный.');
  w();
  w('### Локально, p95 > 2 мм');
  w();
  w('Зона — по названию куска на листе (`SKIRT`, `TOP FRONT`, `NECKLINE`, `SLEEVES`, `GODETS`). Если в названии этого нет, зона взята по рамке контура и может врать на куске, нарисованном боком. «Дуга» в столбце сведения значит, что общее число вершин не сошлось.');
  w();
  if (!localFail.length) w('Таких размеров нет.');
  else {
    w('| файл | кусок | размер | по | p95 | max | Δплощади | почему | сведение |');
    w('| --- | --- | --- | --- | ---: | ---: | --- | --- | --- |');
    for (const f of localFail.sort((a, b) => b.r.p95 - a.r.p95)) {
      const how =
        f.r.align === 'arc'
          ? 'дуга'
          : f.r.stableMm > 8
            ? `вершины, старт ${n2(f.r.stableMm)} мм`
            : 'вершины';
      w(
        `| ${f.file} | ${esc(pieceName(f.p.hint, f.p.label))} | ${esc(f.r.label)} | ${f.r.from.join(' + ')} | ${n2(f.r.p95)} | ${n2(f.r.max)} | ${areaCell(f.r)} | ${f.why} | ${how} |`,
      );
    }
  }
  w();
  w('### На весь ряд');
  w();
  w('Худшая интерполяция по двум дальним (пара не совпала с ближними). Это предсказание середины по концам ряда.');
  w();
  if (!globalMid.length) w('Таких пар нет.');
  else {
    w('| файл | кусок | размер | по | p95 | max | Δплощади | сведение |');
    w('| --- | --- | --- | --- | ---: | ---: | --- | --- |');
    for (const f of globalMid.sort((a, b) => b.r.p95 - a.r.p95))
      w(
        `| ${f.file} | ${esc(pieceName(f.p.hint, f.p.label))} | ${esc(f.r.label)} | ${f.r.from.join(' + ')} | ${n2(f.r.p95)} | ${n2(f.r.max)} | ${areaCell(f.r)} | ${f.r.align} |`,
      );
    const cornerMids = globalMid.filter((f) => f.r.align === 'corners').map((f) => f.r.p95);
    w();
    w(`Там, где вершины сошлись, медиана этой ошибки ${n2(median(cornerMids))} мм (n=${cornerMids.length}). Прямая с 00 на 32 середину не держит. Локальный шаг у тех же кусков часто меньше 1 мм: градация кривая по ряду, не по соседнему размеру. Воланы рукава Dyanna остаются на 0.01 мм даже через весь ряд: простая форма линейна. Ломается кривая кройки и сведение без общих вершин, не градация как таковая.`);
  }

  w();
  w('## Допуск и отказ');
  w();
  w(`Допуск **2 мм** p95: расстояние предсказанного контура до настоящего, предсказание по двум ближайшим закрытым размерам, которые окружают проверяемый. 1 мм режет типичный шаг (медиана по размерам ${n2(median(sizeNearIn))} мм, в 1 мм укладывается ${pct(sizeNearIn.filter((v) => v <= 1).length, sizeNearIn.length)} размеров). 5 мм пропускает вырез и талию, которые сидят на 6–11 мм уже при сошедшихся вершинах. В 2 мм укладывается ${pct(sizeNearIn.filter((v) => v <= 2).length, sizeNearIn.length)} размеров и ${pct(nearMed.filter((v) => v <= 2).length, nearMed.length)} кусков по медиане размера. По худшему размеру — ${pct(nearIn.filter((v) => v <= 2).length, nearIn.length)}: один плохой размер бракует кусок, и так и надо отказывать.`);
  w();
  w(`Отказ. Закрытых размеров меньше трёх — не градуировать, проверять нечем. Иначе удержать один закрытый и предсказать его по двум ближайшим, которые его окружают. **Невязка p95 больше 2 мм — не градуировать** ни одну дыру этого куска. Третий размер в формулу МНК не ставить: медиана разницы с двумя опорами ${n2(median(deltas.map((d) => d.d)))} мм, и чаще он ухудшает предсказание. Он только эта проверка.`);
  w();
  w('Не вести одну прямую через весь ряд. Дыру заполнять с опор не дальше соседнего закрытого размера. Если между опорами несколько пропущенных размеров, та же проверка обязана уложиться в 2 мм — на концах ряда она не укладывается.');
  w();
  w('Экстраполяцию (обе опоры с одной стороны от дыры) тем же правилом не подтвердить: третьего размера с другой стороны нет. Без него не градуировать. В таблицах кусков такие строки помечены «экстрап.».');
  w();
  w('Что 2 мм не пропускает, и это не шум сведения:');
  w();
  w('- **пройма** — Leah B, верх переда: размеры 4 и 6, вершины с соседями не сошлись, p95 23–28 мм.');
  w('- **окат** — Dyanna E, рукава: почти весь ряд режется по дуге, локальный p95 до 14 мм.');
  w('- **вырез** — Leah G, обтачка горловины спинки: вершины сошлись, размеры 4 и 6 всё равно на 7 и 11 мм.');
  w('- **пояс** — Leah E, перед юбки: четыре общие вершины сидят на месте, верх контура (талия) на размерах 20 и 30 уезжает на 13 и 22 мм.');
  w();
  w('Клинья Dyanna (H, I, J) заливка сама пометила не монотонными: площадь падает с ростом размера. Это не градация «размер больше — кусок больше». В авто-градацию их не брать, даже где p95 около 2 мм.');

  w();
  w('## Конвейер, не тронут');
  w();
  const pipe = [];
  for (const f of data.files) {
    if (!f.pieces) continue;
    for (const p of f.pieces) {
      for (const note of p.notes || []) {
        if (note.startsWith('closed parsed')) continue;
        if (note.startsWith('arc-length')) continue;
        if (note.startsWith('ambiguous')) continue;
        pipe.push(`- ${f.short} · ${p.label}: ${note}`);
      }
    }
  }
  if (!pipe.length) w('Замечаний к меткам, мостам и `rankFrom` нет.');
  else {
    w('Это наблюдения прогона. Код конвейера не менялся.');
    w();
    for (const line of pipe) w(line);
  }

  w();
  w('Cassandra отдала 2 семьи (платье и плечо) на 18 размеров ряда; у обеих часть размеров так и не закрылась. У Leah и Dyanna тоже есть дыры по отдельным размерам (у спинки Leah нет 18, 24 и 26). Это как раз те дыры, которые градация должна закрывать, и замер говорит, когда ей можно это доверить. Код заливки не менялся.');
  w();
  w('## По кускам');
  w();
  w('Непригодные (меньше трёх закрытых размеров с меткой) — одной строкой. У пригодного — таблица каждого удержанного размера.');
  w();
  for (const f of data.files) {
    w(`### ${f.short || f.name}`);
    w();
    if (f.error && !f.pieces) {
      w(`Ошибка: ${f.error}`);
      if (f.tail) w(`\n\`\`\`\n${f.tail}\n\`\`\``);
      w();
      continue;
    }
    const list = (f.pieces || []).slice().sort((a, b) =>
      String(a.label).localeCompare(String(b.label), 'en', { numeric: true }),
    );
    for (const p of list) {
      const oc = Object.entries(p.outcomes || {})
        .map(([k, v]) => `${k[0]}${v}`)
        .join(' ');
      const hint = p.hint ? ` · ${p.hint}` : '';
      if (!p.eligible) {
        w(`- **${esc(p.label)}**${hint} — закрыто ${p.closed}, разобрано ${p.parsed}, не пригоден. ${oc}`);
        continue;
      }
      const ni = pieceErr(p, (r) => r.method === 'near2' && !r.extrapolated);
      const na = pieceErr(p, (r) => r.method === 'near2');
      w(`#### ${esc(p.label)}${hint}`);
      w();
      w(`Закрыто ${p.closed}, в замере ${p.parsed}. Исходы ${oc}. Худший p95 двух ближних ${n2(na)} мм, из них интерполяция ${n2(ni)} мм.${p.monotone ? '' : ' Заливка: не монотонна.'}`);
      if (p.notes?.length) w(`Заметки: ${p.notes.join('; ')}.`);
      w();
      w('| размер | метод | по | p95, мм | max, мм | Δплощади |');
      w('| --- | --- | --- | ---: | ---: | --- |');
      const rows = p.rows.slice().sort((a, b) => a.value - b.value || methodOrder(a) - methodOrder(b));
      for (const r of rows)
        w(`| ${esc(r.label)} | ${methodName(r)} | ${r.from.join(' + ')} | ${n2(r.p95)} | ${n2(r.max)} | ${areaCell(r)} |`);
      w();
    }
  }

  w('## Что не входит в число');
  w();
  w('Три файла одной серии MDF. Это замер, можно ли вообще градуировать закрытый кусок, а не приёмочный прогон корпуса. Куски, которые ни на одном размере не закрылись, в доли не входят.');
  return lines.join('\n') + '\n';
}

function methodOrder(r) {
  return r.method === 'near2' ? 0 : r.method === 'far2' ? 1 : 2;
}

function esc(s) {
  return String(s ?? '').replace(/\|/g, '\\|');
}
