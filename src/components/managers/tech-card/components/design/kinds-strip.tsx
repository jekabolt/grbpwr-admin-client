import type { GetDesignBandResponse } from 'api/proto-http/admin';

/** Три представления, между которыми переключается студия. `state.kind` прототипа. */
export type DesignKind = 'flat' | 'render' | 'threed';
import { cn } from 'lib/utility';
import { useState, type JSX } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';
import Tooltip, { TooltipProvider } from 'ui/components/tooltip';

import { fabricRenderGate } from './render';

/**
 * THE STRIP OF REPRESENTATIONS — the four ways this card's design can exist as a picture, plus the
 * prompt profile that would drive the ones that are drawn rather than photographed.
 *
 * It is a POLOSA, not a block: the strip is its own surface (border + white fill, ruled internally
 * with hairlines), so it is never wrapped in a `Section` — see DESIGN.md → «tiles, boards and
 * strips are already their own surfaces».
 *
 * WHY THREE OF THE FOUR ARE DEAD, AND WHY THEY ARE STILL ON SCREEN.
 * The generative machine is CUT in this wave — not postponed behind a flag, cut for measured
 * reasons: the backend has no parsing of pictures out of a model's answer at all, there is no 3D
 * provider, and the 4 MiB answer ceiling is smaller than a single base64 PNG. A control that
 * cannot work has exactly two honest shapes: absent, or present WITH ITS REASON. Absent was
 * rejected because the four representations are the vocabulary of the band — a technologist who
 * cannot see «fabric render» on the strip does not conclude «not yet», he concludes «this admin
 * does not have renders», and then goes looking for them in the wrong place.
 *
 * So the reason is a first-class value here, carried on `data-inert` and spoken twice: on hover as
 * a footnote, and on click as a note that STAYS until it is dismissed. This strip is the only
 * carrier of `data-inert` in the wave, which is precisely why it could not be dropped from it.
 *
 * THE REASONS ARE WRITTEN FOR A TECHNOLOGIST. Not «no image parser in the gateway» — that is our
 * problem, not his. Each one says what cannot be done here and what he can do INSTEAD, because a
 * dead end with a way round it is a working screen and a dead end without one is a bug report.
 */

/** What a dead representation says when it is asked. Sentence case: this is prose, not a label. */
const INERT_REASON = {
  onModel:
    'On-model pictures are not made on this card. Shoot the garment or take the picture from the ' +
    'shoot, and bring the file in through the slot it belongs to.',
  profile:
    'Prompt profiles are server configuration, not a card field — there is nothing to pick here and ' +
    'nothing on this card would read it. A profile is changed by whoever keeps the server settings.',
} as const;

type InertKey = keyof typeof INERT_REASON;

/**
 * The cell metrics, shared so the live cell and the dead ones sit on exactly one baseline. NOTE
 * that this carries NO flex sizing: the four representations share the strip (`SHARE`) and the
 * profile is pushed to the far end at its own width (`ASIDE`), and mixing the two into one string
 * would leave twMerge to pick a winner between them.
 */
const CELL = 'flex min-w-0 flex-col gap-0.5 px-2.5 py-2 text-left';
/**
 * `flex-1` — grow, shrink AND a zero basis — is load-bearing, and BOTH halves of it are.
 *
 * Without `min-w-0` a `<button>` in a flex strip is measured by its own content, so the cell with
 * the longest sub-line pushes past its share and lies over its neighbour. But a zero basis WITHOUT
 * grow is the same bug mirrored: the cell collapses to nothing and its label wraps one letter per
 * line, which is what this strip actually did until a screenshot showed it. Neither failure is
 * visible to a check that reads text — `innerText` returns the same string at every width.
 */
