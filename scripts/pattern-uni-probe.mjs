// UNI: деталь без градации входит во ВСЕ размеры — правила прогоняются на ЖИВОМ коде.
//
// Секции дописываются задачами по порядку (T1 → T2 → T4); чужие assert'ы не редактируются:
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
  alias: { components: resolve(REPO,'src/components'), lib: resolve(REPO,'src/lib'), api: resolve(REPO,'src/api') },
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
  ck(r.dedupe.conflicts[0]?.uniBase === 'PCK_L', 'конфликт назван по uniBase', r.dedupe.conflicts[0]?.uniBase);
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
  ck(r.dedupe.conflicts[0]?.uniBase === 'PCK_L', 'конфликт назван деталью PCK_L');
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

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad ? 1 : 0);
