import type { common_DesignPicture } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { AskModal } from '../core';
import { useDesignWrites } from '../use-design-band';
import { viewLabel, type SilhouetteView } from '../views';
import type { BenchSide } from './model';

/**
 * ═══ APPLY SPLITTED — E-6, И ЖИВЁТ ОН НА ОДНОМ ЭКРАНЕ, В РЕНДЕР-ВЕРСТАКЕ ══════════════════════
 *
 * Владелец, дословно: «в 3д INPUT — RENDERS BY VIEW мультивью карточек тоже должно отображаться и
 * если его расколапсить под мультивью кнока аплай сплитед и они уходят в инпут после нажатия и
 * заменяют текущие вью предварительно очищая предыдущий импут и так же сделать в фабрик рендере
 * INPUT — FLATS OF THIS CARD что бы там после дивайдера показывало фильтром только флеты и
 * мультивью тоже спильнутые».
 *
 * ⚠ ЗДЕСЬ СТОЯЛО «ОДИН МЕХАНИЗМ НА ДВА ЭКРАНА» — ЭТО БЫЛО ВЕРНО И ПРОТУХЛО (r3-w2 №7). Просьба
 * действительно называла два места, и первая редакция дала двери проп `benchKind: 'flat'|'render'`
 * — «вход фабрик-рендера пишет ФЛЭТОВЫЙ верстак, вход 3D — рендерный». Круг r2 (п.29/30) снял с
 * полос входа ВСЕ двери постановки: у пустой стороны нет ни половины «из медиатеки», ни
 * `apply splitted` — единственный жест это `mark ▸` на самой картинке в RENDERS OF THIS CARD.
 * С тех пор у двери ровно один хозяин — раскрытая колода мультивью в `outputs.tsx`, — и он
 * передавал `'render'`. Флэтовая ветка не исполнялась ни разу.
 *
 * ⚠ И ЭТО НЕ ПРОСТО МЁРТВАЯ ВЕТКА, А ЗАРЯЖЕННАЯ. Род и колорвей у верстака связаны инвариантом 4
 * (`00-STATE.md`): у флэта `colorway_id` строго `0`, и `slot: { kind: 'flat', colorwayId: target }`
 * при любой цели, кроме нуля, получил бы от сервера `colorway_forbidden`. То есть проп разрешал
 * собрать пару, которую сервер обязан отвергнуть, — а целей у этой двери с круга r3 стало
 * несколько (усыновление семпл-листа). Род поэтому СПЕЛЛИТСЯ ЛИТЕРАЛОМ у самой записи: одно место,
 * где его видно рядом с `colorwayId`, и никакого способа передать другое снаружи.
 *
 * ═══ ЧТО ЗНАЧИТ «ОЧИЩАЯ ПРЕДЫДУЩИЙ ИНПУТ» — И ПОЧЕМУ ЭТО НЕ ДВА ЖЕСТА НА СТОРОНУ ══════════════
 *
 * После нажатия вход обязан быть РОВНО разрезом и ничем больше. Наивное прочтение («сначала снять
 * все четыре, потом положить») даёт ДВЕ записи на одну сторону — и вторая падает: `slot_rev` это
 * CAS-токен, снятие его двигает, а положить пришлось бы с токеном, прочитанным ДО снятия. То есть
 * буквальная реализация фразы владельца отказала бы на каждой стороне, куда есть что положить.
 *
 * ПОЭТОМУ У КАЖДОЙ СТОРОНЫ РОВНО ОДНА ЗАПИСЬ, И ИСХОД ТОТ ЖЕ:
 *   · сторона, которую разрез НАЗЫВАЕТ → в неё кладётся кусок (постановка ВЫТЕСНЯЕТ стоящее — это
 *     поведение верстака, а не наше добавление);
 *   · сторона, которую разрез НЕ называет и которая занята → очищается (`picture_id = 0`);
 *   · сторона, которую разрез не называет и которая пуста → не трогается вовсе. Запись, ничего не
 *     меняющая, — это CAS-конфликт, купленный за просто так.
 *
 * ⚠ РАЗРУШИТЕЛЬНОЕ ДЕЙСТВИЕ НАЗЫВАЕТСЯ ДО ЗАПИСИ, А НЕ ПОСЛЕ. Если опустеть или быть вытесненным
 * есть чему — вопрос задаётся модалкой, поимённо по сторонам, и ни одна запись не уходит, пока на
 * него не ответили. Если терять нечего (все затронутые стороны пусты), вопроса нет: пустой путь
 * этих людей не пáдят (PRODUCT.md, «wizard-style over-explained flows»).
 *
 * ═══ СТРОКИ ПОСЛЕДСТВИЙ ПОД ДВЕРЬЮ БОЛЬШЕ НЕТ (круг 17, F-10) ═════════════════════════════════
 *
 * Владелец, дословно: «этот текст нахуя тут "the input becomes exactly this split: front, back,
 * side R take their pieces. Nothing stands in those sides now, so nothing is lost"». Строка была
 * ВТОРЫМ написанием того, что говорит вопрос, и стояла под дверью всегда — в том числе когда
 * терять нечего и говорить ей было не о чем. Снята.
 *
 * ЧТО ОСТАЛОСЬ ОТ «ДО НАЖАТИЯ»: дверь несёт потерю на себе — `title` называет стороны, которые
 * опустеют, и `data-apply-split-losing` держит их число, — а вопрос по-прежнему стоит между
 * нажатием и записью. Замерено пробой qa-k2 (21–23) и qa-w2 (W-2): вопрос задаётся, до ответа на
 * провод не уходит ничего, после — ровно четыре стороны.
 *
 * ═══ У ДВЕРИ ДВА СОСТОЯНИЯ, А НЕ ДВЕ ДВЕРИ (r3, связка колорвея) ═══════════════════════════════
 *
 * Целей может быть несколько — семпл-лист при усыновлении (`bench_adopts_unattributed`) ложится в
 * любой живой столбец. Тогда та же дверь становится СЕЛЕКТОМ целей: пункт отвечает на «куда», а
 * вопрос о потере, запись и отчёт идут ровно тем же путём. Пара «селект цели + кнопка apply» была
 * бы двумя органами на один глагол в ячейке шириной 132px. Лицо в этом состоянии короче («apply ▸»
 * вместо «apply splitted») — замер, разбор у самого селекта.
 *
 * ⚠ ПОДПИСЬ ДВЕРИ — «apply splitted» БЕЗ СТРЕЛКИ, И ЭТО ЗАМЕР, А НЕ ВКУС. Ячейка полосы — 132px;
 * кнопка `xs` рендерится 12-пиксельным FeatureMono с трекингом, и «apply splitted ▸» меряется в
 * 136px — то есть ПЕРЕНОСИЛАСЬ на вторую строку и стояла выше соседних дверей (F-14, «всё
 * перекосоёбано»). Без стрелки — 121.5px, одна строка, та же высота, что у соседей.
 *
 * ⚠ ОТКАЗ ОДНОЙ СТОРОНЫ НЕ ОСТАНАВЛИВАЕТ ОСТАЛЬНЫЕ, и это тот же выбор, что у двери «fill the
 * empty sides»: батча у глагола верстака нет и не будет (решение сервера), значит выбор между
 * двумя НЕПОЛНЫМИ исходами. Стороны независимы, отказ на `back` не говорит ничего о `side L`, а
 * брошенный цикл оставляет БОЛЬШЕ несогласованного, а не меньше. Отката нет по той же причине:
 * «вернуть как было» — такая же запись, которая может так же отказать.
 */