const SHARE = 'flex-1';
/** The profile sits at the far end, at its own width — it is a setting, not a representation. */
const ASIDE = 'ml-auto shrink-0 grow-0';
function RepCell({
  name,
  sub,
  active,
  inert,
  onInert,
  onSelect,
  dimmed,
  className,
}: {
  name: string;
  sub: string;
  active?: boolean;
  inert?: string;
  onInert?: () => void;
  /** Представление, которое МОЖНО открыть. Активное его не получает: там уже находятся. */
  onSelect?: () => void;
  /**
   * ПРЕДСТАВЛЕНИЕ, ДО КОТОРОГО КАРТОЧКА ЕЩЁ НЕ ДОШЛА — причина, а не булево.
   *
   * Отличается от `inert` ровно тем, чем «рано» отличается от «здесь не делается»: приглушённая
   * ячейка ОТКРЫВАЕТСЯ (там стоит собственная полоса «чего не хватает» с выходами), но перестаёт
   * читаться как равноправная соседка. Настоящий запрет живёт на сервере — `StartDesignRun`
   * отказывает `threed` без непрятанного fabric render, — и подменять его клиентской блокировкой
   * нельзя: обходится перезагрузкой вкладки, а платит владелец.
   */
  dimmed?: string;
  className?: string;
}) {
  const body = (
    <>
      <Text
        size='micro'
        variant='uppercase'
        tracking='label'
        component='span'
        className={cn(
          'font-bold',
          active ? 'text-bgColor' : dimmed ? 'text-labelColor' : 'text-textColor',
        )}
      >
        {name}
      </Text>
      <Text
        size='micro'
        component='span'
        className={cn('break-words', active ? 'text-bgColor' : 'text-labelColor')}
      >
        {sub}
      </Text>
    </>
  );

  // The live, current representation is NOT a control: it is where you already are. A button that
  // does nothing when pressed is the very thing this strip exists to avoid.
  if (!inert) {
    // ТЕКУЩЕЕ представление — не контрол: здесь уже находятся, и кнопка, ничего не делающая по
    // нажатию, — ровно то, ради чего эта полоса и написана.
    if (active || !onSelect) {
      return (
        <div
          aria-current={active ? 'true' : undefined}
          className={cn(CELL, active && 'bg-textColor', className)}
        >
          {body}
        </div>
      );
    }
    if (dimmed) {
      // ПРИЧИНА — ЗНАЧЕНИЕ, А НЕ ОФОРМЛЕНИЕ. Она читается человеком через подсказку и пробой через
      // атрибут: приглушённый цвет сам по себе ничего не доказывает и на монохромной печати
      // исчезает вовсе, поэтому рядом с ним всегда стоит слово (`sub` несёт «locked»).
      return (
        <Tooltip
          side='bottom'
          align='start'
          className='max-w-[320px] normal-case'
          trigger={
            <button
              type='button'
              data-locked={dimmed}
              onClick={onSelect}
              className={cn(CELL, 'hover:bg-bgSecondary', className)}
            >
              {body}
            </button>
          }
        >
          {dimmed}
        </Tooltip>
      );
    }
    return (
      <button
        type='button'
        onClick={onSelect}
        className={cn(CELL, 'hover:bg-bgSecondary', className)}
      >
        {body}
      </button>
    );
  }

  return (
    <Tooltip
      side='bottom'
      align='start'
      className='max-w-[320px] normal-case'
      trigger={
        <button
          type='button'
          // THE CARRIER OF THE REASON. Read by a human through the tooltip and the note below, and
          // by a probe through the attribute — a dead control that cannot be told apart from a
          // live one is how «it does nothing» ships unnoticed.
          data-inert={inert}
          // NO `aria-disabled` EITHER, and that is not an oversight. `aria-disabled` announces
          // «unavailable», which is only half of what is true here: the representation cannot be
          // made, but the CONTROL is live and answers when pressed. Marking it disabled tells a
          // screen-reader user not to press the one thing that would explain the situation to
          // him — and it makes every automated driver skip it as unactionable, so a probe can no
          // longer prove the reason arrives.
          onClick={onInert}
          className={cn(
            CELL,
            // NOT `disabled`: a disabled button takes no hover, no focus and no click, so the
            // reason would have no way to reach anybody. It stays reachable and answers instead.
            'cursor-help focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor',
            className,
          )}
        >
          {body}
        </button>
      }
    >
      {inert}
    </Tooltip>
  );
}

