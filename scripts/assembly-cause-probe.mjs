#!/usr/bin/env node
// ПРИЧИНА, СЛЕДСТВИЕ И ЦЕНА ЖЕСТА — прогон расчёта, который снимает с конструктора две ошибки из
// трёх (Т8а, раунд 2).
//
// Жалоба владельца: «ломаем n1 — n2 и n3 тоже рассыпаются». Каскад верен, невыносима подача: свип
// выдаёт всем троим одинаковое `{rule: 1, detail: 'unknown-key'}`, и ни в одном не сказано, кто
// виноват. Ошибки этого различения тихие, и каждая по-своему хуже молчания:
//
//   • СПУСК ДО БЛИЖАЙШЕЙ ПРИЧИНЫ ВМЕСТО КОНЕЧНОЙ. Третья нода показала бы адрес второй, вторая —
//     первой, и конструктора отправили бы чинить туда, где чинить нечего. На цепочке из двух
//     звеньев это НЕ ВИДНО ВОВСЕ: ближайшая и конечная совпадают, поэтому фикстура здесь из трёх.
//   • ВИСЯЧАЯ ССЫЛКА, ПРИНЯТАЯ ЗА СЛЕДСТВИЕ. Опечатка во входе — это ошибка ЗДЕСЬ, выше чинить
//     нечего; назови её следствием, и единственная настоящая причина исчезнет с экрана, а человек
//     будет ждать, пока починится «что-то выше».
//   • ПОТЕРЯННОЕ УСЛОВИЕ АРНОСТИ. Каскад условен: джойн из двух входов, потеряв один,
//     `return`-ится ДО создания узла и роняет всю цепь, а джойн из трёх выживает. Без этого
//     различения цена пугает зря — и её перестают читать, а вместе с ней и настоящую.
//   • ВТОРАЯ ФОРМУЛА ДЛЯ ЦЕНЫ. «Что рассыплется» обязано считаться тем же расчётом по карточке,
//     какой она станет; отдельная арифметика разошлась бы со свипом молча и соврала бы ровно в
//     тот момент, когда человек решает, нажимать ли.
//
// ДВЕ НОГИ:
//   СЕМАНТИКА — классификация и цена на фикстурах, собранных настоящим свипом и настоящим
//               `classifyAssemblyInputs`, а не моделью шага.
//   СТРУКТУРА — исходник читается текстом: цена ходит через движок, своих нарушений модуль не
//               производит и слов движка не переписывает.
//
// ЧЕГО ПРОБА НЕ ДОКАЗЫВАЕТ: ни одного пикселя. Что следствие нарисовано иначе причины, что до
// причины один клик и что набор кода не красит цепочку посимвольно — это Т8б и браузерный стенд;
// чистая арифметика об этом ничего не знает.
//
//   node scripts/assembly-cause-probe.mjs

import { build } from 'esbuild';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const entry = resolve(root, 'scripts/assembly-cause-probe-entry.ts');

const outfile = resolve(tmpdir(), `assembly-cause-${process.pid}.mjs`);
await build({
  entryPoints: [entry],
  bundle: true,
  format: 'esm',
  platform: 'node',
  absWorkingDir: root,
  outfile,
  logLevel: 'silent',
});
const { assemblyFaults, assemblyPrice, dissolvePrice, assemblySweep, classifyAssemblyInputs } =
  await import(pathToFileURL(outfile).href);

let checks = 0;
const failed = new Set();
const fail = (name, msg) => {
  failed.add(name);
  console.log(`FAIL  ${name}\n      ${msg}`);
};
const j = (v) => JSON.stringify(v);
const is = (name, got, want) => {
  checks++;
  if (j(got) !== j(want)) fail(name, `${j(got)} ≠ ${j(want)}`);
};
const yes = (name, got) => is(name, got, true);
const head = (t) => console.log(`\n${t}`);

// --- фикстуры ---------------------------------------------------------------------------------

const PIECES = [
  { lineKey: 'FRONT', name: 'front' },
  { lineKey: 'BACK', name: 'back' },
  { lineKey: 'SLEEVE', name: 'sleeve' },
  { lineKey: 'COLLAR', name: 'collar' },
  { lineKey: 'POCKET', name: 'pocket' },
  { lineKey: 'CUFF', name: 'cuff' },
];
const PIECE_KEYS = new Set(PIECES.map((p) => p.lineKey));

/** Шаг строится ТЕМ ЖЕ классификатором, что и на экране: своя модель входа здесь ничего не стоит. */
const step = (ins, out = '', name = '') => ({
  inputs: classifyAssemblyInputs(PIECE_KEYS, ins),
  outputUnitKey: out,
  outputUnitName: name,
});

