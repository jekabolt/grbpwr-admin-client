// UNI: деталь без градации входит во ВСЕ размеры — правила прогоняются на ЖИВОМ коде.
//
// Секции дописываются задачами по порядку (T1 → T2 → T4 → T3 → T5); чужие assert'ы не редактируются:
// упавший старый assert — это регресс, и чинить его надо в коде, а не здесь.
import { build as esbuild } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const outfile = resolve(tmpdir(), `uni-probe-${process.pid}.mjs`);
await esbuild({
  entryPoints: [resolve(HERE, 'pattern-uni-entry.ts')], bundle: true, platform: 'node',
  format: 'esm', target: 'node20', outfile, logLevel: 'warning', absWorkingDir: REPO,
  alias: { components: resolve(REPO,'src/components'), lib: resolve(REPO,'src/lib'), api: resolve(REPO,'src/api'),
           utils: resolve(REPO,'src/utils'), constants: resolve(REPO,'src/constants'), ui: resolve(REPO,'src/ui') },
});
const m = await import(pathToFileURL(outfile).href);

let bad = 0;
const ck = (ok, what, d='') => { if(!ok) bad++; console.log(`${ok?'  ok  ':'  FAIL'} ${what}${d?`  — ${d}`:''}`); };

// ══ T1 · UNI в имени блока = явное «не градуируется» ═══════════════════════════════════════

console.log('\nT1.0 · uniOf: ОТДЕЛЬНЫЙ токен, регистр и оформление сняты, подстрока — не признак');
{
  const uni = ['PCK_L_UNI_M', 'PCK_L_#_UNI_M', 'pck_l_uni_m', 'BP_<UNI>_M', 'UNI', 'UNI_M', 'BP_UNI'];
  for (const n of uni) ck(m.uniOf(n) === true, `«${n}» — uni`);
  // Ловушки: те же три буквы внутри слова. Поиск подстрокой выкинул бы эти детали из ряда молча.
  const notUni = ['UNIFORM_M', 'TUNIC_S', 'UNION_L', 'BP_XS', 'FP_L', 'JUNIOR_M', ''];
  for (const n of notUni) ck(m.uniOf(n) === false, `«${n}» — НЕ uni`);
}

console.log('\nT1.0b · uniBaseOf: съедается только размер, ПРИЛЕГАЮЩИЙ к последнему UNI');
{
  const cases = [
    ['PCK_L_UNI_M', 'PCK_L'],       // базовый размер при токене — съеден
    ['PCK_L_#_UNI_M', 'PCK_L_#'],   // модификатор «#» уцелел
    ['PCK_R_UNI_M', 'PCK_R'],
    ['PCK_R_#_UNI_M', 'PCK_R_#'],
    ['PCK_L_UNI', 'PCK_L'],         // ЛОВУШКА FP_L: «L» здесь модификатор, а не размер
    ['BP_UNI', 'BP'],
    ['UNI', 'UNI'],                 // пустой остаток ⇒ сырое имя (прецедент пустой идентичности)
    ['UNI_M', 'UNI_M'],             // то же: остаток пуст, потому что «M» примыкает к UNI
    ['PCK_UNI_M_X', 'PCK_M_X'],     // размер НЕ последний в имени — не съеден
    ['pck_l_uni_m', 'pck_l'],
    ['BP_<UNI>_M', 'BP'],
  ];
  for (const [name, want] of cases) {
    const got = m.uniBaseOf(name, m.isSizeToken);
    ck(got === want, `uniBase(«${name}») = «${want}»`, got);
  }
  ck(m.uniBaseOf('FP_L', m.isSizeToken) === '', 'у не-uni имени uniBase пуст');
  ck(m.uniBaseOf('BP_XS', m.isSizeToken) === '', 'у градуированного имени uniBase пуст');
}

console.log('\nT1.a0 · СЕГОДНЯШНЕЕ поведение порога (не про UNI): одна основа вердикта не даёт');
{
  // Спека ждала «вердикт ровно для пяти BP» на наборе PCK_*_UNI_M + BP_XS…XL. Это неверно и БЕЗ
  // UNI: `need = max(2, max/2)` требует, чтобы токен встретился не меньше чем у ДВУХ основ, а
  // BP там одна. Доказываем, что пустота исходит из порога, а не из нового пропуска: тот же
  // набор БЕЗ единого uni-имени пуст ровно так же.
  const onlyBp = ['BP_XS', 'BP_S', 'BP_M', 'BP_L', 'BP_XL'];
  const v0 = m.deriveBlockSizes(onlyBp, m.isSizeToken);
  ck(v0.size === 0, 'BP_XS…BP_XL в одиночку — вердикта нет и без всякого UNI', String(v0.size));
  const v1 = m.deriveBlockSizes([...m.PCK_UNI, ...onlyBp], m.isSizeToken);
  ck(v1.size === 0, 'добавление четырёх uni-карманов ничего не изменило', String(v1.size));
}

console.log('\nT1.a · deriveBlockSizes: вердикт получают только градуированные, ни одного PCK');
{
  const names = [...m.PCK_UNI, ...m.GRADED];
  const v = m.deriveBlockSizes(names, m.isSizeToken);
  ck(v.size === 10, 'вердикт ровно у десяти блоков (BP_XS…XL + SL_R_XS…XL)', String(v.size));
  ck(m.GRADED.every((n) => v.has(n)), 'каждое градуированное имя получило хвост');
  ck(m.PCK_UNI.every((n) => !v.has(n)), 'ни один PCK_*_UNI_M вердикта не получил',
     JSON.stringify(m.PCK_UNI.filter((n) => v.has(n))));
  ck(v.get('BP_M') === 'M' && v.get('SL_R_XL') === 'XL', 'хвост записан как в файле');
  // Пропуск uni-имён не должен ронять вердикт соседей: без карманов ответ обязан быть тем же.
  const clean = m.deriveBlockSizes(m.GRADED, m.isSizeToken);
  ck(clean.size === v.size && m.GRADED.every((n) => clean.get(n) === v.get(n)),
     'вердикт соседей БАЙТ В БАЙТ тот же, что без uni-имён в наборе');
}