export function KindsStrip({
  band,
  kind = 'flat',
  onKindChange,
}: {
  band: GetDesignBandResponse;
  /** Какое представление на экране. Прототип держит это в `state.kind`. */
  kind?: DesignKind;
  onKindChange?: (kind: DesignKind) => void;
}): JSX.Element {
  const form = useFormContext();
  // The reason last asked for, kept until it is dismissed. A toast would take the answer away
  // again while the eye was still on the control that raised the question.
  const [asked, setAsked] = useState<InertKey | null>(null);

  // THE ONE LIVE READING. `latestVersion` unset is honestly «no version yet» and never «version 0»
  // — the wire says so in as many words — so the two states are worded, not numbered.
  const version = band.latestVersion;
  const rev = version?.versionNumber ?? 0;
  // ЧИСЛО УКАЗАНИЙ — ЖИВОЕ, А НЕ ЗАМОРОЖЕННОЕ. Стояло `version.callouts.length`, то есть копия,
  // снятая в момент минта. Это расходится и с прототипом (`repsStripHtml` считает
  // `state.callouts.length`), и с доктриной самой вкладки ARTIFACTS: версия морозит СОСТАВ ПЛИТ,
  // а указания не морозятся — бумага печатает те, что карточка держит сейчас. Со старым чтением
  // полоса называла бы прежнее число ещё долго после того, как технолог добавил выноску.
  const calloutCount = ((useWatch({ control: form.control, name: 'callouts' }) as unknown[]) ?? [])
    .length;
  // Прототип (`repsStripHtml`) подписывает представление ЧИСЛОМ его картинок, а не словами
  // «не делается здесь»: полоса отвечает на вопрос «сколько их уже есть».
  const pictures = (band.runs ?? []).flatMap((r) => r.pictures ?? []);
  const renders = pictures.filter((p) => p.kind === 'render' && !p.hiddenAt).length;
  const turns = pictures.filter((p) => p.kind === 'threed' && !p.hiddenAt).length;
  const renderSub = renders ? `${renders} render${renders === 1 ? '' : 's'}` : 'none yet';
  /**
   * ═══ ПОСЛЕДОВАТЕЛЬНОСТЬ ФЛЭТЫ → РЕНДЕР → 3D, ВИДНАЯ НА ПОЛОСЕ (W-13) ════════════════════════
   *
   * Ворота работали и раньше — дословно, в самой студии 3D: пустая сторона рисует ячейку «required
   * · blocks 3D», под полосой стоит бар «чего не хватает» с двумя выходами, а GENERATE — мёртвая
   * дверь с причиной. Чего не было — СИГНАЛА В ПОЛОСЕ: три представления читались как три
   * равноправные вкладки, и «3d · none yet» ничем не отличалось от «fabric render · none yet»,
   * хотя одно из них означает «ещё не просили», а второе — «нельзя просить».
   *
   * ПРИЧИНА БЕРЁТСЯ ИЗ ОТВЕТА ПОЛОСЫ, А НЕ ВЫЧИСЛЯЕТСЯ ЗАНОВО. `has_fabric_render` — зеркало ровно
   * того гейта, которым отказывает `StartDesignRun`; клиент, пересчитавший правило по выданной ему
   * СТРАНИЦЕ ленты, ошибся бы ровно на те рендеры, которых на странице нет, — а это обычный случай
   * для карточки с историей. Тогда дверь нарисовалась бы открытой, а прогон получил бы отказ.
   *
   * ЭТО ПОДСКАЗКА, А НЕ ЗАЩИТА, и путать их нельзя. Ячейка остаётся ОТКРЫВАЕМОЙ: за ней стоит
   * экран, который подробно объясняет, чего не хватает, и предлагает выходы, — закрыть его значило
   * бы спрятать единственное место, где это написано. Настоящий отказ живёт и будет жить на
   * сервере. Клиентская блокировка обходится перезагрузкой вкладки, а платит за прогон владелец.
   */
  const gate = fabricRenderGate(band);
  const threedLocked = gate.ok ? null : gate.reason;
  const threedSub = turns
    ? `${turns} turntable${turns === 1 ? '' : 's'}`
    : threedLocked
      ? 'locked — renders first'
      : 'none yet';
  const sheetSub =
    rev > 0
      ? `v${rev} · ${calloutCount} callout${calloutCount === 1 ? '' : 's'}`
      : 'draft — no version yet';

  return (
    <div>
      <TooltipProvider>
        <div className='flex items-stretch border border-borderColor bg-bgColor'>
          {/* ТРИ ПРЕДСТАВЛЕНИЯ ТЕПЕРЬ ПЕРЕКЛЮЧАЮТСЯ, и это не косметика: за «fabric render» и «3d»
              появились настоящие экраны, а до них полоса честно говорила «не делается здесь». Та
              причина протухла в тот момент, когда экраны приехали, и оставить её значило бы врать
              ровно тем текстом, который был написан, чтобы не врать. */}
          <RepCell
            name='flat — sheet'
            sub={sheetSub}
            active={kind === 'flat'}
            onSelect={onKindChange && (() => onKindChange('flat'))}
            className={SHARE}
          />
          <RepCell
            name='fabric render'
            sub={renderSub}
            active={kind === 'render'}
            onSelect={onKindChange && (() => onKindChange('render'))}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='3d'
            sub={threedSub}
            active={kind === 'threed'}
            dimmed={threedLocked ?? undefined}
            onSelect={onKindChange && (() => onKindChange('threed'))}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='on model'
            sub='not made here'
            inert={INERT_REASON.onModel}
            onInert={() => setAsked('onModel')}
            className={cn(SHARE, 'border-l border-hairline')}
          />
          <RepCell
            name='prompt profile'
            sub='server configuration'
            inert={INERT_REASON.profile}
            onInert={() => setAsked('profile')}
            className={cn(ASIDE, 'border-l border-hairline')}
          />
        </div>
      </TooltipProvider>
      {/* `bg-bgColor` on the note is required, not cosmetic: it sits on the grey page ground
          rather than inside a block, and a bordered box without a fill lets the ground through
          its own text. */}
      {asked && (
        <CalloutBox tone='note' className='mt-1.5 bg-bgColor'>
          <div className='flex items-start gap-2'>
            <Text size='micro' component='span' className='min-w-0 flex-1'>
              {INERT_REASON[asked]}
            </Text>
            <button
              type='button'
              onClick={() => setAsked(null)}
              className='shrink-0 uppercase text-labelColor hover:text-textColor focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
            >
              <Text size='nano' variant='uppercase' tracking='label' component='span'>
                dismiss
              </Text>
            </button>
          </div>
        </CalloutBox>
      )}
    </div>
  );
}