/** Один кусок разреза, уже привязанный к стороне силуэта. */
export type SplitPiece = { view: SilhouetteView; picture: common_DesignPicture };

/** «Ничего не выбрано» и «завести колорвей» — сентинелы: Radix запрещает пустое значение пункта. */
const APPLY_PROMPT = '__apply__';
const APPLY_NEW_COLOURWAY = '__new_colourway__';

/* `splitDecks` И ТИП `SplitDeck` СНЕСЕНЫ (r3c). Они строили список «склеенный лист + его куски»
   ДЛЯ ЯЧЕЙКИ МУЛЬТИВЬЮ, и ячейка эта своего второго источника не завела: раскрытый лист рисует
   `outputs.tsx` по родословной куска (`cropFamilies` + `piecesOf` там же), потому что
   вопрос там другой — «что показать под ЭТОЙ плиткой», а не «какие листы есть у карточки».
   Читателей не осталось ни одного; экспортированный список, который никто не читает, — это второй
   ответ на вопрос, ждущий, когда он разойдётся с первым. Механизм применения (`applyPlan` ниже и
   `ApplySplitDoor`) на месте: он принимает КУСКИ, а не листы. Живых ссылок на имя не осталось:
   в `bench.tsx` разрез теперь назван своей дверью (`split ▸` в полосе выходов), а само слово
   встречается только в двух записках о сносе — этой и в `outputs.tsx`. */