console.log('\nT1.b · splitPiecesBySize: PCK → сырая идентичность, size \'\', uni, uniBase');
{
  const names = [...m.PCK_UNI, ...m.GRADED];
  const split = m.splitPiecesBySize(m.piecesOf(names), m.DICT);
  const codeOf = (name) => {
    const id = names.indexOf(name) + 1;
    return split.codeById.get(id);
  };
  const want = {
    'PCK_L_UNI_M': 'PCK_L',
    'PCK_L_#_UNI_M': 'PCK_L_#',
    'PCK_R_UNI_M': 'PCK_R',
    'PCK_R_#_UNI_M': 'PCK_R_#',
  };
  for (const [name, uniBase] of Object.entries(want)) {
    const c = codeOf(name);
    ck(c?.identity === name, `identity «${name}» — сырое имя ЦЕЛИКОМ (алиасы лежат под ним)`, c?.identity);
    ck(c?.size === '', `size «${name}» пуст`, JSON.stringify(c?.size));
    ck(c?.uni === true, `uni «${name}» = true`);
    ck(c?.uniBase === uniBase, `uniBase «${name}» = «${uniBase}»`, c?.uniBase);
  }
  // Группа '' — ровно четыре кармана и ничего кроме.
  const empty = split.groups.find((g) => g.size === '');
  ck(empty?.pieces.length === 4, 'группа \'\' — четыре детали', String(empty?.pieces.length));
  ck((empty?.pieces ?? []).every((p) => m.PCK_UNI.includes(p.blockName)),
     'в группе \'\' только карманы');
  ck(split.groups[split.groups.length - 1].size === '', 'группа \'\' идёт последней (порядок не поехал)');
  // Градуированные — по размерам, как раньше: пять групп по две детали (BP + SL_R).
  const sized = split.groups.filter((g) => g.size !== '');
  ck(sized.length === 5, 'пять размерных групп', JSON.stringify(sized.map((g) => g.size)));
  ck(sized.every((g) => g.pieces.length === 2), 'в каждой размерной группе по две детали',
     JSON.stringify(sized.map((g) => g.pieces.length)));
  ck(JSON.stringify(sized.map((g) => g.size)) === '["XS","S","M","L","XL"]',
     'порядок размеров — по площади, как раньше', JSON.stringify(sized.map((g) => g.size)));
  ck(codeOf('BP_M')?.uni === false && codeOf('BP_M')?.uniBase === '',
     'у градуированной детали uni=false, uniBase пуст');
  ck(codeOf('BP_M')?.identity === 'BP' && codeOf('BP_M')?.size === 'M',
     'разбор градуированного имени не изменился');
  // Индекс размеров uni-блоков не знает — они в него и не попадают (принято планом).
  ck(!split.sizeTokenSet.has('uni'), 'токен uni в sizeTokenSet не просочился');
  ck(!split.identityByBlock.has('pck_l_uni_m'), 'uni-блок не свёрнут в identityByBlock');
}

console.log('\nT1.c · КОНТРОЛЬ: UNIFORM — не uni, градуируется как обычно');
{
  const names = ['UNIFORM_M', 'UNIFORM_S', ...m.GRADED];
  const split = m.splitPiecesBySize(m.piecesOf(names), m.DICT);
  const um = split.codeById.get(1);
  const us = split.codeById.get(2);
  ck(um?.uni === false && us?.uni === false, 'UNIFORM_M/UNIFORM_S — uni:false');
  ck(um?.identity === 'UNIFORM' && um?.size === 'M', 'UNIFORM_M → деталь UNIFORM, размер M',
     JSON.stringify(um));
  ck(us?.identity === 'UNIFORM' && us?.size === 'S', 'UNIFORM_S → деталь UNIFORM, размер S');
  ck((split.groups.find((g) => g.size === '')?.pieces.length ?? 0) === 0,
     'безразмерной группы нет вовсе');
}

console.log('\nT1.d · СКЛЕЕННЫЙ CLO: PCK_L_UNI_M + PCK_L_UNI_S — обе безразмерны, uniBase общий');
{
  // До Т1 этот вход был СЛУЧАЙНО градуирован (основа PCK_L_UNI, два хвоста) — по одному карману
  // на размер. Теперь обе копии безразмерны и опознаются как одна деталь (дедуп — T2).
  const names = ['PCK_L_UNI_M', 'PCK_L_UNI_S', ...m.GRADED];
  const split = m.splitPiecesBySize(m.piecesOf(names), m.DICT);
  const a = split.codeById.get(1);
  const b = split.codeById.get(2);
  ck(a?.size === '' && b?.size === '', 'обе копии безразмерны');
  ck(a?.uni === true && b?.uni === true, 'обе несут uni');
  ck(a?.uniBase === 'PCK_L' && b?.uniBase === 'PCK_L', 'uniBase у обеих ОДИН', `${a?.uniBase} / ${b?.uniBase}`);
  ck(a?.identity === 'PCK_L_UNI_M' && b?.identity === 'PCK_L_UNI_S',
     'идентичности РАЗНЫЕ (сырые имена) — алиасы не переезжают');
}

console.log('\nT1.e · ЛОВУШКА FP_L: левая полочка при живом ряду XS…XL остаётся целой');
{
  const names = ['FP_L', ...m.GRADED, ...m.PCK_UNI];
  const split = m.splitPiecesBySize(m.piecesOf(names), m.DICT);
  const c = split.codeById.get(1);
  ck(c?.identity === 'FP_L', 'identity «FP_L» — целиком', c?.identity);
  ck(c?.size === '', 'размер не отрезан');
  ck(c?.uni === false && c?.uniBase === '', 'FP_L не uni и uniBase пуст');
}

// ══ T2 · дедуп uni-дублей в подборе деталей настила ════════════════════════════════════════

// Один вход настила: разбор + тираж + отбор — тем же кодом и в том же порядке, что в модалке
// раскладки и в очереди раскроя партии.
const layPieces = (pieces, rows, contourLayer = '1') => {
  const split = m.splitPiecesBySize(pieces, m.DICT);
  const dedupe = m.dedupeUniPieces(pieces, split.codeById, contourLayer);
  const units = m.markerUnits({ graded: true, rows, ungradedUnits: 1 });
  const unitsOfPiece = m.unitsOfPieces(pieces, (id) => split.codeById.get(id)?.size ?? '', units);
  const plain = m.selectMarkerPieces(pieces, contourLayer, unitsOfPiece);
  return { split, dedupe, units, unitsOfPiece, plain,
           selected: plain.filter((p) => !dedupe.excludedIds.has(p.id)) };
};
const ROWS_2 = [{ tokens: ['M'], qty: 2 }, { tokens: ['L'], qty: 1 }];

