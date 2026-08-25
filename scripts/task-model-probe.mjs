#!/usr/bin/env node
// УТВЕРЖДАЕТ: правила раздела задач без браузера — исполнитель на проводе ВЫВОДИТСЯ из списка,
// решённая карточка не просрочена, кучки по людям сужают доску, слияние инлайн-правки берёт
// неправленые поля из СВЕЖЕГО чтения. КРАСНЕЕТ ОТ: любого из семи флагов --mutate-… ниже.
//
// ЧИСТАЯ ПРОБА ОЧЕРЕДИ А: А1 (мультиасайн), А2 (overdue у решённых), А4 (фильтр по людям),
// А5-ядро (слияние инлайн-правки).
//
// КАЖДАЯ МУТАЦИЯ ЖИВЁТ В ПАМЯТИ СБОРЩИКА, а не в файле: правка исходника ради проверки — это
// правка, которую однажды забудут откатить. Мутация, чей якорь не найден РОВНО ОДИН РАЗ,
// обрывает прогон словами «не запускалась» — иначе зелёный после неё не значил бы ничего.
//
//   node scripts/task-model-probe.mjs
//   node scripts/task-model-probe.mjs --mutate-carry-assignee    А1: пронесённое поле вместо выведенного
//   node scripts/task-model-probe.mjs --mutate-no-settled        А2: решённая карточка снова краснеет
//   node scripts/task-model-probe.mjs --mutate-mine-single       А4: «мои» снова смотрит в одиночное поле
//   node scripts/task-model-probe.mjs --mutate-no-people-branch  А4: сужение по лицу выключено
//   node scripts/task-model-probe.mjs --mutate-no-exclusion      А4: «мои» и лицо больше не гасят друг друга
//   node scripts/task-model-probe.mjs --mutate-no-conflict       А5: конфликт-проверка снята
//   node scripts/task-model-probe.mjs --mutate-merge-from-base   А5: слияние из открытой страницы, не из свежего

import { build as esbuild } from 'esbuild';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');

const dieNotRun = (why) => {
  console.log(`\nНЕ ЗАПУСКАЛАСЬ: ${why}`);
  console.log('зелёный или красный прогон в этом состоянии не доказывал бы ничего.');
  process.exit(2);
};

// ─── СЕТЕВОЙ СЛОЙ ЗАГЛУШЕН ──────────────────────────────────────────────────────────────────
// Не ради вызовов (их здесь нет), а ради ИМПОРТА: `api/api.ts` на загрузке читает
// `import.meta.env` и заводит fetch-обвязку. Маркер ниже проверяется в собранном тексте —
// объявить плагин и забыть передать его в `plugins` это документированная ловушка.
const STUB_MARKER = 'PROBE_STUB_TASKS_PURE_NETWORK';
const REAL_API_MARKER = 'Grpc-Metadata-Authorization';
const stub = {
  name: 'stub-network-layer',
  setup(b) {
    b.onResolve({ filter: /(^|\/)api\/api$/ }, () => ({ path: 'stub', namespace: 'probe-stub' }));
    b.onLoad({ filter: /.*/, namespace: 'probe-stub' }, () => ({
      contents: `
        // ${STUB_MARKER}
        const call = (m) => () => Promise.reject(new Error('${STUB_MARKER}: ' + m));
        const service = new Proxy({}, { get: (_t, k) => (typeof k === 'string' ? call(k) : undefined) });
        export const adminService = service;
        export const authService = service;
        export const frontendService = service;
        export const requestHandler = () => Promise.reject(new Error('${STUB_MARKER}'));
      `,
      loader: 'js',
    }));
  },
};

