import type { JSX, ReactNode } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { InertDoor } from '../bench-slot';
import { serverSpeaksDesign } from '../capability';
import type { Gate } from './model';

/**
 * THE GENERATE ROW — one button, one refusal, one money line, on both generative screens.
 *
 * WHY THE PRICE IS NOT ON IT. The prototype prints `3 pictures · $0.06 · ~40 s`, because the
 * prototype owns a price list. This admin does not and cannot: `price_estimate` and `price_actual`
 * are OUTPUT-ONLY on a run — the server reserves against the day at dispatch — and no field on the
 * wire carries the price of a run that has not been asked for yet. So the line states the SHAPE of
 * what is about to be asked for (how many pictures, of which revision) and says plainly that the
 * money is settled at start. A number invented on the client would be wrong the first time a tariff
 * moved, and wrong silently.
 *
 * THE REFUSAL IS A CONTROL, NOT AN ABSENCE. A gate that fails renders the button as an `InertDoor`
 * carrying its reason, which is the wave's rule and the reason the strip above it exists at all: a
 * missing button teaches «this admin has no renders», a dead one with a reason teaches «front is
 * empty», and only the second is true.
 *
 * ═══ ДНЕВНОГО ПОТОЛКА НЕТ — НИ КАК ЧИСЛА, НИ КАК ЗАПРЕТА ═════════════════════════════════════
 *
 * Двумя кругами это уходило в два приёма, и второй отменяет первый.
 *
 * КРУГ 4 (T-12) снял ЧИСЛА: «today US$0.4074 of US$2.00 — нам надо показывать только цену
 * генерации и все». Полоса `today $x of $y` печаталась ровно здесь. Тогда осталась одна фраза без
 * сумм — «today’s generation ceiling is reached», — потому что при исчерпанном дне `GENERATE`
 * всё равно была мертва и молчащий экран читался бы как поломка.
 *
 * ТЕПЕРЬ СНЯТ САМ ПОТОЛОК: «у нас в принципе не должно быть потолка похуй чем он съеден убери
 * потолок». Сервер снёс колонку, оба отказа и повод `budget_exceeded`; `DesignBudget.cap` стал
 * `reserved 4`. Фраза ушла ВМЕСТЕ с состоянием, которое она называла, — а не осталась висеть
 * условием, которое никогда не истинно. Строка про деньги на этом ряду теперь ровно одна и всегда
 * одна и та же: `{shape} · priced by the server when the run starts`.
 *
 * НИЧЕГО НА ЕЁ МЕСТО НЕ ВСТАЛО, И ЭТО ТОЖЕ ПО СЛОВУ ВЛАДЕЛЬЦА. Дневная сумма без потолка не
 * отвечает ни на один вопрос, который человек задаёт на этом экране: решение он принимает по цене
 * ПРОГОНА, и она обещана здесь же, а называется на строке прогона в истории. Число, по которому
 * никто не действует, в этой системе — украшение.
 *
 * ═══ ПЯТЫЙ И ЧЕТВЁРТЫЙ ЭКРАНЫ ТЕПЕРЬ ТОЖЕ ЗДЕСЬ, А НЕ «ТАКИЕ ЖЕ» ════════════════════════════
 *
 * Владелец: «в PATTERN - MAKE A PATTERN сделай кнопку генерейт такого же размера как на флет
 * генерации вообще везде сделай ее одинаковой и логику и отступы». Круг 18 свёл метрику ЗНАЧЕНИЯМИ:
 * `pattern-studio` и `generation-form` рисовали ЭТУ ЖЕ разметку руками — тот же `py-1`, та же
 * `Button main sm`, та же `InertDoor … size='sm'`, та же подмена подписи на `starting…`. Пять рядов
 * совпадали ПО СОВПАДЕНИЮ: правка любого из них разъезжалась бы молча, и разъезд увидел бы только
 * тот, кто держит два экрана рядом.
 *
 * Теперь ряд один на все пять. РАЗНОЕ У НИХ — ТОЛЬКО ХВОСТ, и он стал щелью (`trailing`), а не
 * поводом форкнуть ряд: у трёх экранов хвост стандартный (дверь описи + одна строка про деньги,
 * печатается, когда экран НАЗВАЛ `shape`), у плитки и у флэта он свой — они называют состав
 * запроса СВОИМИ словами и своими пробами (`data-probe='payload'`, `outputsLine`), и подменять их
 * общей фразой значило бы потерять то, ради чего эти строки писались.
 */