console.log('\nT2.a · склейка CLO: две копии одного кармана кроятся ОДИН раз');
{
  const names = ['PCK_L_UNI_M', 'PCK_L_UNI_S', ...m.GRADED];
  // Площади РАВНЫ: это одна деталь, выгруженная дважды (areaFor по хвосту дал бы разные).
  const pieces = names.map((n, i) => m.piece(i + 1, n, i < 2 ? { areaCm2: 200 } : {}));
  const r = layPieces(pieces, ROWS_2);
  ck(r.dedupe.conflicts.length === 0, 'конфликта нет — копии совпадают',
     JSON.stringify(r.dedupe.conflicts));
  ck(r.dedupe.excludedIds.size === 1, 'исключена ровно одна копия', String(r.dedupe.excludedIds.size));
  const pck = r.selected.filter((p) => p.blockName.startsWith('PCK'));
  ck(pck.length === 1, 'в выборке остался ОДИН карман (до дедупа было бы два)',
     JSON.stringify(r.plain.filter((p) => p.blockName.startsWith('PCK')).map((p) => p.blockName)));
  ck(pck[0]?.blockName === 'PCK_L_UNI_M',
     'победил лексикографически наименьший (детерминизм против порядка файлов)', pck[0]?.blockName);
  ck(r.units.unitsTotal === 3, 'тираж настила — 3 изделия', String(r.units.unitsTotal));
  ck(r.unitsOfPiece.get(pck[0].id) === r.units.unitsTotal,
     'карман кроится на КАЖДОЕ изделие состава (unitsTotal), а не на размер',
     String(r.unitsOfPiece.get(pck[0].id)));
  // Проигравший исключён ЦЕЛИКОМ — иначе счётчики на экране двоятся.
  ck(r.selected.every((p) => p.blockName !== 'PCK_L_UNI_S'), 'проигравшая копия не поехала в настил');
}

console.log('\nT2.b · те же копии, нарисованные по-разному (+1 %) — ОТКАЗ, а не выбор');
{
  const names = ['PCK_L_UNI_M', 'PCK_L_UNI_S', ...m.GRADED];
  const pieces = names.map((n, i) =>
    m.piece(i + 1, n, i === 0 ? { areaCm2: 200 } : i === 1 ? { areaCm2: 202 } : {}));
  const r = layPieces(pieces, ROWS_2);
  ck(r.dedupe.conflicts.length === 1, 'ровно один конфликт', JSON.stringify(r.dedupe.conflicts));
  ck(r.dedupe.conflicts[0]?.kind === 'area', 'kind = area', r.dedupe.conflicts[0]?.kind);
  ck(r.dedupe.conflicts[0]?.subject === 'PCK_L', 'конфликт назван по uniBase', r.dedupe.conflicts[0]?.subject);
  ck(JSON.stringify(r.dedupe.conflicts[0]?.blocks) === '["PCK_L_UNI_M","PCK_L_UNI_S"]',
     'отказ называет ОБА блока', JSON.stringify(r.dedupe.conflicts[0]?.blocks));
  ck(r.dedupe.excludedIds.size === 0, 'при конфликте не исключается ничего (путь целиком закрыт)');
  ck(m.uniConflictReason(r.dedupe.conflicts).includes('PCK_L_UNI_S'), 'текст отказа несёт имена блоков');
  // Дребезг тесселяции конфликтом не является: 0.4 % внутри допуска pickOnLayer.
  const near = names.map((n, i) =>
    m.piece(i + 1, n, i === 0 ? { areaCm2: 200 } : i === 1 ? { areaCm2: 200.8 } : {}));
  const rn = layPieces(near, ROWS_2);
  ck(rn.dedupe.conflicts.length === 0 && rn.dedupe.excludedIds.size === 1,
     '0.4 % — дребезг, а не редакция: дедуп проходит', JSON.stringify(rn.dedupe.conflicts));
}

console.log('\nT2.c · градуированная копия рядом с uni — ОТКАЗ (решение владельца)');
{
  const graded = ['PCK_L_XS', 'PCK_L_S', 'PCK_L_M', 'PCK_L_L', 'PCK_L_XL'];
  const names = [...graded, 'PCK_L_UNI_M', ...m.GRADED];
  const r = layPieces(m.piecesOf(names), ROWS_2);
  ck(r.dedupe.conflicts.length === 1, 'ровно один конфликт', JSON.stringify(r.dedupe.conflicts));
  ck(r.dedupe.conflicts[0]?.kind === 'graded-vs-uni', 'kind = graded-vs-uni', r.dedupe.conflicts[0]?.kind);
  ck(r.dedupe.conflicts[0]?.subject === 'PCK_L', 'конфликт назван деталью PCK_L');
  ck(JSON.stringify(r.dedupe.conflicts[0]?.blocks) === '["PCK_L_UNI_M"]',
     'назван uni-блок, спорящий с рядом', JSON.stringify(r.dedupe.conflicts[0]?.blocks));
  // Одной uni-копии достаточно: проверка не ждёт второй.
  ck(r.dedupe.excludedIds.size === 0, 'ничего не исключено — отказ гасит путь целиком');
}

console.log('\nT2.d · скоуп БЕЗ uni-деталей — no-op, выборка поэлементно прежняя');
{
  const r = layPieces(m.piecesOf(m.GRADED), ROWS_2);
  ck(r.dedupe.excludedIds.size === 0, 'excludedIds пуст');
  ck(r.dedupe.conflicts.length === 0, 'конфликтов нет');
  ck(r.selected.length === r.plain.length && r.selected.every((p, i) => p === r.plain[i]),
     'выборка — ТЕ ЖЕ объекты в том же порядке', `${r.selected.length} / ${r.plain.length}`);
}

