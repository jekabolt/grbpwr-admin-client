import { assemblySweep } from './assembly-frontier';
import type {
  AssemblyPiece,
  AssemblyResult,
  AssemblyStep,
  AssemblyViolation,
} from './assembly-frontier';

// ПРИЧИНА ПРОТИВ СЛЕДСТВИЯ И ЦЕНА ЖЕСТА — расчёт, который отличает одну поломку от её теней.
//
// ЖАЛОБА, РАДИ КОТОРОЙ МОДУЛЬ НАПИСАН: «ломаем n1 — n2 и n3 тоже рассыпаются, и это неудобно
// конструктору». Каскад СЕМАНТИЧЕСКИ ВЕРЕН: узла нет — значит шаги, его потребляющие, и правда не
// собираются. Невыносимо не это, а то, что экран показывает ТРИ РАВНОПРАВНЫЕ ОШИБКИ вместо одной
// причины и двух следствий: свип выдаёт и шагу-жертве, и шагу ниже одинаковое
// `{rule: 1, detail: 'unknown-key'}`, и ни в одном не сказано, кто виноват. Красное поле, и негде
// чинить.
//
// ПОЧЕМУ СНАРУЖИ СВИПА, А НЕ ВЕТКОЙ В НЁМ. `assembly-frontier.ts` — порт бэкендного движка
// `internal/entity/techcard_assembly.go`, и паритет держится общим набором кейсов
// `assembly_cases.json`. Новая ветка нарушения рвёт паритет и требует парной правки на сервере.
// А материал для вывода и так снаружи: нарушения, узлы и выходные ключи шагов. Здесь только
// ВЫВОД по ним — ни одного нового отказа, ни одного изменённого слова движка.
//
// ЦЕНА СЧИТАЕТСЯ ТОЙ ЖЕ ФОРМУЛОЙ, А НЕ ВТОРОЙ. «Что рассыплется, если растворить узел» — это
// вопрос «что классификация скажет о карточке, КАКОЙ ОНА СТАНЕТ после жеста», и отвечает на него
// тот же расчёт по тому же свипу, прогнанному на карточке-после. Вторая формула для того же
// вопроса однажды разошлась бы с первой, и разошлась бы МОЛЧА: цену читают один раз, а верят ей
// всегда, и обещание «ничего не сломается» там, где ломается, хуже отсутствия обещания.
//
// ЧЕГО ЗДЕСЬ НЕТ: ни React, ни DOM, ни `frozen`, ни цвета — рисует Т8б. Переименования тоже нет:
// его лестница отказов живёт в `assembly-rename.ts`, и спрашивать надо её, а не заводить здесь
// вторую. Слова ЕСТЬ, и это намеренно: расчёт и формулировка обязаны меняться вместе, иначе
// интерфейс начнёт пересказывать числа своими словами и однажды перескажет неверно.
//
// Проба — `node scripts/assembly-cause-probe.mjs`; она импортирует ЭТОТ модуль, а не свою модель.

/** ЭКРАННЫЙ номер шага: рельс и боксы подписаны десятками, порядковый отправил бы не туда. */
const stepNo = (i: number) => (i + 1) * 10;

const unit = (key: string) => `▣ ${key}`;

/** «step 20», «steps 20 and 30», «steps 20, 30 and 40». */
function stepList(idx: number[]): string {
  const n = idx.map(stepNo);
  const last = n[n.length - 1];
  const head = n.slice(0, -1).join(', ');
  return `${n.length > 1 ? 'steps' : 'step'} ${head ? `${head} and ${last}` : last}`;
}

/**
 * Изъян шага глазами человека, а не движка.
 *
 * ПРИЧИНА — ошибка, которую чинят ЗДЕСЬ. СЛЕДСТВИЕ — шаг, у которого своего изъяна нет вовсе: он
 * ждёт узел, который не родился выше, и починится сам, как только починят причину. Разница не
 * косметическая: следствие не нужно ни читать, ни чинить, и весь смысл раздела — снять с
 * конструктора две ошибки из трёх.
 */
export type StepFault = {
  step: number;
  kind: 'cause' | 'consequence';
  /**
   * Мёртвые узлы, которых шаг ждёт, в порядке входов. Заполняется и у ПРИЧИНЫ тоже: шаг может
   * ждать чужой узел и вдобавок иметь свой изъян, и тогда он причина — но ждёт по-прежнему.
   */
  waitingFor: string[];
  /** Шаги-КОНЕЧНЫЕ причины, по возрастанию; у самой причины пусто. Первый — цель клика. */
  causes: number[];
  /** Шаги, осиротевшие из-за этого; у следствия пусто. */
  orphans: number[];
  /** Готовая строка человеку. У причины — слова движка, у следствия — чего ждёт и кто виноват. */
  message: string;
};