export function GenerateRow({
  gate,
  /**
   * What is about to be asked for, in the shape the human can check: «3 pictures · one per side».
   *
   * НЕОБЯЗАТЕЛЕН, И ЭТО НЕ ПОСЛАБЛЕНИЕ. Он включает СТАНДАРТНЫЙ ХВОСТ ряда (дверь описи + строка
   * про деньги). Экран, который называет свой состав сам — через `trailing`, — молчит здесь
   * нарочно: две строки про один и тот же запрос в шести пикселях друг от друга это ровно то, от
   * чего уходит весь круг.
   */
  shape,
  pending,
  disabled,
  onGenerate,
  /**
   * Open the prompt inventory for THIS screen. Supplied by both generative studios; when a composer
   * does not hand it in, the door stays inert WITH ITS REASON rather than vanishing.
   */
  onInspect,
  /**
   * Хвост ряда, когда экран называет состав запроса сам. Стоит ПОСЛЕ стандартного хвоста, а не
   * вместо него: экран волен и назвать `shape`, и дописать своё — порядок при этом остаётся один
   * и тот же на всех пяти рядах.
   */
  trailing,
}: {
  gate: Gate;
  shape?: string;
  pending?: boolean;
  disabled?: boolean;
  onGenerate: () => void;
  onInspect?: () => void;
  trailing?: ReactNode;
}): JSX.Element {
  const speaks = serverSpeaksDesign();

  const frozen = disabled
    ? 'this card is read-only for you — a run spends money, so it is one of the writes that stops here'
    : !speaks
      ? 'this server does not serve the design band, so there is nothing to start a run on'
      : null;

  return (
    <div className='flex flex-wrap items-center gap-2 py-1'>
      {/* ⚠ ОДНА ДВЕРЬ НА ЧЕТЫРЁХ ЭКРАНАХ — ОДНА МЕТРИКА И ОДНА ЛОГИКА ОЖИДАНИЯ (F-1).
          Владелец: «сделай кноку генерейт такого же размера как на флет генерации вообще везде
          сделай ее одиаковой и логику и отступы».

          Двери отказа теперь `sm` — размер живой кнопки, которую они собой заменяют (разбор у
          `InertDoor`).

          А `loading` СНЯТ, и это не косметика: `Loader` типа `default` — это полоса шириной
          175px с отступом `p-2`, и она встаёт ВМЕСТО надписи. Кнопка на 70px раздувалась до
          двухсот в тот момент, когда по ней нажали, — то есть ряд перекладывался ровно под
          курсором. Флэт-генерация, которую владелец назвал образцом, всегда делала иначе: коробка
          остаётся, меняется слово. Здесь теперь то же самое. */}
      {frozen ? (
        <InertDoor label='GENERATE' reason={frozen} size='sm' />
      ) : gate.ok ? (
        <Button variant='main' size='sm' onClick={onGenerate} disabled={pending}>
          {pending ? 'starting…' : 'GENERATE'}
        </Button>
      ) : (
        <InertDoor label='GENERATE' reason={gate.reason} size='sm' />
      )}

      {/* ═══ СТАНДАРТНЫЙ ХВОСТ — ТОЛЬКО ТОМУ, КТО НАЗВАЛ `shape` ══════════════════════════════
          Условие стоит на ПАРЕ (дверь описи + строка про деньги), а не на каждом органе по
          отдельности, потому что это один хвост: экран либо говорит о запросе стандартными
          словами, либо своими (`trailing`). Полумера — своя строка состава ПЛЮС инертная дверь
          «what the model gets ▸» с поводом «этот экран смонтировали без панели описи» — была бы
          прямой ложью на плитке: у неё панели нет НАРОЧНО, весь её состав — две строки, и они
          напечатаны рядом. */}
      {shape === undefined ? null : (
        <>
          {/* THE PROMPT INVENTORY DOOR, AND IT IS LIVE ON BOTH GENERATIVE SCREENS.
              It used to be inert, on the ground that the prompt is assembled server-side from a
              PROFILE this client cannot read. That sentence is true and it is still printed — at
              the head of the panel itself. What it never justified was hiding the payload: the
              profile is the wrapper, and everything it wraps around (which plates go in, which
              colour rides with them, which renders a turntable turns, and what is NOT sent at all)
              is on this card and is knowable exactly. A person about to spend money on two screens
              out of three was being asked to do it blind. */}
          {onInspect ? (
            <Button variant='secondary' size='xs' onClick={onInspect}>
              what the model gets ▸
            </Button>
          ) : (
            <InertDoor
              label='what the model gets ▸'
              reason='this screen was mounted without the inventory panel — it lists what the card contributes to the run, and the composer did not hand it in'
            />
          )}

          {/* ОДНА СТРОКА ПРО ДЕНЬГИ. Справа от неё стояла фраза про исчерпанный день; дня-потолка
              больше нет, и `data-probe` держится на самой строке, чтобы проба спрашивала орган,
              который экран действительно рисует, а не тот, которого не стало. */}
          <Text
            size='micro'
            variant='label'
            component='span'
            data-probe='run-price'
            className='min-w-0'
          >
            {shape} · priced by the server when the run starts
          </Text>
        </>
      )}

      {trailing}
    </div>
  );
}