console.log('\nT2.e · края: одно имя из двух файлов, пустой остаток, слои проигравшего');
{
  // Одно и то же имя блока в двух листах — это НЕ дубль uni, а две ревизии одного листа: их
  // разбирает выбор контура на слое, а не дедуп. Исключить одну из них здесь значило бы решать
  // чужую задачу молча.
  const twoFiles = [
    m.piece(1, 'PCK_L_UNI_M', { areaCm2: 200, fileIndex: 0 }),
    m.piece(2, 'PCK_L_UNI_M', { areaCm2: 200, fileIndex: 1 }),
    ...m.piecesOf(m.GRADED).map((p) => m.piece(p.id + 10, p.blockName)),
  ];
  const rt = layPieces(twoFiles, ROWS_2);
  ck(rt.dedupe.excludedIds.size === 0, 'одно имя из двух файлов — дедупа нет',
     String(rt.dedupe.excludedIds.size));
  ck(rt.dedupe.conflicts.length === 0, 'и конфликта нет');

  // Пустой остаток (uniBase === raw): группа состоит из самой себя.
  const bare = [m.piece(1, 'UNI', { areaCm2: 50 }), m.piece(2, 'UNI_M', { areaCm2: 60 }),
                ...m.piecesOf(m.GRADED).map((p) => m.piece(p.id + 10, p.blockName))];
  const rb = layPieces(bare, ROWS_2);
  ck(rb.dedupe.excludedIds.size === 0 && rb.dedupe.conflicts.length === 0,
     'UNI и UNI_M — разные группы из самих себя, дедупа нет');

  // Ни у одной копии нет контура на рабочем слое: исключать нечего, спорить не о чем.
  const offLayer = [m.piece(1, 'PCK_L_UNI_M', { areaCm2: 200, layer: '14' }),
                    m.piece(2, 'PCK_L_UNI_S', { areaCm2: 900, layer: '14' }),
                    ...m.piecesOf(m.GRADED).map((p) => m.piece(p.id + 10, p.blockName))];
  const ro = layPieces(offLayer, ROWS_2);
  ck(ro.dedupe.excludedIds.size === 0 && ro.dedupe.conflicts.length === 0,
     'копии лежат не на рабочем слое — ни дедупа, ни конфликта');

  // Проигравший исключается ВСЕМИ слоями: иначе он всплывёт в списке деталей и в счётчиках.
  const layers = [m.piece(1, 'PCK_L_UNI_M', { areaCm2: 200, layer: '1' }),
                  m.piece(2, 'PCK_L_UNI_S', { areaCm2: 200, layer: '1' }),
                  m.piece(3, 'PCK_L_UNI_S', { areaCm2: 190, layer: '14' }),
                  ...m.piecesOf(m.GRADED).map((p) => m.piece(p.id + 10, p.blockName))];
  const rl = layPieces(layers, ROWS_2);
  ck(rl.dedupe.excludedIds.has(2) && rl.dedupe.excludedIds.has(3),
     'исключены ОБА контура проигравшего блока — и на слое 1, и на слое 14',
     JSON.stringify([...rl.dedupe.excludedIds]));
  ck(!rl.dedupe.excludedIds.has(1), 'победитель на месте');
}

// ══ T4 · три состояния детали, снятие ЛОЖНЫХ отказов нормы ═════════════════════════════════

// DxfIndex собирается ТЕМ ЖЕ правилом, что useDxfIndex: ключ `{скоуп}|{идентичность}` → размер →
// контуры. Хук здесь не зовём (он на хуках React), но правило переписано, а не позаимствовано, —
// иначе пробник проверял бы сам себя.
const SCOPE = 'S';
const indexOf = (pieces) => {
  const split = m.splitPiecesBySize(pieces, m.DICT);
  const byKey = new Map();
  for (const p of pieces) {
    const code = split.codeById.get(p.id);
    const identity = m.normBlock(code?.identity ?? p.blockName ?? '');
    if (!identity) continue;
    const key = `${SCOPE}|${identity.toLowerCase()}`;
    const bySize = byKey.get(key) ?? new Map();
    const size = code?.size ?? '';
    bySize.set(size, [...(bySize.get(size) ?? []), p]);
    byKey.set(key, bySize);
  }
  return { split, byKey, contourLayer: '1', grainLayer: '', filesOfScope: new Map() };
};
const SIZE_IDS = [1, 2, 3, 4, 5];
const TOKENS = { 1: ['xs'], 2: ['s'], 3: ['m'], 4: ['l'], 5: ['xl'] };
const normFor = (pieces, cardPieces) =>
  m.dxfNormAreas({
    index: indexOf(pieces), pieces: cardPieces, unaliasedPieces: [], sizeIds: SIZE_IDS,
    tokensOfSize: (id) => TOKENS[id] ?? [], contourLayer: '1', allowanceCm: 0,
  });
const cardPiece = (name, block, over = {}) =>
  ({ name, lineKey: name.toLowerCase(), perGarment: 1, refs: [{ scopeKey: SCOPE, block }], ...over });

// Дословный текст прежнего отказа — переписан сюда РУКАМИ, а не считан из модуля: иначе правка
// формулировки прошла бы мимо проверки «отказ остался прежним».
const OLD_REFUSAL =
  'в выкройках этой ткани ни одна деталь не градуируется по размерам — площадь каждого размера ' +
  'вышла бы одинаковой, и это была бы не норма размера, а копия соседней. Похоже, выгружен только один размер';

console.log('\nT4.1 · скоуп из одних UNI-деталей получает норму: одно ЧЕСТНОЕ число всем размерам');
{
  const pieces = m.PCK_UNI.map((n, i) => m.piece(i + 1, n, { areaCm2: 100 + i }));
  const card = m.PCK_UNI.map((n) => cardPiece(n, n));
  const out = normFor(pieces, card);
  ck(out.ok === true, 'ok: true (прежде здесь стоял отказ «выгружен только один размер»)',
     out.ok ? '' : out.reason);
  if (out.ok) {
    ck(out.areas.rows.length === 5, 'норма выдана ВСЕМ пяти размерам', String(out.areas.rows.length));
    const areas = new Set(out.areas.rows.map((r) => r.areaCm2));
    ck(areas.size === 1, 'площадь у всех размеров ОДНА (деталь одна на весь ряд)',
       JSON.stringify([...areas]));
    ck(out.areas.rows[0].areaCm2 === 100 + 101 + 102 + 103, 'площадь = сумма четырёх карманов',
       String(out.areas.rows[0].areaCm2));
    ck(out.areas.gradedPieces === 0, 'градуированных деталей ноль — и это законно');
    ck(out.areas.pieceRows.length === 4, 'пер-детальных строк четыре, по одной на деталь',
       String(out.areas.pieceRows.length));
    ck(out.areas.pieceRows.every((r) => r.sizeId === 0),
       'все строки идут с sizeId 0 — сервер запрещает пер-размерные строки у ungraded',
       JSON.stringify(out.areas.pieceRows.map((r) => r.sizeId)));
  }
}

