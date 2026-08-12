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

console.log(bad === 0 ? '\nВСЁ ЗЕЛЁНОЕ' : `\nПРОВАЛОВ: ${bad}`);
process.exit(bad ? 1 : 0);