/**
 * The bar of ways out under a locked screen — the prototype's `lockbar`.
 *
 * ═══ ЗАГОЛОВОК СНЯТ, ПОВОД ВЕРНУЛСЯ: ВЛАДЕЛЕЦ НАЗВАЛ ОДИН БЛОК, А НЕ ОБА ОРГАНА ════════════════
 *
 * Владелец, круг 17, дословно и целиком: «убери текст "WHAT IS MISSING no fabric render stands on
 * this card yet — make one in FABRIC RENDER, then put its sides into FABRIC RENDER SLOTS. 3D is
 * built from those four sides and from nothing else"». Это ОДИН экземпляр — жирный заголовок плюс
 * простыня отказа `next: 'render'`, — и он подавлен отдельно и по имени
 * (`threed-input-strip.tsx`, ветка `lock.next !== 'render'`).
 *
 * ⚠ ПРЕДЫДУЩАЯ ВОЛНА ПРОЧЛА ЭТО КАК «СНЕСТИ ЗАГОЛОВОК И ПОВОД ЦЕЛИКОМ», И ДОВОД БЫЛ ПОСТРОЕН НА
 * НЕВЕРНОМ ЧТЕНИИ РОДИТЕЛЬСКОГО КОММИТА. Он утверждал, что поле `reason` «стояло в типе,
 * ПРИНИМАЛОСЬ и не читалось (деструктуризации нет ни строчкой)» и что «полоса не печатала повод уже
 * до этой правки». Проверено `git show a9470fe7:…/generate-row.tsx`: подпись была
 * `LockBar({ reason, children }: { reason: string; children?: React.ReactNode })` — поле
 * ДЕСТРУКТУРИРОВАЛОСЬ и рисовалось строкой `<Text size='micro' …>{reason}</Text>` под жирным
 * `what is missing`; раннего возврата `if (!children) return null` в том коммите НЕ БЫЛО ВОВСЕ, он
 * появился этой же волной. То есть снос забрал не хвост, а работающий орган.
 *
 * ЦЕНА СНОСА, ЗАМЕРЕННАЯ ПО ЭКРАНАМ. Два отказа НАЗЫВАЮТ ТО, ЧЕГО НА ЭКРАНЕ НЕТ БОЛЬШЕ НИГДЕ:
 *   · `next: 'refill'` печатает НОМЕРА РЕВИЗИЙ («this bench mixes r3 and r7 … Re-fill the odd
 *     sides») — без него на экране остаётся одна дверь `re-fill the odd sides ▸`, а `r3` и `r7` не
 *     встречаются ни в одной подписи полосы;
 *   · `next: 'front-slot'` объясняет, почему обязателен именно ФРОНТ, — по ячейкам это не читается.
 * И на 3D `gate` умеет отказать по МЕНЮ, а не по входу («say what body it sits on…»): такой отказ
 * несла ТОЛЬКО эта полоса, а инертная дверь `GENERATE` держит его как `title`/`data-inert`, то есть
 * по наведению. Это был единственный экран, где кнопка гасла без единой видимой причины.
 *
 * ЧТО ИМЕННО ВЕРНУЛОСЬ. ПОВОД — ОДНОЙ КОРОТКОЙ СТРОКОЙ В МЕТРИКЕ РЯДА (`micro`/`label`), в одном
 * ряду со своими дверями. ЗАГОЛОВОК `what is missing` НЕ ВЕРНУЛСЯ и не вернётся: это ровно та
 * половина, которую владелец назвал, и жирный ярлык над одной строкой к тому же говорил бы вторым
 * голосом то, что уже сказано местом.
 *
 * ПУСТАЯ ПОЛОСА НЕ РИСУЕТСЯ ВОВСЕ, И РАННИЙ ВОЗВРАТ ОСТАЁТСЯ — но теперь он спрашивает ОБА члена.
 * Зов без дверей И без повода — это коробка с отступами, которая ничего не говорит и никуда не
 * ведёт; зов с одним поводом (полоса причин меню на 3D) законен и рисует ровно строку.
 */