/**
 * Разбор нарушений одного шага на СВОИ и ПРОИЗВОДНЫЕ — вся арифметика различения.
 *
 * `dead` — мёртвый ключ, у которого ЕСТЬ производитель выше по цепи. Такой ключ никогда не бывает
 * опечаткой: шаг-производитель существует, просто его отвергли, и узел не родился. Ключ БЕЗ
 * производителя — висячая ссылка, и это СВОЙ изъян шага: чинить её здесь, выше чинить нечего.
 */
type StepDraft = {
  own: AssemblyViolation[];
  /** мёртвый ключ → шаг, который обязан был его произвести и не произвёл */
  dead: Map<string, number>;
};

/**
 * Кто первым объявляет узел своим выходом.
 *
 * ПОВТОРЯЕТ `firstProducer` ВНУТРИ СВИПА, и повторяет намеренно: свип его наружу не отдаёт (это
 * третий факт диагноза Т8), а добавлять экспорт в порт движка — та же правка порта. Семантика
 * обязана остаться той же, ПЕРВЫЙ побеждает: по ней движок формулирует «appears only at step k»,
 * и разъехавшись, два места назвали бы человеку разные шаги за один и тот же узел.
 */
function firstProducers(steps: AssemblyStep[]): Map<string, number> {
  const first = new Map<string, number>();
  steps.forEach((s, i) => {
    if (s.outputUnitKey && !first.has(s.outputUnitKey)) first.set(s.outputUnitKey, i);
  });
  return first;
}

function draftFaults(steps: AssemblyStep[], res: AssemblyResult): Map<number, StepDraft> {
  const producer = firstProducers(steps);

  const byStep = new Map<number, AssemblyViolation[]>();
  for (const v of res.violations) {
    if (v.step < 0) continue; // нарушение уровня карточки (правило 4): шага у него нет
    const list = byStep.get(v.step);
    if (list) list.push(v);
    else byStep.set(v.step, [v]);
  }

  const out = new Map<number, StepDraft>();
  byStep.forEach((list, i) => {
    const own: AssemblyViolation[] = [];
    const dead = new Map<string, number>();
    /** входы, которые свип отверг: ровно они не попали в его `usable` */
    const refused = new Set<number>();
    let arity: AssemblyViolation | null = null;

    for (const v of list) {
      if (v.input >= 0) refused.add(v.input);
      if (v.detail === 'too-few-inputs') {
        arity = v; // решается ниже: своя это беда шага или отзвук чужой
        continue;
      }
      if (v.detail === 'unknown-key') {
        const at = producer.get(v.key);
        // `at >= i` свип сюда не пускает вовсе (там ветки `produced-later` и `self-reference`),
        // но условие стоит: без него правка порядка выше превратила бы ссылку вперёд в «чужую
        // вину», и человека послали бы чинить шаг, который ещё не выполнялся.
        if (at !== undefined && at < i) {
          dead.set(v.key, at);
          continue;
        }
        own.push(v); // производителя нет вовсе — висячая ссылка, чинить здесь
        continue;
      }
      own.push(v);
    }

    if (arity) {
      // АРНОСТЬ РЕШАЕТ, УСЛОВЕН КАСКАД ИЛИ НЕТ. Джойн из двух входов, потеряв один, `return`-ится
      // ДО создания узла — падает вся цепь под ним. Джойн из трёх, потеряв один, выживает и
      // собирает свой узел. Поэтому «мало входов» это ОТЗВУК чужой поломки только тогда, когда
      // возвращённые мёртвые входы дают шагу законные два; иначе шагу не хватает входа по
      // существу, и чинить его придётся здесь, сколько бы ни чинили выше.
      const live = new Set(
        (steps[i]?.inputs ?? []).filter((_, j) => !refused.has(j)).map((inp) => inp.key),
      );
      if (live.size + dead.size < 2) own.push(arity);
    }

    out.set(i, { own, dead });
  });
  return out;
}

/**
 * Изъяны карточки, разобранные на причины и следствия. Ключ — индекс шага; шаги без нарушений в
 * ответе не появляются вовсе.
 *
 * `res` берётся ГОТОВЫМ, а не считается здесь: у экрана он уже посчитан и мемоизирован, а свип
 * крутится на каждый набранный символ.
 */