const faultsOf = (steps) => assemblyFaults(steps, assemblySweep(PIECES, steps));
const kinds = (steps) => steps.map((_, i) => faultsOf(steps).get(i)?.kind ?? null);
const at = (steps, i) => faultsOf(steps).get(i);

// --- СЕМАНТИКА: причина против следствия -------------------------------------------------------

head('цепочка из трёх — одна причина и два следствия');
{
  // Ровно карточка из жалобы: первая нода сломана опечаткой во входе, вторая и третья честно
  // рассыпались следом. Свип видит здесь ШЕСТЬ нарушений на трёх шагах — человек должен увидеть
  // одну ошибку.
  const chain = [
    step(['FRONT', 'TYPO'], 'N1'),
    step(['N1', 'SLEEVE'], 'N2'),
    step(['N2', 'COLLAR'], 'N3'),
  ];
  const f = faultsOf(chain);
  is('сломаны все три шага', f.size, 3);
  is('но причина одна', kinds(chain), ['cause', 'consequence', 'consequence']);
  // САМОЕ ГЛАВНОЕ ЧИСЛО ПРОБЫ: третий шаг показывает адрес ПЕРВОГО, а не второго. Спуск до
  // ближайшей причины дал бы здесь `[1]`, и на цепочке из двух звеньев это было бы неотличимо.
  is('у второго адрес конечной причины', f.get(1)?.causes, [0]);
  is('и у третьего тот же', f.get(2)?.causes, [0]);
  is('причина знает своих сирот', f.get(0)?.orphans, [1, 2]);
  is('следствие называет, чего ждёт', f.get(1)?.waitingFor, ['N1']);
  is(
    'и говорит человеку, чего ждёт и кто виноват',
    f.get(2)?.message,
    'waiting for ▣ N2 · step 10 is broken',
  );
  // Слова причины НЕ СОЧИНЯЮТСЯ ЗАНОВО: движок уже сказал, что не так, и читатель эти слова
  // выучил в списке нарушений. Сверка идёт с настоящим текстом свипа, а не с копией строки.
  const engine = assemblySweep(PIECES, chain).violations.find((v) => v.step === 0)?.message ?? '';
  yes('а причина остаётся при словах движка', (f.get(0)?.message ?? '').startsWith(engine));
  yes(
    'и называет, скольким она мешает',
    (f.get(0)?.message ?? '').endsWith('· steps 20 and 30 depend on ▣ N1'),
  );
}

head('висячая ссылка — причина, а не следствие');
{
  // Производителя нет ВОВСЕ: опечатка, растворённый узел, переставленные шаги. Чинить здесь, и
  // назвать это следствием значит убрать с экрана единственную настоящую ошибку.
  const c = [step(['FRONT', 'BACK'], 'N1'), step(['N1', 'GHOST'], 'N2')];
  const f = faultsOf(c);
  is('сломан один шаг', f.size, 1);
  is('и он причина', f.get(1)?.kind, 'cause');
  is('адреса чужой причины у него нет', f.get(1)?.causes, []);
  is('и ждать ему нечего', f.get(1)?.waitingFor, []);
  yes('слова — движка', (f.get(1)?.message ?? '').includes('GHOST'));
}

head('взаимная ссылка двух шагов — расчёт завершается');
{
  // Наивный спуск «кто производит мой мёртвый вход» здесь ушёл бы в бесконечность: каждый шаг
  // ждёт узел другого. Что ответ вообще получен — и есть проверка; повисший расчёт не вернул бы
  // управление, а крутится он на КАЖДЫЙ набранный символ.
  const loop = [step(['SLEEVE', 'N2'], 'N1'), step(['FRONT', 'N1'], 'N2')];
  const f = faultsOf(loop);
  is('оба шага сломаны', f.size, 2);
  // Ссылка ВПЕРЁД — своя беда шага: движок отвечает «appears only at step k», и чинится это
  // порядком, здесь. Следствие тут только второй.
  is('ссылка вперёд остаётся причиной', f.get(0)?.kind, 'cause');
  is('а обратная — следствием', f.get(1)?.kind, 'consequence');
  is('и её адрес — первый шаг', f.get(1)?.causes, [0]);
}

head('две причины у одного следствия');
{
  const forked = [
    step(['FRONT', 'TYPO'], 'N1'),
    step(['BACK', 'TYPO2'], 'N2'),
    step(['N1', 'N2'], 'N3'),
  ];
  const f = faultsOf(forked);
  is('шаг ждёт обоих', f.get(2)?.waitingFor, ['N1', 'N2']);
  is('и знает обе причины', f.get(2)?.causes, [0, 1]);
  is(
    'слова во множественном числе',
    f.get(2)?.message,
    'waiting for ▣ N1, ▣ N2 · steps 10 and 20 are broken',
  );
}