console.log('\nT4.2 · те же детали БЕЗ токена, но с галкой на карточке — тоже норма');
{
  const names = ['PCK_L', 'PCK_L_#', 'PCK_R', 'PCK_R_#'];
  const pieces = names.map((n, i) => m.piece(i + 1, n, { areaCm2: 100 + i }));
  const withFlag = names.map((n) => cardPiece(n, n, { ungraded: true }));
  const out = normFor(pieces, withFlag);
  ck(out.ok === true, 'галка — равноправное заявление, отказа нет', out.ok ? '' : out.reason);
  ck(out.ok && out.areas.rows.length === 5, 'норма у всех пяти размеров');
  // Та же геометрия БЕЗ галки — отказ обязан вернуться дословно.
  const bare = normFor(pieces, names.map((n) => cardPiece(n, n)));
  ck(bare.ok === false, 'без галки и без токена — отказ');
  ck(!bare.ok && bare.reason === OLD_REFUSAL, 'текст отказа ДОСЛОВНО прежний', !bare.ok ? bare.reason : '');
}

console.log('\nT4.3 · unclassified-sizeless: отказ остаётся, и одной необъявленной детали хватает');
{
  const names = ['POCKET'];
  const out = normFor(m.piecesOf(names, { areaCm2: 100 }), [cardPiece('POCKET', 'POCKET')]);
  ck(out.ok === false, 'деталь без токена и без галки — отказ');
  ck(!out.ok && out.reason === OLD_REFUSAL, 'текст ДОСЛОВНО прежний', !out.ok ? out.reason : '');
  // СМЕШАННЫЙ скоуп: три uni-детали + одна необъявленная. Условие полное намеренно — именно у
  // необъявленной детали, возможно, и не выгрузили остальные размеры.
  const mixNames = [...m.PCK_UNI.slice(0, 3), 'POCKET'];
  const mix = normFor(
    mixNames.map((n, i) => m.piece(i + 1, n, { areaCm2: 100 })),
    mixNames.map((n) => cardPiece(n, n)),
  );
  ck(mix.ok === false, 'одна unclassified деталь среди объявленных — отказ остаётся');
  ck(!mix.ok && mix.reason === OLD_REFUSAL, 'и снова тот же текст');
  // Один размер в ряду — случай другой, и он отказом не был никогда.
  const single = m.dxfNormAreas({
    index: indexOf(m.piecesOf(['POCKET'], { areaCm2: 100 })), pieces: [cardPiece('POCKET', 'POCKET')],
    unaliasedPieces: [], sizeIds: [3], tokensOfSize: (id) => TOKENS[id] ?? [],
    contourLayer: '1', allowanceCm: 0,
  });
  ck(single.ok === true, 'ряд из одного размера норму получает, как и раньше',
     single.ok ? '' : single.reason);
}

console.log('\nT4.4 · РЕГРЕССИЯ: градуированный скоуп считается ровно как раньше');
{
  const names = ['BP_XS', 'BP_S', 'BP_M', 'BP_L', 'BP_XL', 'SL_R_XS', 'SL_R_S', 'SL_R_M', 'SL_R_L', 'SL_R_XL'];
  const pieces = m.piecesOf(names);
  const out = normFor(pieces, [cardPiece('спинка', 'BP'), cardPiece('рукав', 'SL_R')]);
  ck(out.ok === true, 'норма выдана', out.ok ? '' : out.reason);
  ck(out.ok && out.areas.gradedPieces === 2, 'обе детали градуируются',
     out.ok ? String(out.areas.gradedPieces) : '');
  // Площадь размера = сумма двух контуров этого размера (areaFor: xs 100, s 110, m 120, l 130, xl 140).
  ck(out.ok && out.areas.rows.every((r) => r.areaCm2 === 2 * (90 + 10 * SIZE_IDS.indexOf(r.sizeId) + 10)),
     'площади по размерам растут, как в файле',
     out.ok ? JSON.stringify(out.areas.rows) : '');
  ck(out.ok && out.areas.pieceRows.every((r) => r.sizeId > 0),
     'у градуированной детали строки идут ПО РАЗМЕРАМ, а не с нулём');
}

console.log('\nT4.5 · sizeAreasFromParsed: доказательство берётся из БЛОБА, а не из галки');
{
  const uniNames = ['PCK_L_UNI_M', 'PCK_R_UNI_M'];
  const parsed = uniNames.map((n, i) => m.piece(i + 1, n, { areaCm2: 100 + i }));
  const marker = (names) => ({
    summary: { id: 1, seamAllowanceMm: { value: '0' }, contourLayer: '1', grainLayer: '' },
    layout: { schemaVersion: 4, pieces: names.map((n, i) => ({ pieceId: i + 1, name: n, blockName: n, quantity: 1, areaCm2: 100 + i })), placements: [] },
  });
  const uni = m.sizeAreasFromParsed({
    marker: marker(uniNames), parsed, sizeIds: SIZE_IDS,
    tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken: m.isSizeToken,
  });
  ck(uni.ok === true, 'блоб из одних UNI-блоков продолжается на весь ряд', uni.ok ? '' : uni.reason);
  if (uni.ok) {
    ck(uni.areas.areaBySize.size === 5, 'a_s есть у всех пяти размеров', String(uni.areas.areaBySize.size));
    ck(new Set([...uni.areas.areaBySize.values()]).size === 1, 'и оно у всех одно');
    ck(uni.areas.agnosticCm2 === 201, 'общая часть = сумма неградуируемых', String(uni.areas.agnosticCm2));
  }
  // Старый блоб без токена — отказ ДОСЛОВНО прежний: блоб галку не хранит и доказательством её не
  // сделать никакими правками карточки.
  const OLD_MARKER_REFUSAL =
    'в раскладке ни одна деталь не градуируется по размерам — площадь любого размера получилась ' +
    'бы одинаковой, и это была бы не норма размера, а копия соседней';
  const plain = m.sizeAreasFromParsed({
    marker: marker(['POCKET_L', 'POCKET_R']),
    parsed: m.piecesOf(['POCKET_L', 'POCKET_R'], { areaCm2: 100 }),
    sizeIds: SIZE_IDS, tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken: m.isSizeToken,
  });
  ck(plain.ok === false, 'блоб без токенов — отказ');
  ck(!plain.ok && plain.reason === OLD_MARKER_REFUSAL, 'текст отказа прежний', !plain.ok ? plain.reason : '');
  // Смешанный блоб: один блок с токеном, другой без — доказательства нет.
  const half = m.sizeAreasFromParsed({
    marker: marker(['PCK_L_UNI_M', 'POCKET_R']),
    parsed: m.piecesOf(['PCK_L_UNI_M', 'POCKET_R'], { areaCm2: 100 }),
    sizeIds: SIZE_IDS, tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken: m.isSizeToken,
  });
  ck(half.ok === false && half.reason === OLD_MARKER_REFUSAL,
     'один блок с токеном не объявляет весь блоб', half.ok ? 'ok' : half.reason);
}