/** Одна запись плана: что делаем со стороной и что при этом теряем. */
type Step = {
  view: SilhouetteView;
  act: 'place' | 'clear';
  pictureId: number;
  slotRev: number;
  /** Кадр, который сейчас стоит в этой стороне и будет вытеснен или снят. `null` — терять нечего. */
  displaces: common_DesignPicture | null;
};

export function applyPlan(sides: BenchSide[], pieces: SplitPiece[]): Step[] {
  const byView = new Map(pieces.map((p) => [p.view, p.picture]));
  const steps: Step[] = [];
  for (const side of sides) {
    const piece = byView.get(side.view);
    if (piece) {
      steps.push({
        view: side.view,
        act: 'place',
        pictureId: piece.id ?? 0,
        slotRev: side.slotRev,
        displaces: side.picture ?? null,
      });
      continue;
    }
    // Пустую сторону, которой разрез не касается, не трогаем вовсе — см. шапку.
    if (!side.picture) continue;
    steps.push({
      view: side.view,
      act: 'clear',
      pictureId: 0,
      slotRev: side.slotRev,
      displaces: side.picture,
    });
  }
  return steps;
}

/**
 * ДВЕРЬ «APPLY SPLITTED» — кнопка, её строка последствий, вопрос и отчёт.
 *
 * Рисуется ТОЛЬКО когда применять есть что: лист без разреза даёт кнопку, которая нажимается и
 * молчит, а молчащая кнопка читается как сломанная. Вместо неё стоит слово о том, что резать
 * надо сначала (его пишет вызывающий, у своей ячейки).
 */
