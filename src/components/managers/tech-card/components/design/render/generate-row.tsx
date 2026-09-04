import type { JSX } from 'react';
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
 */
export function GenerateRow({
  gate,
  /** What is about to be asked for, in the shape the human can check: «3 pictures · one per side». */
  shape,
  pending,
  disabled,
  onGenerate,
  /**
   * Open the prompt inventory for THIS screen. Supplied by both generative studios; when a composer
   * does not hand it in, the door stays inert WITH ITS REASON rather than vanishing.
   */
  onInspect,
}: {
  gate: Gate;
  shape: string;
  pending?: boolean;
  disabled?: boolean;
  onGenerate: () => void;
  onInspect?: () => void;
}): JSX.Element {
  const speaks = serverSpeaksDesign();

  const frozen = disabled
    ? 'this card is read-only for you — a run spends money, so it is one of the writes that stops here'
    : !speaks
      ? 'this server does not serve the design band, so there is nothing to start a run on'
      : null;

  return (
    <div className='flex flex-wrap items-center gap-2 pt-1'>
      {frozen ? (
        <InertDoor label='generate' reason={frozen} />
      ) : gate.ok ? (
        <Button variant='main' size='sm' onClick={onGenerate} loading={pending}>
          GENERATE
        </Button>
      ) : (
        <InertDoor label='generate' reason={gate.reason} />
      )}

      {/* THE PROMPT INVENTORY DOOR, AND IT IS LIVE ON BOTH GENERATIVE SCREENS.
          It used to be inert, on the ground that the prompt is assembled server-side from a PROFILE
          this client cannot read. That sentence is true and it is still printed — at the head of
          the panel itself. What it never justified was hiding the payload: the profile is the
          wrapper, and everything it wraps around (which plates go in, which colour rides with them,
          which renders a turntable turns, and what is NOT sent at all) is on this card and is
          knowable exactly. A person about to spend money on two screens out of three was being
          asked to do it blind. */}
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

      {/* ОДНА СТРОКА ПРО ДЕНЬГИ, БЕЗУСЛОВНАЯ. Справа от неё стояла фраза про исчерпанный день;
          дня-потолка больше нет, и `data-probe` держится на самой строке, чтобы проба спрашивала
          орган, который экран действительно рисует, а не тот, которого не стало. */}
      <Text
        size='micro'
        variant='label'
        component='span'
        data-probe='run-price'
        className='min-w-0'
      >
        {shape} · priced by the server when the run starts
      </Text>
    </div>
  );
}

/**
 * The «what is missing» bar of a locked screen — the prototype's `lockbar`.
 *
 * It repeats the gate's reason under the input strip rather than only inside the disabled button,
 * because the reason is about the INPUTS and the inputs are what the eye is on at that moment. The
 * ways out ride with it: the two doors that would produce the missing thing.
 */
export function LockBar({ reason, children }: { reason: string; children?: React.ReactNode }) {
  // `CalloutBox`, NOT A BORDERED DIV. A block never contains another block in this system; an
  // inline message with a 1px edge and no fill is the one shape that is allowed inside one, and it
  // is already a primitive. Hand-rolling the same border here is how the box-in-box rule gets lost.
  return (
    <CalloutBox tone='note'>
      {/* ЯКОРЬ ОБЪЯВЛЕН, потому что отказ НАЗЫВАЕТ ЧИСЛА, а числа встречаются и на плитках рядом.
          Утверждение «отказ говорит про r3 и r7», сделанное по тексту всей страницы, зеленело бы
          от подписей сторон — то есть сторожило бы не тот орган. */}
      <div data-lock-reason className='flex flex-wrap items-center gap-2'>
        <Text
          size='micro'
          variant='uppercase'
          tracking='label'
          component='span'
          className='font-bold text-textColor'
        >
          what is missing
        </Text>
        <Text size='micro' component='span' className='min-w-0 flex-1'>
          {reason}
        </Text>
        {children}
      </div>
    </CalloutBox>
  );
}