head('из двух объявителей узла виноват первый');
{
  // Узел объявлен ДВАЖДЫ, и не состоялся ни разу: первого свалила опечатка, второму не хватает
  // входа. Движок в своих словах («appears only at step k») называет ПЕРВОГО, и следствие обязано
  // называть того же — иначе за один и тот же узел два места экрана отправят человека на разные
  // шаги, и он поверит тому, которое увидит вторым.
  const twice = [
    step(['FRONT', 'TYPO'], 'SHELL'),
    step(['BACK'], 'SHELL'),
    step(['SHELL', 'SLEEVE'], 'BODY'),
  ];
  const f = faultsOf(twice);
  is('следствие показывает на первого', f.get(2)?.causes, [0]);
  is('оба объявителя — причины', [f.get(0)?.kind, f.get(1)?.kind], ['cause', 'cause']);
  is('и сирота записан первому', f.get(0)?.orphans, [2]);
}

head('арность решает, чей это изъян');
{
  // Джойну не хватает входа ПО СУЩЕСТВУ: даже почини причину выше — у него останется один вход, и
  // узла из него не выйдет. Такой шаг — причина, сколько бы ни чинили над ним. Потеряй условие
  // арности — и он назовётся следствием, то есть исчезнет из списка того, что надо починить.
  const lone = [step(['FRONT', 'TYPO'], 'N1'), step(['N1'], 'N2')];
  const f = faultsOf(lone);
  is('одновходовый джойн — причина', f.get(1)?.kind, 'cause');
  is('и сирот у первого шага нет', f.get(0)?.orphans, []);
  yes('но ждать он всё равно ждёт', j(f.get(1)?.waitingFor) === j(['N1']));

  // А тому же джойну с живым вторым входом починка выше вернёт всё: он чистое следствие.
  const pair = [step(['FRONT', 'TYPO'], 'N1'), step(['N1', 'SLEEVE'], 'N2')];
  is('двухвходовый — следствие', faultsOf(pair).get(1)?.kind, 'consequence');
}

head('целая карточка не даёт ни одного изъяна');
{
  const ok = [
    step(['FRONT', 'BACK'], 'SHELL'),
    step(['SHELL', 'SLEEVE'], 'BODY'),
    step(['BODY', 'COLLAR'], 'GARMENT'),
  ];
  is('изъянов нет', faultsOf(ok).size, 0);
  // Обработка (шаг без выходного ключа) с одним входом — законна: арность спрашивают с джойна.
  const withProcessing = [...ok, step(['GARMENT'])];
  is('обработка не считается поломкой', faultsOf(withProcessing).size, 0);
}

// --- СЕМАНТИКА: цена жеста --------------------------------------------------------------------

head('цена растворения — цепь падает');
{
  const chain = [
    step(['FRONT', 'BACK'], 'SHELL'),
    step(['SHELL', 'SLEEVE'], 'BODY'),
    step(['BODY', 'POCKET'], 'GARMENT'),
  ];
  const p = dissolvePrice(PIECES, chain, 0);
  is('ломаются оба шага ниже', p.breaks, [1, 2]);
  is('и нижний только осиротеет', p.orphans, [2]);
  is('два узла перестают собираться', p.unitsLost, ['BODY', 'GARMENT']);
  is('цена сказана словами', p.summary, 'dissolving ▣ SHELL will break steps 20 and 30');
}

head('цена растворения — джойн из трёх входов выживает');
{
  // ТО ЖЕ РАСТВОРЕНИЕ, ОДИН ЛИШНИЙ ВХОД — и цепь стоит: у джойна остаётся два законных входа, узел
  // рождается, шаги ниже не замечают ничего. Не сказать этого значит пугать зря.
  const wide = [
    step(['FRONT', 'BACK'], 'SHELL'),
    step(['SHELL', 'SLEEVE', 'COLLAR'], 'BODY'),
    step(['BODY', 'POCKET'], 'GARMENT'),
  ];
  const p = dissolvePrice(PIECES, wide, 0);
  is('ломается только сам джойн', p.breaks, [1]);
  is('сирот нет', p.orphans, []);
  is('и ни один узел не потерян', p.unitsLost, []);
  is(
    'и приятное сказано вслух',
    p.summary,
    'dissolving ▣ SHELL will break step 20, but ▣ BODY still assembles',
  );
}

head('цена растворения — ломать нечего');
{
  const two = [step(['FRONT', 'BACK'], 'SHELL'), step(['SLEEVE', 'COLLAR'], 'CUFFS')];
  const p = dissolvePrice(PIECES, two, 1);
  is('никто не зависел', p.breaks, []);
  is('и терять нечего', p.unitsLost, []);
  is('так и сказано', p.summary, 'dissolving ▣ CUFFS breaks nothing that works today');
  is('а на шаге без узла жеста нет вовсе', dissolvePrice(PIECES, [step(['FRONT'])], 0), null);
}