// ══ T3 · галка «не градуируется» на детали кроя ════════════════════════════════════════════

// Круглый рейс поля: чтение карточки → форма → сохраняющий маппер. Вход маппера чтения — ровно
// тот кусок ответа сервера, который нас касается; остальное он заполняет умолчаниями сам.
const readForm = (pieces) => m.mapTechCardToForm({ techCard: { pieces } });
const wirePieces = (form) => m.mapFormToTechCardInsert(form).pieces ?? [];

console.log('\nT3.a · круглый рейс: прочитанная пометка уезжает обратно пометкой');
{
  const form = readForm([{ lineKey: 'A', name: 'карман', ungraded: true }]);
  ck(form.pieces?.[0]?.ungraded === true, 'форма прочитала true', String(form.pieces?.[0]?.ungraded));
  const wire = wirePieces(form);
  ck(wire[0]?.ungraded === true, 'сейв-маппер шлёт true', String(wire[0]?.ungraded));
}

console.log('\nT3.b · снятая галка уезжает ЯВНЫМ false, а не молчанием');
{
  const form = readForm([{ lineKey: 'A', name: 'карман', ungraded: true }]);
  form.pieces[0].ungraded = false; // оператор снял галку
  const wire = wirePieces(form);
  // Ключ ОБЯЗАН присутствовать: отсутствие поля сервер читает как «оставь хранимое», и снятие
  // галки стало бы невозможным — контрол пуст, а карточка после перезагрузки снова помечена.
  ck('ungraded' in (wire[0] ?? {}), 'поле присутствует на проводе', JSON.stringify(wire[0]?.ungraded));
  ck(wire[0]?.ungraded === false, 'и оно именно false', String(wire[0]?.ungraded));
}

console.log('\nT3.c · карточка, сохранённая до 0302: поля нет — читается как «не помечена»');
{
  const form = readForm([{ lineKey: 'A', name: 'карман' }]);
  ck(form.pieces?.[0]?.ungraded === false, 'форма показывает false', String(form.pieces?.[0]?.ungraded));
  ck(wirePieces(form)[0]?.ungraded === false, 'на провод уезжает явный false');
}

console.log('\nT3.d · строка с одной только галкой — содержимое, а не пустышка');
{
  ck(m.isBlankPiece({ ungraded: true }) === false, 'isBlankPiece({ungraded:true}) = false');
  ck(m.isBlankPiece({}) === true, 'пустая строка по-прежнему пустая');
  // И она обязана пережить сохранение: сейв-маппер выбрасывает ровно пустые строки.
  const form = readForm([{ lineKey: 'A', ungraded: true }]);
  ck(wirePieces(form).length === 1, 'строка не выброшена на сохранении',
     String(wirePieces(form).length));
}

// ══ T5 · копирайт: uni — это не «размер не опознан» ════════════════════════════════════════

console.log('\nT5.f · склейка размеров молчит про UNI-файл и ругается на безымянный');
{
  // Два файла: карманы UNI и градуированный ряд. Про первый «в именах блоков не опознан размер»
  // — неправда: размера там нет ПО ЗАЯВЛЕНИЮ автора, а не по недосмотру.
  const uniFile = ['PCK_L_UNI_M', 'PCK_R_UNI_M'].map((n, i) =>
    m.piece(i + 1, n, { fileIndex: 0, originX: 0, originY: 0 }));
  const gradedFile = m.GRADED.map((n, i) =>
    m.piece(i + 10, n, { fileIndex: 1, originX: 0, originY: 0 }));
  const plan = m.planSizeMerge([...uniFile, ...gradedFile], ['pockets.dxf', 'main.dxf'], m.DICT, 'mm');
  ck(!plan.warnings.some((w) => w.startsWith('pockets.dxf: в именах блоков')),
     'про UNI-файл предупреждения нет', JSON.stringify(plan.warnings));

  // Тот же файл без токена — предупреждение осталось дословно: там размер действительно не опознан.
  const plainFile = ['POCKET_L', 'POCKET_R'].map((n, i) =>
    m.piece(i + 1, n, { fileIndex: 0, originX: 0, originY: 0 }));
  const plain = m.planSizeMerge([...plainFile, ...gradedFile], ['pockets.dxf', 'main.dxf'], m.DICT, 'mm');
  ck(plain.warnings.includes('pockets.dxf: в именах блоков не опознан размер'),
     'без токена предупреждение прежнее', JSON.stringify(plain.warnings));

  // Смешанный файл (один блок с токеном, другой без) — предупреждение ОСТАЁТСЯ: не опознан
  // именно не-uni блок, и молчать о нём нельзя.
  const mixedFile = ['PCK_L_UNI_M', 'POCKET_R'].map((n, i) =>
    m.piece(i + 1, n, { fileIndex: 0, originX: 0, originY: 0 }));
  const mixed = m.planSizeMerge([...mixedFile, ...gradedFile], ['pockets.dxf', 'main.dxf'], m.DICT, 'mm');
  ck(mixed.warnings.includes('pockets.dxf: в именах блоков не опознан размер'),
     'смешанный файл предупреждает по-прежнему', JSON.stringify(mixed.warnings));
}

// ══ R · находки ревью объединённого диффа: ×2 в числах ткани ═══════════════════════════════
//
// Каждая — «настил кроит одну деталь, а число рядом говорит про две». Ни одна из них не видна на
// экране: длина есть, детали на месте, счётчики сходятся.