const outfile = resolve(tmpdir(), `tasks-pure-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'task-model-probe-entry.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  absWorkingDir: REPO,
  nodePaths: [resolve(REPO, 'src'), resolve(REPO, 'node_modules')],
  jsx: 'automatic',
  minify: false,
  outfile,
  logLevel: 'warning',
  loader: { '.svg': 'text', '.png': 'dataurl', '.woff2': 'dataurl', '.css': 'empty' },
  alias: { '@': resolve(REPO, 'src') },
  plugins: [stub], // ← без этой строки в сборку уехал бы настоящий api-слой
  define: {
    'import.meta.env': '{"VITE_SERVER_URL":"http://stub.invalid","MODE":"production"}',
    'import.meta.env.VITE_SERVER_URL': '"http://stub.invalid"',
    'process.env.NODE_ENV': '"production"',
  },
}).catch((e) => dieNotRun(`сборка не собралась: ${e.message}`));

let bundle = readFileSync(outfile, 'utf8');
if (!bundle.includes(STUB_MARKER)) dieNotRun(`в сборке нет «${STUB_MARKER}» — сетевой слой НЕ заглушен`);
if (bundle.includes(REAL_API_MARKER)) dieNotRun(`в сборке есть «${REAL_API_MARKER}» — настоящий api-слой внутри`);

// ─── МУТАЦИИ ────────────────────────────────────────────────────────────────────────────────
const flag = (n) => process.argv.includes(n);
function mutate(name, needle, replacement) {
  const n = bundle.split(needle).length - 1;
  if (n !== 1) dieNotRun(`МУТАЦИЯ «${name}» НЕ ПРИМЕНИЛАСЬ: якорь найден ${n} раз вместо одного`);
  bundle = bundle.replace(needle, replacement);
  console.log(`  МУТАЦИЯ: ${name}`);
}
if (flag('--mutate-carry-assignee'))
  mutate('А1 пронесённое поле вместо выведенного', 'assignee: assignees[0] ?? ""', 'assignee: _derived ?? ""');
if (flag('--mutate-no-settled'))
  mutate('А2 решённость больше не учитывается', 'if (settled) return', 'if (false) return');
if (flag('--mutate-mine-single'))
  mutate(
    'А4 «мои» смотрит в одиночное поле',
    'if (f.mine && !(!!currentUser && t.task.assignees.includes(currentUser))) return false;',
    'if (f.mine && t.task.assignee !== currentUser) return false;',
  );
if (flag('--mutate-no-people-branch'))
  mutate(
    'А4 сужение по лицу выключено',
    '} else if (!t.task.assignees.includes(f.assignee)) return false;',
    '}',
  );
if (flag('--mutate-no-exclusion'))
  mutate('А4 «мои» и лицо не гасят друг друга', 'if (patch.assignee !== void 0) next.mine = false;', ';');
if (flag('--mutate-no-conflict'))
  mutate(
    'А5 конфликт-проверка снята',
    'if (!sameValue(fresh[key], base[key])) return { ok: false, field: key };',
    ';',
  );
if (flag('--mutate-merge-from-base'))
  mutate('А5 слияние из открытой страницы', 'content: { ...fresh, ...patch }', 'content: { ...base, ...patch }');

const mutfile = resolve(tmpdir(), `tasks-pure-mut-${process.pid}.mjs`);
writeFileSync(mutfile, bundle);
const M = await import(pathToFileURL(mutfile).href);
rmSync(outfile, { force: true });
rmSync(mutfile, { force: true });

let bad = 0;
const ck = (ok, what, d = '') => {
  if (!ok) bad++;
  console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`);
};

// ═══ А1 · МУЛЬТИАСАЙН ════════════════════════════════════════════════════════════════════════
console.log('\nА1 · список исполнителей — источник истины, одиночное поле выводится');

const base = M.emptyTaskInsert();
ck(Array.isArray(base.assignees) && base.assignees.length === 0, 'Ц1.0 пустая карточка = пустой список');

// Ключевой случай: форма сменила исполнителя (правит только список), а совместимое поле
// осталось от прошлого чтения. На провод обязано уехать НОВОЕ имя.
const stale = { ...base, assignee: 'stale-old-owner', assignees: ['fresh-new-owner'] };
const wire = M.taskInsertToWire(stale);
ck(
  wire.assignee === 'fresh-new-owner',
  'Ц1.1 на провод уехало ВЫВЕДЕННОЕ имя, а не пронесённое',
  `wire.assignee = ${JSON.stringify(wire.assignee)}`,
);
ck(
  !('assignees' in wire),
  'Ц1.2 поля `assignees` на проводе НЕТ (его там ещё не существует)',
  `ключи: ${Object.keys(wire).filter((k) => /assign/i.test(k)).join(', ')}`,
);
ck(
  M.taskInsertToWire({ ...base, assignee: 'ghost', assignees: [] }).assignee === '',
  'Ц1.3 пустой список = «никто не взял», а не призрак из прошлого чтения',
);
ck(
  M.taskInsertToWire({ ...base, assignees: ['a', 'b'] }).assignee === 'a',
  'Ц1.4 из списка на одиночный провод сводится ПЕРВЫЙ',
);

