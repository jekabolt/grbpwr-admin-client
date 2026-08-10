// Ф6: СЛОВАРЬ ГЕЙТА И ПРАВОПИСАНИЕ СКОУПА — против РУКОПИСНОЙ КОПИИ СЕРВЕРА.
//
// Обе величины ниже переписаны руками из бэкенда, а не импортированы: зонд, собранный из тех же
// констант, что и проверяемый код, доказывал бы только внутреннюю согласованность клиента, а вопрос
// стоит иначе — совпадает ли клиент с ТЕМ, ЧТО РЕАЛЬНО ШЛЁТ И ЧИТАЕТ СЕРВЕР.
//
//   1. Словарь ключей — internal/entity/run_readiness.go (RunReadinessKey*).
//      Провал = сервер прислал ключ, которому клиент не знает вкладки: строка при этом не пропадёт
//      (падает в header), но ссылка «починить» поведёт не туда, и молча.
//   2. Правописание назначения — internal/entity/techcard.go (BomPurpose*), стр. «main», «lining»…
//      Провал ТИХИЙ и потому опаснее: клиент пишет имя proto-энума
//      («TECH_CARD_BOM_PURPOSE_MAIN»), база хранит «main», и PutTechCardPatternSizeIndex с чужим
//      написанием НЕ НАЙДЁТ НИ ОДНОГО ЛИСТА — индекс размеров просто никогда не запишется, а гейт
//      навсегда останется UNKNOWN на sizes_in_dxf. Ошибка выглядит как «фича не работает».
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `run-gate-keys-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'run-gate-keys-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: {
    components: resolve(REPO, 'src/components'), lib: resolve(REPO, 'src/lib'),
    api: resolve(REPO, 'src/api'), utils: resolve(REPO, 'src/utils'),
    ui: resolve(REPO, 'src/ui'), constants: resolve(REPO, 'src/constants'),
  },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const ck = (ok, what, d = '') => { if (!ok) bad++; console.log(`${ok ? '  ok  ' : '  FAIL'} ${what}${d ? `  — ${d}` : ''}`); };

// ── 1. СЛОВАРЬ КЛЮЧЕЙ (рукописная копия internal/entity/run_readiness.go) ──────────────────
const SERVER_KEYS = [
  // карточка
  'card_auxiliary', 'release_frozen', 'card_size_range', 'card_pieces',
  'card_pieces_dxf_matched', 'pattern_binding_resolved',
  // колорвей
  'colorway_live', 'slot_article', 'slot_norm', 'norm_provenance',
  'norm_conditions_recorded', 'norm_seam_allowance', 'norm_flip_policy', 'norm_piece_set',
  'norm_width_vs_article', 'norm_multiple',
  // слои деталей (T4: роль слоя — вывод из строки BOM)
  'piece_role_conflict', 'piece_main_fabric', 'piece_fabric_sorted',
  // прогон
  'sizes_in_range', 'sizes_in_dxf', 'quantities_present', 'stock_shortage',
];

// Вкладки карточки, как их знает tech-card/components/index.tsx (TABS + FOLDED_TABS): 'pieces'
// легален и разворачивается в 'patterns'.
const REAL_TABS = new Set([
  'header', 'sketch', 'moodboard', 'patterns', 'samples', 'bom', 'colorways', 'construction',
  'labels', 'costing', 'production', 'issues', 'signoff', 'history', 'pieces',
]);

console.log('\nA · словарь ключей → вкладка');
// card_auxiliary и quantities_present вкладки не требуют: первый — короткое замыкание (чинить
// нечего), второй чинится ЗДЕСЬ ЖЕ, в сетке модалки, а не на карточке. Оба обязаны при этом
// деградировать в header, а не падать — это и проверяется ниже.
const NEEDS_TAB = SERVER_KEYS.filter((k) => k !== 'card_auxiliary' && k !== 'quantities_present');
for (const k of NEEDS_TAB) {
  ck(!!m.RUN_REQ_TAB[k], `ключ «${k}» знает свою вкладку`, m.RUN_REQ_TAB[k] ?? 'НЕТ ЗАПИСИ');
}
for (const [k, tab] of Object.entries(m.RUN_REQ_TAB)) {
  ck(REAL_TABS.has(tab), `вкладка «${tab}» ключа «${k}» существует в карточке`);
  ck(SERVER_KEYS.includes(k), `ключ «${k}» есть в серверном словаре (нет мёртвых записей)`);
}
ck(m.tabForKey('card_auxiliary') === 'header', 'card_auxiliary деградирует в header, а не падает');
ck(m.tabForKey('quantities_present') === 'header', 'quantities_present деградирует в header');
ck(m.tabForKey('a_key_the_server_will_add_next_phase') === 'header',
  'НЕИЗВЕСТНЫЙ ключ деградирует в header — сервер обещал наращивать словарь');
ck(m.tabForKey(undefined) === 'header', 'ключ без значения деградирует в header');

console.log('\nB · ссылка «починить» собирается из target, а не из ключа');
const href = (key, target) => m.findingHref({ key, target }, 118);
ck(href('slot_article', { techCardId: 118, colorwayId: 42 }) ===
  '/tech-cards/118?tab=colorways&colorway=42',
  'colorway_id становится якорем ТОЛЬКО на вкладке, которая его читает');
ck(href('norm_flip_policy', { techCardId: 118, bomLineKey: 'L7' }) === '/tech-cards/118?tab=bom&bom=L7',
  'bom_line_key становится якорем на вкладке BOM');
ck(href('norm_width_vs_article', { techCardId: 118, colorwayId: 42, bomLineKey: 'L7' }) ===
  '/tech-cards/118?tab=bom&bom=L7',
  'колорвей на вкладке BOM якорем НЕ становится — эта вкладка его не читает');
ck(href('sizes_in_dxf', { techCardId: 118, markerId: 9, sizeId: 3 }) === '/tech-cards/118?tab=patterns',
  'marker_id / size_id в URL не дописываются: якоря под них не существует');
ck(href('what_is_this', { techCardId: 118 }) === '/tech-cards/118?tab=header',
  'неизвестный ключ ведёт на карточку, а не в никуда');
ck(m.findingHref({ key: 'slot_article', target: {} }, 0) === null,
  'без карточки ссылки нет вовсе — лучше отсутствие ссылки, чем ссылка в /tech-cards/0');
// «Не введены количества» правится в сетке ЭТОГО ЖЕ экрана. Ссылка увела бы человека из поля,
// в которое надо нажать, — и увела бы в новое окно, где про количества нет ничего. Отличается от
// неизвестного ключа: там адрес не знают, здесь знают точно, и он текущий.
ck(href('quantities_present', { techCardId: 118, colorwayId: 42 }) === null,
  'quantities_present ссылки НЕ даёт — чинится в сетке этого экрана');
ck(m.tabForKey('quantities_present') === 'header',
  'но вкладка у него всё равно деградирует в header — правило неизвестного ключа не сломано');

console.log('\nC · UNKNOWN — не пройдено и не сломано');
const f = (severity) => ({ key: 'x', severity });
ck(m.isUnchecked(f('PRODUCTION_RUN_READINESS_SEVERITY_UNKNOWN')), 'UNKNOWN — «не проверено»');
ck(!m.isOk(f('PRODUCTION_RUN_READINESS_SEVERITY_UNKNOWN')), 'UNKNOWN НЕ считается пройденным');
ck(!m.isBlocker(f('PRODUCTION_RUN_READINESS_SEVERITY_UNKNOWN')) &&
  !m.isWarning(f('PRODUCTION_RUN_READINESS_SEVERITY_UNKNOWN')),
  'UNKNOWN не блокер и не предупреждение');
ck(m.isUnchecked(f('PRODUCTION_RUN_READINESS_SEVERITY_UNSPECIFIED')),
  'НЕПРОСТАВЛЕННАЯ степень тоже «не проверено», а не «ок»');
ck(m.isUnchecked(f(undefined)), 'отсутствующая степень тоже «не проверено»');
ck(!m.isOk(f('PRODUCTION_RUN_READINESS_SEVERITY_UNSPECIFIED')),
  'UNSPECIFIED не проваливается в OK — иначе непроверенное молча читалось бы как проверенное');

// ── 2. ПРАВОПИСАНИЕ СКОУПА (рукописная копия internal/entity/techcard.go BomPurpose*) ───────
const SERVER_PURPOSE = {
  TECH_CARD_BOM_PURPOSE_MAIN: 'main',
  TECH_CARD_BOM_PURPOSE_LINING: 'lining',
  TECH_CARD_BOM_PURPOSE_POCKETING: 'pocketing',
  TECH_CARD_BOM_PURPOSE_INTERFACING: 'interfacing',
  TECH_CARD_BOM_PURPOSE_INSULATION: 'insulation',
  TECH_CARD_BOM_PURPOSE_CONTRAST: 'contrast',
  TECH_CARD_BOM_PURPOSE_MESH: 'mesh',
  TECH_CARD_BOM_PURPOSE_OTHER: 'other',
};

console.log('\nD · ключ скоупа пишется словом СЕРВЕРА (иначе индекс размеров молча не пишется)');
for (const [enumName, stored] of Object.entries(SERVER_PURPOSE)) {
  ck(m.wireFabricPurpose(enumName) === stored, `${enumName} → «${stored}»`, m.wireFabricPurpose(enumName));
}
ck(m.bomPurposeOrder.length === Object.keys(SERVER_PURPOSE).length,
  'у клиента ровно столько же назначений, сколько у сервера',
  `${m.bomPurposeOrder.length} vs ${Object.keys(SERVER_PURPOSE).length}`);
for (const p of m.bomPurposeOrder) {
  ck(!!SERVER_PURPOSE[p], `клиентское назначение «${p}» известно серверу`);
}
ck(m.wireFabricPurpose('TECH_CARD_BOM_PURPOSE_UNSET') === '',
  'UNSET — не значение: скоупом становится строка BOM');
ck(m.wireFabricPurpose('') === '' && m.wireFabricPurpose(undefined) === '',
  'пустое назначение — не скоуп');

console.log('\nE · скоуп ЛИСТА считается ровно как entity.FabricScopeKey');
ck(m.serverScopeKeyOfSheet({ fabricPurpose: 'TECH_CARD_BOM_PURPOSE_LINING', bomLineKey: 'L7' }) === 'lining',
  'назначение ПОБЕЖДАЕТ строку BOM, даже когда записаны оба');
ck(m.serverScopeKeyOfSheet({ fabricPurpose: 'TECH_CARD_BOM_PURPOSE_UNSET', bomLineKey: 'L7' }) === 'L7',
  'неразобранный лист живёт под своей строкой BOM');
ck(m.serverScopeKeyOfSheet({ bomLineKey: '  L7  ' }) === 'L7', 'ключ строки обрезается по краям');
ck(m.serverScopeKeyOfSheet({}) === '', 'ни к чему не привязанный лист скоупа не имеет');

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\n${bad} ПРОВАЛОВ`);
process.exit(bad === 0 ? 0 : 1);