console.log('\nR2 · НОРМА: две детали кроя на одну uni-деталь — отказ, а не двойная площадь');
{
  const names = ['PCK_L_UNI_M', 'PCK_L_UNI_S', ...m.GRADED];
  const pieces = names.map((n, i) => m.piece(i + 1, n, i < 2 ? { areaCm2: 200 } : {}));
  // ЧТО СЧИТАЕТСЯ ПРАВДОЙ: карман один, и площадь XS = карман + BP_XS + SL_R_XS = 200+100+100.
  const one = normFor(pieces, [
    cardPiece('карман', 'PCK_L_UNI_M'), cardPiece('спинка', 'BP'), cardPiece('рукав', 'SL_R'),
  ]);
  ck(one.ok === true, 'одна деталь кроя на карман — норма считается', one.ok ? '' : one.reason);
  ck(one.ok && one.areas.rows.find((r) => r.sizeId === 1)?.areaCm2 === 400,
     'площадь XS = 400 см² — именно это число и удваивалось',
     one.ok ? JSON.stringify(one.areas.rows[0]) : '');
  // Диалог сопоставления в CREATE-потоке заводит деталь НА КАЖДЫЙ блок — вот их две.
  const two = normFor(pieces, [
    cardPiece('карман M', 'PCK_L_UNI_M'), cardPiece('карман S', 'PCK_L_UNI_S'),
    cardPiece('спинка', 'BP'), cardPiece('рукав', 'SL_R'),
  ]);
  ck(two.ok === false, 'две детали кроя на один uniBase — ОТКАЗ', two.ok ? 'ok!' : '');
  ck(!two.ok && two.reason.includes('PCK_L_UNI_M') && two.reason.includes('PCK_L_UNI_S'),
     'отказ называет ОБА блока', !two.ok ? two.reason : '');
  ck(!two.ok && two.reason.includes('вдвое'), 'и говорит, чем это кончится');
  // Настил на ТОМ ЖЕ входе дедупит (кроит одну копию) — расхождение бумаги и настила закрыто с
  // обеих сторон, и закрыто ОДНИМ правилом с разными ответами.
  const lay = layPieces(pieces, ROWS_2);
  ck(lay.dedupe.conflicts.length === 0 && lay.dedupe.excludedIds.size === 1,
     'настил на том же файле по-прежнему дедупит, а не отказывает',
     JSON.stringify(lay.dedupe.conflicts));
}

console.log('\nR2b · НОРМА: размерный ряд и UNI на одну основу — отказ');
{
  const gradedPck = ['PCK_L_XS', 'PCK_L_S', 'PCK_L_M', 'PCK_L_L', 'PCK_L_XL'];
  const names = [...gradedPck, 'PCK_L_UNI_M', ...m.GRADED];
  const out = normFor(m.piecesOf(names), [
    cardPiece('карман ряд', 'PCK_L'), cardPiece('карман uni', 'PCK_L_UNI_M'),
    cardPiece('спинка', 'BP'), cardPiece('рукав', 'SL_R'),
  ]);
  ck(out.ok === false, 'градуированная деталь рядом с uni — ОТКАЗ', out.ok ? 'ok!' : '');
  ck(!out.ok && out.reason.includes('противоречат друг другу'),
     'теми же словами, что на пути настила', !out.ok ? out.reason : '');
  ck(!out.ok && out.reason.includes('PCK_L_UNI_M'), 'с именем спорящего блока');
}

console.log('\nR2c · РЕГРЕССИЯ: разные uniBase не сталкиваются, лишний блок в файле не мешает');
{
  // Четыре кармана настоящего файла: uniBase у всех РАЗНЫЕ, и отказывать не в чем.
  const pieces = m.PCK_UNI.map((n, i) => m.piece(i + 1, n, { areaCm2: 100 + i }));
  const out = normFor(pieces, m.PCK_UNI.map((n) => cardPiece(n, n)));
  ck(out.ok === true, 'четыре разных uniBase — норма как была', out.ok ? '' : out.reason);
  // Вторая копия ЛЕЖИТ В ФАЙЛЕ, но деталью кроя не объявлена: в сумму она не входит, и спорить
  // ей не с чем. Проверяем популяцию правила, а не только само правило.
  const withSpare = ['PCK_L_UNI_M', 'PCK_L_UNI_S', ...m.GRADED]
    .map((n, i) => m.piece(i + 1, n, i < 2 ? { areaCm2: 200 } : {}));
  const spare = normFor(withSpare, [
    cardPiece('карман', 'PCK_L_UNI_M'), cardPiece('спинка', 'BP'), cardPiece('рукав', 'SL_R'),
  ]);
  ck(spare.ok === true, 'непривязанная копия в норму не входит и отказа не даёт',
     spare.ok ? '' : spare.reason);
}

console.log('\nR1 · БЛОБ: продолжение старой склеенной раскладки отказывает, а не удваивает');
{
  const markerOf = (names, areaCm2 = 200) => ({
    summary: { id: 1, seamAllowanceMm: { value: '0' }, contourLayer: '1', grainLayer: '' },
    layout: {
      schemaVersion: 4,
      pieces: names.map((n, i) => ({ pieceId: i + 1, name: n, blockName: n, quantity: 1, areaCm2 })),
      placements: [],
    },
  });
  const ask = (storedNames, parsedNames) =>
    m.sizeAreasFromParsed({
      marker: markerOf(storedNames),
      parsed: (parsedNames ?? storedNames).map((n, i) => m.piece(i + 1, n, { areaCm2: 200 })),
      sizeIds: SIZE_IDS, tokensOfSize: (id) => TOKENS[id] ?? [], isSizeToken: m.isSizeToken,
    });

  // ЧТО СЧИТАЕТСЯ ПРАВДОЙ: один карман на изделие — общая часть каждого размера 200 см².
  const one = ask(['PCK_L_UNI_M']);
  ck(one.ok === true, 'блоб с одной копией продолжается', one.ok ? '' : one.reason);
  ck(one.ok && one.areas.agnosticCm2 === 200, 'общая часть = 200 см² (одна деталь)',
     one.ok ? String(one.areas.agnosticCm2) : '');

  // Тот же карман, сохранённый ДО этого деплоя двумя копиями: тогда разбор читал их как градацию
  // и настил положил по одному на изделие. Сегодня обе безразмерны — и обе легли бы в общую часть.
  const two = ask(['PCK_L_UNI_M', 'PCK_L_UNI_S']);
  ck(two.ok === false, 'блоб с двумя копиями одной детали — ОТКАЗ (было бы 400 см²)',
     two.ok ? String(two.areas.agnosticCm2) : '');
  ck(!two.ok && two.reason.includes('PCK_L_UNI_M') && two.reason.includes('PCK_L_UNI_S'),
     'отказ называет обе копии', !two.ok ? two.reason : '');
  ck(!two.ok && two.reason.includes('Переснимите раскладку'), 'и называет выход');

  // Прежние проверки сюда не достают по построению: они ловят ОДНУ идентичность «и с хвостом, и
  // без», а тут идентичности разные. Убеждаемся, что сработала именно новая.
  ck(!two.ok && !two.reason.includes('и с размерным хвостом, и без'),
     'сработал вердикт о копиях, а не старая проверка про хвост');

  // Размерный ряд и UNI на одну основу — тот же отказ и на этом пути.
  const gradedPck = ['PCK_L_XS', 'PCK_L_S', 'PCK_L_M', 'PCK_L_L', 'PCK_L_XL'];
  const mixed = ask([...gradedPck, 'PCK_L_UNI_M', ...m.GRADED], [...gradedPck, 'PCK_L_UNI_M', ...m.GRADED]);
  ck(mixed.ok === false, 'ряд + UNI в блобе — отказ', mixed.ok ? 'ok!' : '');
  ck(!mixed.ok && mixed.reason.includes('противоречат друг другу'), 'теми же словами',
     !mixed.ok ? mixed.reason : '');

  // РЕГРЕССИЯ: разные uniBase в блобе — не копии, продолжение работает как прежде.
  const distinct = ask(m.PCK_UNI);
  ck(distinct.ok === true, 'четыре разных uniBase в блобе — продолжение как было',
     distinct.ok ? '' : distinct.reason);
  ck(distinct.ok && distinct.areas.agnosticCm2 === 800, 'общая часть = четыре кармана',
     distinct.ok ? String(distinct.areas.agnosticCm2) : '');
}