const read = M.mapInsert({ title: 't', assignee: 'nina' });
ck(
  JSON.stringify(read.assignees) === '["nina"]' && read.assignee === 'nina',
  'Ц1.5 чтение наполняет ОБА поля из одного источника — разойтись им нечем',
  `assignees=${JSON.stringify(read.assignees)} assignee=${JSON.stringify(read.assignee)}`,
);
ck(
  M.mapInsert({ title: 't' }).assignees.length === 0,
  'Ц1.6 нет исполнителя на проводе = пустой список, а не список из пустой строки',
);

// ═══ А2 · OVERDUE У РЕШЁННЫХ ═════════════════════════════════════════════════════════════════
console.log('\nА2 · done и архив показывают срок нейтрально');

const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays) => new Date(Date.now() + offsetDays * day).toISOString();

const openYesterday = M.dueMeta(iso(-1), false);
const doneYesterday = M.dueMeta(iso(-1), true);
ck(openYesterday.state === 'overdue', 'Ц2.1 незакрытая со вчерашним сроком — overdue', JSON.stringify(openYesterday));
ck(
  doneYesterday.state === 'later' && /^[A-Z][a-z]{2} \d{1,2}$/.test(doneYesterday.label),
  'Ц2.2 РЕШЁННАЯ с тем же сроком — нейтральная дата «MMM d»',
  JSON.stringify(doneYesterday),
);
ck(!/overdue/.test(doneYesterday.label), 'Ц2.3 слова «overdue» на решённой нет вовсе');
ck(M.dueMeta(iso(0), true).state === 'later', 'Ц2.4 решённая со сроком «сегодня» не кричит «today»');
ck(M.dueMeta(iso(1), true).state === 'later', 'Ц2.5 решённая со сроком «завтра» не кричит «soon»');
ck(M.dueMeta(undefined, true).state === 'none', 'Ц2.6 без срока — по-прежнему нечего показывать');
ck(M.dueMeta(iso(0), false).state === 'today', 'Ц2.7 незакрытая «сегодня» не сломана');
ck(M.dueMeta(iso(1), false).state === 'soon', 'Ц2.8 незакрытая «завтра» не сломана');

// ═══ А4 · ФИЛЬТР ПО ЛЮДЯМ ════════════════════════════════════════════════════════════════════
console.log('\nА4 · ряд лиц: кучки, сужение, взаимоисключение с «my tasks»');

const card = (id, assignees, priority = 'TASK_PRIORITY_UNKNOWN') => ({
  id,
  task: { assignees, assignee: assignees[0] ?? '', priority },
});
// КАРТОЧКА №5 — ВЕСЬ СМЫСЛ ФИКСТУРЫ: там «я» (x) стою ВТОРЫМ, а витринное одиночное поле
// показывает y. Без такой карточки старая реализация «мои» (сравнение с одиночным полем) даёт
// на этой доске ТОТ ЖЕ ответ, что новая, и мутация, возвращающая её, зеленеет — сторож у
// мёртвого кода. Она здесь именно для того, чтобы этого не случилось.
const board = [
  card(1, ['x']),
  card(2, ['x', 'y']),
  card(3, ['y']),
  card(4, []),
  card(5, ['y', 'x']),
];

const piles = M.assigneePiles(board);
ck(
  JSON.stringify(piles) === JSON.stringify([{ name: 'x', count: 3 }, { name: 'y', count: 3 }, { name: '', count: 1 }]),
  'Ц4.1 кучки: x·3, y·3 (задача на двоих считается ОБОИМ), «никто» — последним',
  JSON.stringify(piles),
);