export function assemblyFaults(steps: AssemblyStep[], res: AssemblyResult): Map<number, StepFault> {
  const drafts = draftFaults(steps, res);

  /**
   * Спуск ДО КОНЕЧНОЙ ПРИЧИНЫ, а не до ближайшей: владелец жаловался ровно на цепочку из трёх, и
   * следствие, показывающее адрес другого следствия, отправляет чинить туда, где чинить нечего.
   *
   * Спуск монотонен — производитель мёртвого ключа всегда СТРОГО выше потребителя, иначе свип
   * сказал бы «appears only at step k», — поэтому зациклиться сегодня нечем. Множество посещённых
   * всё равно стоит: расчёт крутится на каждый символ, который печатает человек, и цена ошибки в
   * будущей правке — не неверный ответ, а повисший экран на испорченной карточке.
   */
  const rootOf = (from: number): number => {
    let at = from;
    const seen = new Set<number>([from]);
    for (;;) {
      const d = drafts.get(at);
      if (!d || d.own.length > 0 || d.dead.size === 0) return at;
      let next = -1;
      for (const p of d.dead.values()) if (next < 0 || p < next) next = p;
      if (next < 0 || seen.has(next)) return at;
      seen.add(next);
      at = next;
    }
  };

  const faults = new Map<number, StepFault>();
  steps.forEach((_, i) => {
    const d = drafts.get(i);
    if (!d) return;
    // Шаг с нарушениями, но без единого мёртвого входа, следствием не бывает по определению —
    // условие стоит перед `own.length`, чтобы разлад в подсчёте арности не выдумал следствие без
    // причины.
    if (d.dead.size === 0 || d.own.length > 0) {
      faults.set(i, {
        step: i,
        kind: 'cause',
        waitingFor: [...d.dead.keys()],
        causes: [],
        orphans: [],
        message: d.own[0]?.message ?? '',
      });
      return;
    }
    const causes = [...new Set([...d.dead.values()].map(rootOf))].sort((a, b) => a - b);
    const waitingFor = [...d.dead.keys()];
    faults.set(i, {
      step: i,
      kind: 'consequence',
      waitingFor,
      causes,
      orphans: [],
      // СЛЕДСТВИЕ ГОВОРИТ, ЧЕГО ЖДЁТ И КТО ВИНОВАТ. «input doesn't exist» здесь — ложь по сути:
      // вход существует, он просто не собрался выше.
      message: `waiting for ${waitingFor.map(unit).join(', ')} · ${stepList(causes)} ${
        causes.length > 1 ? 'are' : 'is'
      } broken`,
    });
  });

  // Обратная сторона той же связи: причина обязана знать, скольким она мешает, иначе «одна ошибка
  // вместо трёх» превратится в «одна ошибка, а две другие пропали неизвестно куда».
  faults.forEach((f) => {
    for (const c of f.causes) {
      const cause = faults.get(c);
      if (cause) cause.orphans.push(f.step);
    }
  });
  faults.forEach((f) => {
    if (f.kind !== 'cause' || f.orphans.length === 0) return;
    const key = steps[f.step]?.outputUnitKey ?? '';
    f.orphans.sort((a, b) => a - b);
    f.message = `${f.message} · ${stepList(f.orphans)} depend${
      f.orphans.length > 1 ? '' : 's'
    } on ${unit(key)}`;
  });

  return faults;
}

/**
 * Цена жеста: что рассыплется и что уцелеет, СКАЗАННОЕ ДО НЕГО.
 *
 * Это НЕ подтверждение (R8: единственное подтверждение в системе — сброс раскладки). Жест
 * остаётся одним движением и защищён отменой; цена лишь называет его последствия заранее.
 */
export type AssemblyPrice = {
  /** Шаги, которые жест ЛОМАЕТ: сегодня целы, после жеста — нет. */
  breaks: number[];
  /** Из них те, у кого своего изъяна не будет: чистые следствия. */
  orphans: number[];
  /** Узлы, которые перестанут собираться, хотя карточка их по-прежнему объявляет. */
  unitsLost: string[];
  /** Шаги, чей изъян жест СНИМАЕТ. Цена честна только вместе с этой половиной. */
  heals: number[];
  /** Одна строка человеку. Пустой не бывает: «ничего не сломается» тоже цена. */
  summary: string;
};