console.log('\nR3 · ДЕДУП сравнивает мультимножество контуров, а не максимум площади');
{
  const tail = m.GRADED.map((n, i) => m.piece(i + 10, n));
  // Выгрузка M несёт карман ДВАЖДЫ, выгрузка S — один раз. Максимумы совпадают, и прежнее правило
  // молча выбрало бы победителя по алфавиту: настил потерял бы вторую штуку.
  const uneven = [
    m.piece(1, 'PCK_L_UNI_M', { areaCm2: 200 }),
    m.piece(2, 'PCK_L_UNI_M', { areaCm2: 200 }),
    m.piece(3, 'PCK_L_UNI_S', { areaCm2: 200 }),
    ...tail,
  ];
  const ru = layPieces(uneven, ROWS_2);
  ck(ru.dedupe.conflicts.length === 1 && ru.dedupe.conflicts[0].kind === 'area',
     'разная КРАТНОСТЬ контуров — конфликт', JSON.stringify(ru.dedupe.conflicts));
  ck(ru.dedupe.excludedIds.size === 0, 'при конфликте не исключается ничего');

  // Равная кратность и равные площади — по-прежнему дедуп, и победитель забирает ОБА своих контура.
  const even = [
    m.piece(1, 'PCK_L_UNI_M', { areaCm2: 200 }),
    m.piece(2, 'PCK_L_UNI_M', { areaCm2: 150 }),
    m.piece(3, 'PCK_L_UNI_S', { areaCm2: 150 }),
    m.piece(4, 'PCK_L_UNI_S', { areaCm2: 200 }),
    ...tail,
  ];
  const re = layPieces(even, ROWS_2);
  ck(re.dedupe.conflicts.length === 0, 'порядок внутри копии не важен — множества равны',
     JSON.stringify(re.dedupe.conflicts));
  ck(re.dedupe.excludedIds.size === 2 && re.dedupe.excludedIds.has(3) && re.dedupe.excludedIds.has(4),
     'исключены оба контура проигравшего, оба контура победителя на месте',
     JSON.stringify([...re.dedupe.excludedIds]));
  ck(re.selected.filter((p) => p.blockName.startsWith('PCK')).length === 2,
     'в настил поехали ДВЕ штуки кармана — настоящая кратность сохранена',
     String(re.selected.filter((p) => p.blockName.startsWith('PCK')).length));

  // Нулевая площадь — отказ, а не «совпало». Прежний guard `min > 0` пропускал 0 против 100.
  const zero = [
    m.piece(1, 'PCK_L_UNI_M', { areaCm2: 0 }),
    m.piece(2, 'PCK_L_UNI_S', { areaCm2: 100 }),
    ...tail,
  ];
  const rz = layPieces(zero, ROWS_2);
  ck(rz.dedupe.conflicts.length === 1 && rz.dedupe.conflicts[0].kind === 'area',
     'нулевая площадь против живой — конфликт', JSON.stringify(rz.dedupe.conflicts));
  const nan = [
    m.piece(1, 'PCK_L_UNI_M', { areaCm2: Number.NaN }),
    m.piece(2, 'PCK_L_UNI_S', { areaCm2: 100 }),
    ...tail,
  ];
  ck(layPieces(nan, ROWS_2).dedupe.conflicts.length === 1, 'невалидная площадь — тоже конфликт');
}

console.log('\nR4 · ГАЛКА против фактической градации — отказ, а не отказ сервера потом');
{
  const pieces = m.piecesOf(m.GRADED);
  const card = (over) => [
    cardPiece('спинка', 'BP', over), cardPiece('рукав', 'SL_R'),
  ];
  // Без галки — как было: деталь градуируется, строки идут по размерам.
  const plain = normFor(pieces, card({}));
  ck(plain.ok === true, 'без галки норма считается', plain.ok ? '' : plain.reason);
  ck(plain.ok && plain.areas.pieceRows.every((r) => r.sizeId > 0),
     'и шлёт пер-размерные строки, как раньше');
  // С галкой на детали, у которой в файле ПОЛНЫЙ размерный ряд: прежде это доезжало до сервера и
  // он отвергал ВЕСЬ сейв площадей (ungraded_piece_measured_by_size).
  const flagged = normFor(pieces, card({ ungraded: true }));
  ck(flagged.ok === false, 'галка при живой градации — ОТКАЗ на клиенте',
     flagged.ok ? JSON.stringify(flagged.areas.pieceRows.slice(0, 2)) : '');
  ck(!flagged.ok && flagged.reason.includes('спинка'), 'отказ называет ДЕТАЛЬ',
     !flagged.ok ? flagged.reason : '');
  ck(!flagged.ok && flagged.reason.includes('BP_XS'), 'и называет её блоки');
  ck(!flagged.ok && flagged.reason.includes('Снимите галку'), 'и говорит, что делать');
  // Галка на детали, которая ДЕЙСТВИТЕЛЬНО не градуируется, — законна и работает (T4.2).
  const honest = ['PCK_L', 'PCK_R'].map((n, i) => m.piece(i + 1, n, { areaCm2: 100 }));
  const ok = normFor(honest, ['PCK_L', 'PCK_R'].map((n) => cardPiece(n, n, { ungraded: true })));
  ck(ok.ok === true, 'галка на честно неградуируемой детали — по-прежнему норма',
     ok.ok ? '' : ok.reason);
}

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad ? 1 : 0);