const only = (f) => M.applyFilters(board, f, 'x').map((t) => t.id);
ck(JSON.stringify(only({ ...M.emptyFilters, assignee: 'x' })) === '[1,2,5]', 'Ц4.2 лицо x сужает доску до его трёх — включая ту, где он второй', JSON.stringify(only({ ...M.emptyFilters, assignee: 'x' })));
ck(JSON.stringify(only({ ...M.emptyFilters, assignee: 'y' })) === '[2,3,5]', 'Ц4.3 задача на двоих попадает и в кучку y');
ck(JSON.stringify(only({ ...M.emptyFilters, assignee: '' })) === '[4]', 'Ц4.4 кучка «никто не взял» ловит ровно ничью');
ck(JSON.stringify(only(M.emptyFilters)) === '[1,2,3,4,5]', 'Ц4.5 выключенный фильтр (undefined) не сужает ничего');
ck(JSON.stringify(only({ ...M.emptyFilters, mine: true })) === '[1,2,5]', 'Ц4.6 «my tasks» видит меня В СПИСКЕ, а не первым', JSON.stringify(only({ ...M.emptyFilters, mine: true })));
ck(M.filtersActive({ ...M.emptyFilters, assignee: '' }), 'Ц4.7 кучка «никто» считается зажжённым фильтром');
ck(!M.filtersActive(M.emptyFilters), 'Ц4.8 пустые фильтры не считаются зажжёнными');

const litFace = M.setFilter({ ...M.emptyFilters, mine: true }, { assignee: 'y' });
ck(litFace.assignee === 'y' && litFace.mine === false, 'Ц4.9 выбор лица ГАСИТ «my tasks»', JSON.stringify(litFace));
const litMine = M.setFilter({ ...M.emptyFilters, assignee: 'y' }, { mine: true });
ck(litMine.mine === true && litMine.assignee === undefined, 'Ц4.10 «my tasks» ГАСИТ лицо', JSON.stringify(litMine));
const cleared = M.setFilter({ ...M.emptyFilters, mine: true, assignee: 'y' }, { assignee: undefined });
ck(cleared.assignee === undefined && cleared.mine === true, 'Ц4.11 СНЯТИЕ лица (undefined) чужого чипа не трогает', JSON.stringify(cleared));

// ═══ А5 · ЯДРО СЛИЯНИЯ ═══════════════════════════════════════════════════════════════════════
console.log('\nА5 · слияние правки со свежим чтением');

const seen = { title: 'мой заголовок', description: 'МОЁ описание', priority: 'TASK_PRIORITY_LOW', labels: ['a'] };
// Пока страница висела открытой, КТО-ТО ДРУГОЙ переписал описание.
const fresh = { ...seen, description: 'ЧУЖОЕ описание, написанное после того как я открыл страницу' };

const merged = M.mergeInlinePatch(fresh, seen, { priority: 'TASK_PRIORITY_URGENT' });
ck(merged.ok === true, 'Ц5.1 правка НЕтронутого поля проходит');
ck(
  merged.ok && merged.content.description === fresh.description,
  'Ц5.2 ЧУЖОЕ ОПИСАНИЕ ВЫЖИЛО — неправленые поля взяты из свежего чтения',
  merged.ok ? JSON.stringify(merged.content.description) : '—',
);
ck(merged.ok && merged.content.priority === 'TASK_PRIORITY_URGENT', 'Ц5.3 моё поле записалось');

const clash = M.mergeInlinePatch({ ...seen, priority: 'TASK_PRIORITY_HIGH' }, seen, {
  priority: 'TASK_PRIORITY_URGENT',
});
ck(clash.ok === false && clash.field === 'priority', 'Ц5.4 чужая правка ТОГО ЖЕ поля = отказ, а не гонка нажатий', JSON.stringify(clash));

const arrays = M.mergeInlinePatch({ ...seen, labels: ['a'] }, seen, { labels: ['a', 'b'] });
ck(arrays.ok === true, 'Ц5.5 массив, равный по составу, конфликтом не считается (сравнение по JSON)');
const arraysClash = M.mergeInlinePatch({ ...seen, labels: ['zzz'] }, seen, { labels: ['a', 'b'] });
ck(arraysClash.ok === false, 'Ц5.6 массив, РАЗОШЕДШИЙСЯ по составу, конфликтом считается');

console.log(bad ? `\nКРАСНАЯ: провалов ${bad}` : '\nЗЕЛЁНАЯ: все проверки прошли');
process.exit(bad ? 1 : 0);