export function LockBar({
  /**
   * ПОЧЕМУ ЗАКРЫТО — словами, на экране, а не по наведению. Необязателен: у полосы бывает работа и
   * без него (ряд дверей под отказом, который сам себя объясняет ячейками), и тогда она рисует
   * только двери — ровно как рисовала.
   */
  reason,
  children,
}: {
  reason?: string;
  children?: React.ReactNode;
}) {
  if (!children && !reason) return null;

  // `CalloutBox`, NOT A BORDERED DIV. A block never contains another block in this system; an
  // inline message with a 1px edge and no fill is the one shape that is allowed inside one, and it
  // is already a primitive. Hand-rolling the same border here is how the box-in-box rule gets lost.
  return (
    <CalloutBox tone='note'>
      {/* ЯКОРЬ ОБЪЯВЛЕН, потому что отказ НАЗЫВАЕТ ЧИСЛА, а числа встречаются и на плитках рядом.
          Утверждение «отказ говорит про r3 и r7», сделанное по тексту всей страницы, зеленело бы
          от подписей сторон — то есть сторожило бы не тот орган. */}
      <div data-lock-reason className='flex flex-wrap items-center gap-2'>
        {reason && (
          /* ОДНА СТРОКА В МЕТРИКЕ РЯДА, А НЕ АБЗАЦ. `flex-1` с `min-w-0` даёт ей остаток строки и
             разрешает перенос, не выталкивая двери на следующую: `items-center` ряда держит их на
             одной линии с ней. `normal-case` — потому что это предложение, а не ярлык
             (DESIGN.md §3, «The Uppercase-Is-A-Label Rule»). */
          <Text
            size='micro'
            variant='label'
            component='span'
            className='min-w-0 flex-1 normal-case'
          >
            {reason}
          </Text>
        )}
        {children}
      </div>
    </CalloutBox>
  );
}