/**
 * ЦЕНА = КЛАССИФИКАЦИЯ КАРТОЧКИ-ПОСЛЕ МИНУС КЛАССИФИКАЦИЯ КАРТОЧКИ-СЕЙЧАС. Ни одного правила
 * каскада здесь не записано — они все уже в свипе и в `assemblyFaults`, и спрашивать их надо, а не
 * повторять: повтор разошёлся бы молча, а молча разошедшаяся цена лжёт человеку ровно в тот
 * момент, когда он решает, нажимать ли.
 *
 * `lead` — начало фразы («dissolving ▣ SHELL»): глагол знает только жест, а слова после него —
 * только этот расчёт.
 *
 * КОНТРАКТ: `before` и `after` — одна и та же карточка, и индекс в обеих означает ОДИН И ТОТ ЖЕ
 * шаг. Жест, добавляющий или удаляющий шаги, сдвинул бы нумерацию, и разность превратилась бы в
 * список случайных номеров; такому жесту нужен свой способ сопоставления, а не этот.
 */
export function assemblyPrice(
  pieces: AssemblyPiece[],
  before: AssemblyStep[],
  after: AssemblyStep[],
  lead: string,
): AssemblyPrice {
  const wasRes = assemblySweep(pieces, before);
  const nowRes = assemblySweep(pieces, after);
  const was = assemblyFaults(before, wasRes);
  const now = assemblyFaults(after, nowRes);

  const breaks: number[] = [];
  const orphans: number[] = [];
  after.forEach((_, i) => {
    // Уже сломанный шаг в цену не идёт: «сломается» про то, что сейчас работает. Иначе жест на
    // полусобранной карточке пугал бы человека его же незаконченной работой.
    if (was.has(i) || !now.has(i)) return;
    breaks.push(i);
    if (now.get(i)?.kind === 'consequence') orphans.push(i);
  });
  const heals = [...was.keys()].filter((i) => !now.has(i)).sort((a, b) => a - b);

  // Узел, исчезнувший ВМЕСТЕ со своим объявлением, — это сам жест, а не его цена: растворение
  // ровно за тем и зовут. Потеря — это узел, который карточка по-прежнему обещает собрать, а
  // движок уже не собирает.
  const declared = new Set(after.map((s) => s.outputUnitKey).filter(Boolean));
  const unitsLost = [...wasRes.units.keys()].filter((k) => !nowRes.units.has(k) && declared.has(k));

  // ПРИЯТНОЕ ГОВОРИТСЯ, ЕСЛИ ОНО ПРАВДА. Джойн, потерявший один вход из трёх, остаётся с двумя
  // законными и собирает свой узел: сломан он, а не цепь под ним. Без этой половины предупреждение
  // станет шумом, который перестают читать, — и перестанут читать заодно и настоящее.
  const held = breaks
    .map((i) => after[i]?.outputUnitKey ?? '')
    .filter((k) => !!k && nowRes.units.has(k));

  const parts: string[] = [];
  if (breaks.length === 0) {
    // «Ничего не сломается» сказано осторожно: шаг, сломанный ДО жеста, не считается уцелевшим, и
    // обещать за него нечего.
    parts.push(`${lead} breaks nothing that works today`);
  } else {
    parts.push(`${lead} will break ${stepList(breaks)}`);
    if (unitsLost.length === 0 && held.length > 0) {
      parts.push(
        `but ${held.map(unit).join(', ')} still ${held.length > 1 ? 'assemble' : 'assembles'}`,
      );
    }
  }
  if (heals.length > 0) {
    parts.push(`and ${stepList(heals)} stop${heals.length > 1 ? '' : 's'} being broken`);
  }

  return { breaks, orphans, unitsLost, heals, summary: parts.join(', ') };
}

/**
 * Цена растворения узла. `null` — растворять нечего (шаг ничего не собирает): это НЕ «ничего не
 * сломается», а отсутствие жеста, и говорить о нём нечего.
 *
 * КАРТОЧКА-ПОСЛЕ СТРОИТСЯ РОВНО ТАК, КАК ПИШЕТ МУТАТОР `dissolveUnit`: гаснут ОБА поля, ключ и
 * имя. Погаси только ключ — и на карточке-после осталось бы имя без ключа, движок ответил бы
 * `shadow-name`, и цена назвала бы поломку, которой жест не делает. Потребители ключа при этом не
 * трогаются: их входы остаются висячими ссылками, и это не упущение расчёта, а то самое, что
 * человеку и надо сказать заранее.
 */
export function dissolvePrice(
  pieces: AssemblyPiece[],
  steps: AssemblyStep[],
  stepIndex: number,
): AssemblyPrice | null {
  const key = (steps[stepIndex]?.outputUnitKey ?? '').trim();
  if (!key) return null;
  const after = steps.map((s, i) =>
    i === stepIndex ? { ...s, outputUnitKey: '', outputUnitName: '' } : s,
  );
  return assemblyPrice(pieces, steps, after, `dissolving ${unit(key)}`);
}