export function ApplySplitDoor({
  techCardId,
  sidesOf,
  targets,
  pieces,
  disabled,
  /**
   * Как этот экран зовёт то, что кладёт в сторону. ТОЛЬКО СЛОВА вопроса и подсказки: верстак у
   * двери один и спеллится литералом у самой записи (разбор в шапке файла), поэтому этим пропом
   * нельзя переадресовать запись — только назвать её человеку.
   */
  noun,
  refusal = null,
  onCreateColorway,
  className,
  doorClassName,
}: {
  techCardId: number;
  /**
   * Стороны верстака ОДНОЙ цели — функцией, а не списком, потому что целей может быть несколько
   * (семпл-лист при усыновлении). План считается по слотам ВЫБРАННОЙ цели: `expectedSlotRev` из
   * строки соседнего столбца сервер отвергнет («slot is at rev N, M was echoed»).
   */
  sidesOf: (colorwayId: number) => BenchSide[];
  /**
   * ═══ КУДА ЭТОТ РАЗРЕЗ МОЖЕТ ЛЕЧЬ ══════════════════════════════════════════════════════════
   *
   * ОДИН ЧЛЕН — дверь остаётся КНОПКОЙ, и вопроса «куда» нет вовсе: у листа колорвея цель одна
   * (его собственный столбец), у семпл-листа без флага усыновления — тоже одна (`sample`).
   * НЕСКОЛЬКО — та же дверь становится СЕЛЕКТОМ целей, и это по-прежнему ОДИН орган: тот же
   * глагол, тот же вопрос перед записью, тот же отчёт. Пара «селект цели + кнопка apply» была бы
   * двумя кнопками на один жест в ячейке шириной 132px.
   */
  targets: { colorwayId: number; label: string }[];
  pieces: SplitPiece[];
  disabled?: boolean;
  noun: string;
  /**
   * ═══ ОТКАЗ ВЫЗЫВАЮЩЕГО — ДВЕРЬ ПОГАШЕНА, ПРИЧИНА НАПЕЧАТАНА, НА ПРОВОД НЕ УХОДИТ НИЧЕГО ═════
   *
   * Заведён для третьего хозяина этой двери — раскрытой колоды в `outputs.tsx` (Ф4). У него есть
   * два отказа, которых у полос входа нет ПО ПОСТРОЕНИЮ (полоса читает верстак своего же
   * колорвея, лист там чужим быть не может):
   *   · секция выходов не сужена колорвеем — верстака, в который «надо», не существует как факта;
   *   · лист принадлежит ДРУГОМУ колорвею, чем слоты под секцией, — до починки круга 19 дверь
   *     ТИХО ЗАПОЛНЯЛА ЧУЖОЙ ВЕРСТАК (дефект L-1 под другим именем): стороны наполнялись у другого
   *     цвета, экран не менялся, следа не оставалось даже в виде отказа.
   *
   * Отказ решается ВЫЗЫВАЮЩИМ, потому что только он знает, чем сужена его секция; дверь при
   * заданном отказе рисуется `InertDoor` со СТРОКОЙ причины (`Reason`, `reasonVisible`) — колода
   * раскрыта, и исчезнувшая дверь читалась бы как пропажа, а серая без слов — как поломка. Пустой
   * `pieces` при заданном отказе тоже рисуется: причина важнее состава.
   */
  refusal?: string | null;
  /**
   * Завести колорвей прямо отсюда — тем же поповером, что заголовок `+ colourway` в SIDES. Задан
   * только там, где новый столбец законная цель (семпл-лист при усыновлении); `then` зовётся с
   * id созданного, и жест продолжается вопросом уже под ним.
   */
  onCreateColorway?: (then?: (colorwayId: number) => void) => void;
  /** Класс обёртки — хозяин ряда дверей задаёт ячейке свою ширину (`flex-1 min-w-0`). */
  className?: string;
  /** Класс самой кнопки — ряд дверей выходов держит все свои двери одной метрикой (`h-5`, F-9). */
  doorClassName?: string;
}): JSX.Element | null {
  const writes = useDesignWrites(techCardId);
  const [asking, setAsking] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{
    done: SilhouetteView[];
    failed: { view: SilhouetteView; reason: string }[];
  } | null>(null);

  /**
   * ЦЕЛЬ ПО УМОЛЧАНИЮ — ПЕРВАЯ, И ПРИ ОДНОЙ ЦЕЛИ ОНА ЕДИНСТВЕННАЯ. Список пуст только у
   * вызывающего, который сам себе противоречит; тогда писать некуда, и дверь молчит.
   */
  const only = targets.length === 1 ? targets[0].colorwayId : null;
  const planFor = (target: number) => applyPlan(sidesOf(target), pieces);
  const steps = useMemo(
    () => (only === null ? [] : planFor(only)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [only, pieces, sidesOf],
  );

  if (!pieces.length && !refusal) return null;
  if (!targets.length && !refusal) return null;

  /* ОТКАЗ ХОЗЯИНА — дверь стоит, но мертва, и говорит почему. Ни одной записи: `run` ниже
     недостижим, потому что живой кнопки нет. */
  if (refusal) {
    return (
      <InertDoor
        className={cn('[&>button]:w-full', className)}
        label='apply splitted'
        reason={refusal}
        reasonVisible
      />
    );
  }

  const run = async (target: number) => {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    const done: SilhouetteView[] = [];
    const failed: { view: SilhouetteView; reason: string }[] = [];
    for (const step of planFor(target)) {
      try {
        await writes.setBenchSlot.mutateAsync({
          /* Род СПЕЛЛИТСЯ всегда: пустое поле сервер читает как `flat`, и «что бы ни стало
             умолчанием» завтра. И спеллится он ЗДЕСЬ ЛИТЕРАЛОМ, а не пропом: рядом стоит
             `colorwayId` цели, а флэт-верстак колорвея не носит вовсе (инвариант 4) — пара
             `'flat'` + цель≠0 это `colorway_forbidden` от сервера. Разбор в шапке файла. */
          /* ⚠ `slotId` НЕ СТАВИТСЯ ВОВСЕ. `view_key` и `slot_id` — ЧЛЕНЫ ОДНОГО `oneof`, и
             ноль в proto-JSON это ЗАДАННОЕ поле: сервер отвечал «oneof … is already set» и не
             записывал НИ ОДНОЙ стороны. Верстак флэтов всегда слал только `viewKey` — поэтому
             работал он, а эти двери не работали ни разу. */
          slot: { viewKey: step.view, kind: 'render', colorwayId: target },
          pictureId: step.pictureId,
          expectedSlotRev: step.slotRev,
        });
        done.push(step.view);
      } catch (error) {
        // Причина берётся С ОТКАЗА, а не сочиняется: слова сервера («slot_rev mismatch», род
        // кадра, чужой колорвей) — единственное, из чего человек поймёт, повторять ему жест.
        failed.push({
          view: step.view,
          reason: (error as Error)?.message?.trim() || 'the server refused without saying why',
        });
      }
    }
    setBusy(false);
    // Полный успех не рапортуется: он ВИДЕН — стороны заполнились, счётчик сошёлся. Полоса
    // «всё хорошо» под уже случившимся хорошим учит не читать полосы.
    setOutcome(failed.length ? { done, failed } : null);
  };

  /** Начать жест целью: терять нечего — пишем; есть что — сперва вопрос, поимённо по сторонам. */
  const start = (target: number) => {
    if (planFor(target).some((s) => s.displaces)) setAsking(target);
    else void run(target);
  };

  const places = steps.filter((s) => s.act === 'place');
  /** Сколько сторон ТЕРЯЮТ то, что на них стоит. Ровно это и есть разрушительная половина жеста. */
  const losing = steps.filter((s) => s.displaces);
  /** Те же три списка, но для цели, о которой СПРАШИВАЮТ: вопрос и запись читают один план. */
  const askSteps = asking === null ? [] : planFor(asking);
  const askPlaces = askSteps.filter((s) => s.act === 'place');
  const askClears = askSteps.filter((s) => s.act === 'clear');
  const askLosing = askSteps.filter((s) => s.displaces);
  const words = (list: Step[]) => list.map((s) => viewLabel(s.view)).join(', ');
  const placeWords = words(places);
  const losingWords = words(losing);

  return (
    <div className={cn('flex flex-col gap-1', className)} data-apply-split={pieces.length}>
      {/* ═══ ОДНА СТРОКА, ЧТО БЫ НИ СЛУЧИЛОСЬ С ШИРИНОЙ (r2 п.31) ═══════════════════════════════
          Владелец: «APPLY SPLITTED не помещается в кнопку, из-за этого вертикальный скролл в
          блоке». Механизм замерен: в ячейке 132px, где рядом стоит складывающая дверь `▾` (20px),
          подпись ложилась на ВТОРУЮ строку, содержимое перерастало ряд дверей, а полоса выходов
          объявлена `overflow-x-auto` — и по CSS ось, оставленная `visible` рядом с не-`visible`,
          вычисляется в `auto`. То есть перенос ТЕКСТА и рождал вертикальный скролл БЛОКА.
          `whitespace-nowrap` — не косметика, а само лечение: подпись держится одной строкой, ряд
          остаётся ростом в кнопку. Своей ширины и своего роста у двери нет: ширину даёт ячейка
          (`w-full`), рост — метрика `size='xs'`; хозяин ряда сужает поля через `doorClassName`,
          когда соседи отнимают место.
          Потеря названа на самой двери, до нажатия, подсказкой; вопрос — между нажатием и записью. */}
      {only !== null ? (
        <Button
          variant='secondary'
          size='xs'
          className={cn('w-full whitespace-nowrap', doorClassName)}
          loading={busy}
          disabled={disabled}
          data-apply-split-door=''
          data-apply-split-losing={losing.length}
          title={
            losing.length
              ? `${placeWords || 'no side'} take the pieces; ${losingWords} ${losing.length === 1 ? `loses its ${noun}` : `lose their ${noun}s`} — you are asked first`
              : `${placeWords || 'no side'} take the pieces; no side loses anything`
          }
          onClick={() => start(only)}
        >
          apply splitted
        </Button>
      ) : (
        /* ═══ ТА ЖЕ ДВЕРЬ, КОГДА ЦЕЛЕЙ НЕСКОЛЬКО (r3, семпл-лист при усыновлении) ═══════════════
           Выбор цели И ЕСТЬ нажатие: пункт отвечает на «куда», а всё остальное — вопрос о потере,
           запись, отчёт — идёт ровно тем же путём. Отдельной кнопки `apply` рядом нет: два органа
           на один глагол — это ровно то, чего просили не делать («не делай разные кнопки для
           одного и того же»).
           ⚠ АТРИБУТ ВИСИТ НА ОБЁРТКЕ: корень Radix разбирает ЗАКРЫТЫЙ список пропов, `data-*` до
           DOM не доезжает, и утверждение по нему зеленело бы над отсутствующим узлом.

           ⚠ ЛИЦО КОРОЧЕ, И ЭТО ЗАМЕР (r2 п.31, тот же дефект в новом состоянии). В ячейке 132px
           рядом стоит складывающая дверь `▾` (20px), то есть селектору достаётся 110px, а
           «APPLY SPLITTED ▸» меряется в ~142px: подпись ложилась на вторую строку и вылезала за
           коробку — ровно то, на что владелец жаловался. Глагол при этом не потерян: полное
           предложение складывают лицо и пункт («apply ▸» + «into ROSSO»), а `title` называет его
           целиком. `whitespace-nowrap` сторожит, чтобы перенос не вернулся молча. */
        <span
          data-apply-split-door=''
          data-apply-split-targets={targets.length}
          title='apply this split into the sides of one colourway'
          className='flex w-full'
        >
          <SelectComponent
            name={`apply-split-${techCardId}-${pieces.length}`}
            value={APPLY_PROMPT}
            placeholder='apply ▸'
            disabled={disabled || busy}
            className={cn(
              'h-5 min-h-0 whitespace-nowrap py-0 text-micro uppercase tracking-label',
              doorClassName,
            )}
            items={[
              { value: APPLY_PROMPT, label: 'apply ▸' },
              ...targets.map((t) => ({
                value: String(t.colorwayId),
                label: `into ${t.label}`,
              })),
              ...(onCreateColorway ? [{ value: APPLY_NEW_COLOURWAY, label: '+ colourway…' }] : []),
            ]}
            onValueChange={(value: string) => {
              if (!value || value === APPLY_PROMPT) return;
              if (value === APPLY_NEW_COLOURWAY) {
                onCreateColorway?.((created) => start(created));
                return;
              }
              start(Number(value));
            }}
            fullWidth
          />
        </span>
      )}

      {/* ═══ ВОПРОС ПЕЧАТАЕТ ОБЩИЙ ОРГАН (Ф4) ═══════════════════════════════════════════════════
          `AskModal` из `../core` — ОДИН принтер разрушительного вопроса на всю студию. Он только
          рисует: числа и имена сторон посчитаны ВЫШЕ, `applyPlan`, — тем же кодом, что исполняет
          жест, — и читаются вопросом и записью из одного `steps`. Второго калькулятора здесь нет.
          Текст вопроса — посимвольно прежний. `note={null}`: строка «there is no undo» здесь была
          бы ложью — вопрос сам говорит, что ничего не удаляется и всё можно вернуть по стороне.
          ⚠ `sentence` встаёт ВНУТРЬ `<Text component='p'>` органа, поэтому два абзаца — это два
          блочных `span`, а не два `p`: `p` внутри `p` браузер разрывает. */}
      <AskModal
        open={asking !== null}
        onClose={() => setAsking(null)}
        title='replace the whole input with this split?'
        verb='replace the input'
        note={null}
        onDo={() => {
          const target = asking;
          setAsking(null);
          if (target !== null) void run(target);
        }}
        sentence={
          <>
            <span className='block normal-case'>
              {targets.length > 1 && asking !== null && (
                <>
                  the sides of{' '}
                  <b>{targets.find((t) => t.colorwayId === asking)?.label ?? asking}</b> are the
                  ones that change.{' '}
                </>
              )}
              {askPlaces.length > 0 && (
                <>
                  <b>{words(askPlaces)}</b> take the pieces of this split.{' '}
                </>
              )}
              {askClears.length > 0 && (
                <>
                  <b>{words(askClears)}</b> {askClears.length === 1 ? 'is' : 'are'} emptied — the
                  split does not name {askClears.length === 1 ? 'that side' : 'those sides'}.
                </>
              )}
            </span>
            <span className='mt-2 block normal-case'>
              {askLosing.length} of the four sides {askLosing.length === 1 ? 'holds a' : 'hold a'}{' '}
              {noun} right now, and {askLosing.length === 1 ? 'it goes' : 'they go'} out of the
              input: {words(askLosing)}. Nothing is deleted — every picture stays on the card and
              can be put back one side at a time.
            </span>
          </>
        }
      />

      {/* ⚠ ОТЧЁТ ОБ ОТКАЗЕ СТОИТ В КОЛОНКЕ ШИРИНОЙ 132px, И ЭТО ОПРЕДЕЛЯЕТ ЕГО ФОРМУ (F-14).
          Здесь стояли четыре предложения в `CalloutBox` — на ячейке полосы они вставали красной
          стеной ВЫШЕ САМОГО КАДРА и разносили нижние края соседних дверей. Ровно этот блок
          владелец и приложил снимком к F-11.
          Разбор тот же, что у соседнего экрана, который вынес свой отчёт НАД полосой: сюда его
          вынести нельзя — дверь живёт внутри чужой ячейки и хозяина у неё нет. Поэтому здесь
          сокращена НЕ ПРАВДА, А ЕЁ ИЗЛОЖЕНИЕ: число и стороны видны глазом, полный разбор
          (причина сервера по каждой стороне и почему ничего не откачено) — в `title`, там же, где
          его ищут, когда решают, что делать дальше. */}
      {outcome && (
        <CalloutBox tone='error'>
          <Text
            size='micro'
            component='p'
            className='normal-case'
            title={`${outcome.failed
              .map((f) => `${viewLabel(f.view)} — ${f.reason}`)
              .join('; ')}. Nothing was undone: the sides are separate slots, and taking a good one back would be another write that can fail in its turn. Press the door again — it reads the bench afresh.`}
          >
            <b>
              {outcome.done.length} of {outcome.done.length + outcome.failed.length} written.
            </b>{' '}
            {outcome.failed.map((f) => viewLabel(f.view)).join(', ')} failed — press again.
          </Text>
        </CalloutBox>
      )}
    </div>
  );
}