head('цена называет и то, что жест чинит');
{
  // Второй производитель того же кода — нарушение правила 2 у ВТОРОГО шага. Растворив первый, его
  // чинят: цена, умалчивающая про это, честна только наполовину.
  const twin = [step(['FRONT', 'BACK'], 'SHELL'), step(['SLEEVE', 'COLLAR'], 'SHELL')];
  const p = dissolvePrice(PIECES, twin, 0);
  is('ничего не ломается', p.breaks, []);
  is('зато чинится второй шаг', p.heals, [1]);
  is(
    'и об этом сказано',
    p.summary,
    'dissolving ▣ SHELL breaks nothing that works today, and step 20 stops being broken',
  );
}

head('цена не пугает уже сломанным');
{
  // Шаг сломан ДО жеста — «сломается» про него неправда, и вписав его в цену, жест обвинили бы в
  // чужой беде. Цена считает разницу, а не итог.
  const messy = [
    step(['FRONT', 'BACK'], 'SHELL'),
    step(['SHELL', 'TYPO'], 'BODY'),
    step(['SLEEVE', 'COLLAR'], 'CUFFS'),
  ];
  const p = dissolvePrice(PIECES, messy, 2);
  is('уже сломанный шаг в цену не идёт', p.breaks, []);
  is('и не выдаётся за починенный', p.heals, []);
}

head('цена — тот же расчёт, а не второй');
{
  // Прямая сверка: цена обязана совпадать с классификацией карточки-ПОСЛЕ, посчитанной руками
  // через тот же свип. Разойдутся они молча, и первым это заметит не разработчик, а конструктор.
  const chain = [
    step(['FRONT', 'BACK'], 'SHELL'),
    step(['SHELL', 'SLEEVE'], 'BODY'),
    step(['BODY', 'POCKET'], 'GARMENT'),
  ];
  const after = chain.map((s, i) => (i === 0 ? { ...s, outputUnitKey: '', outputUnitName: '' } : s));
  const hand = faultsOf(after);
  const p = dissolvePrice(PIECES, chain, 0);
  is('ломаются ровно изъяны карточки-после', p.breaks, [...hand.keys()].sort((a, b) => a - b));
  is(
    'и сироты те же',
    p.orphans,
    [...hand.values()].filter((f) => f.kind === 'consequence').map((f) => f.step),
  );
  // Растворение гасит ОБА поля, как это делает мутатор. Погаси только ключ — на карточке-после
  // осталось бы имя без ключа, движок ответил бы `shadow-name`, и цена назвала бы поломку,
  // которой жест не делает. У узла с именем разница видна сразу.
  const named = chain.map((s, i) => (i === 0 ? { ...s, outputUnitName: 'shell' } : s));
  const half = named.map((s, i) => (i === 0 ? { ...s, outputUnitKey: '' } : s));
  is('имя без ключа — лишний шаг в цене', assemblyPrice(PIECES, named, half, 'x').breaks, [0, 1, 2]);
  is('а растворение целиком его не даёт', dissolvePrice(PIECES, named, 0).breaks, [1, 2]);
}

// --- СТРУКТУРА: одна формула, ни одного своего нарушения ---------------------------------------

head('структура — расчёт один и слова чужие');
{
  const src = (p) => readFileSync(resolve(root, p), 'utf8');
  const code = src('src/components/managers/tech-card/components/assembly-cause.ts');
  yes('цена ходит через движок', /import \{ assemblySweep \} from '\.\/assembly-frontier'/.test(code));
  yes('и зовёт его на карточке-после', /assemblySweep\(pieces, after\)/.test(code));
  is('своих нарушений модуль не производит', /violations\.push\(|AssemblyRule/.test(code), false);
  is('React и DOM сюда не заходят', /from 'react'|document\./.test(code), false);
  // Переименование считает `assembly-rename.ts`; вторая лестница отказов рядом с первой разошлась
  // бы с ней молча — ровно тот дефект, ради которого её и вынесли в модуль.
  is('переименование не пересчитывается', /from '\.\/assembly-rename'/.test(code), false);
  yes(
    'проба берёт настоящий модуль, а не копию',
    /from '\.\.\/src\/components\/managers\/tech-card\/components\/assembly-cause'/.test(
      src('scripts/assembly-cause-probe-entry.ts'),
    ),
  );
}

// --- итог -----------------------------------------------------------------------------------------
console.log(
  failed.size === 0
    ? `\n${checks} из ${checks} проверок прошло`
    : `\n${failed.size} провалов из ${checks} проверок`,
);
process.exit(failed.size === 0 ? 0 : 1);
