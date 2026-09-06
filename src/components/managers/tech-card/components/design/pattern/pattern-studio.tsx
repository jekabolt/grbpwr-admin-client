import type { GetDesignBandResponse, common_MediaFull } from 'api/proto-http/admin';
import { useEffect, useMemo, useRef, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';

import { ASSETS_PER_CARD_MAX } from '../assets/model';
import { Counter, Money, Reason } from '../core';
import { stepById } from '../core/chain';
import { isRunLive } from '../generation';
import { GenerateRow, RunRefusal } from '../render/generate-row';
import { useStartDesignRun } from '../render/use-design-run';
import { PatternColourRow, usePatternColourways } from './colourways';
import { LockLine } from './organs';
import {
  patternColourRecipe,
  patternGate,
  patternRuns,
  recentPatternColours,
  refusalAdvice,
  type PatternColour,
} from './model';
import { PatternInput } from './pattern-input';
import { PatternLibrary } from './pattern-library';

/**
 * ═══ STEP 3 · PATTERN — ONE BLOCK: the input, the colour, the run, the shelf ═══════════════════
 *
 * The screen of the prototype (`_step-pattern.js`), in the product's skin. ONE `Section`
 * titled `PATTERN · a repeating tile`, its sub-structure drawn with `GroupLabel` rules and never
 * with a second box; the generation history stands as its own block after it (mounted by the
 * studio, shared with every generative step).
 *
 *   SOURCE PICTURE   the cell on the left (one picture, exactly) · NAME * on the right
 *   COLOUR           one door `+ colour` (the product's pantone picker) · the recent colours of
 *                    this card's own runs · the pick standing as ONE tile with `✕`
 *   the run          the lock bar naming what is missing and its door · GENERATE · the money line
 *   TILES ON THIS CARD   the shelf; and under it MADE EARLIER, NOT KEPT when there is such a thing
 *
 * ═══ THE CONTRACT OF CREATION — three fields, and each knows whether it TRAVELS ══════════════════
 *
 *     picture   required, exactly one   INPUT of the run   (the gate)
 *     name      REQUIRED, unique        NOT SENT           (the name is yours, not the model's)
 *     colour    optional                INPUT of the run   (it paints the tile itself)
 *
 * The difference is shown on the organ's own face: `in the prompt` on the filled cell,
 * `not sent` under the name, `goes to the model` on the colour rule. The colour travels as
 * `params.colour` — the SAME field the render states its colour in; the server writes it into
 * every kind's prompt (`designgen/snapshot.go`), so a picked colour is a fact of the paid run,
 * not a decoration of the screen.
 *
 * ═══ NO COLOURWAY ON CREATION (owner, E-1) — and no prompt inventory door (owner) ═════════════
 *
 * The colourway is bound on the shelf, under the tile (`worn by`), after the fact: at the time of
 * the first generations the card has no colourways to choose from. The `what the model gets ▸`
 * door is not drawn on this step by the owner's decision: the whole of what travels is two organs
 * standing on this screen, the picture and the colour.
 *
 * ⚠ И ЦВЕТ ТЕПЕРЬ ТОЖЕ НЕ КОЛОРВЕЙ (владелец, r2 §26: «выбор цвета, который нас ни к чему не
 * обязывает»). Ряд COLOUR читал КОЛОРВЕИ КАРТОЧКИ — то есть на карточке без колорвеев он показывал
 * пустоту с дверью на соседний шаг, и покрасить пробную плитку было нельзя, не заведя запись о
 * продукте. Цвет — ничья пара «код + hex» (`PatternColour`), выбирается пантон-пикером продукта и
 * живёт ровно один прогон. `usePatternColourways` тут остаётся, но ТОЛЬКО ради полки: `worn by`
 * под плиткой — по-прежнему связь с колорвеем, и это другой вопрос, а не тот же.
 *
 * ═══ NOTHING HERE OWNS A SAVE. A named run lands on the shelf by itself (`keepPatternTx`). ═════
 */
export function PatternStudio({
  band,
  techCardId,
  disabled,
}: {
  band: GetDesignBandResponse;
  techCardId: number;
  disabled?: boolean;
}): JSX.Element {
  const run = useStartDesignRun(techCardId);
  const [source, setSource] = useState<common_MediaFull | null>(null);
  const sourceId = source?.id ?? 0;
  const [name, setName] = useState('');
  /* ЦВЕТ НИЧЕЙ (владелец, r2 §26): пара «код + hex», а не ссылка на колорвей карточки. `null` —
     законное и обычное состояние: плитка генерится и без цвета. */
  const [colour, setColour] = useState<PatternColour | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);
  const slotRef = useRef<HTMLDivElement | null>(null);

  /**
   * ═══ КАРТОЧКА СМЕНИЛАСЬ — ЗАГОТОВКА ПРОГОНА НАЧИНАЕТСЯ ЗАНОВО ═════════════════════════════
   *
   * ⚠ СБРОСА ЗДЕСЬ НЕ БЫЛО ВОВСЕ, И ЭТО СТОИЛО БЫ ДЕНЕГ. Три состояния выше — заготовка ПЛАТНОГО
   * прогона, а `PatternStudio` не ключуется `techCardId` и `StudioTab` при смене карточки не
   * размонтируется (инвариант 12). Картинка-источник, имя и цвет карточки A встают на экран
   * карточки B, ворота открываются, и GENERATE уходит с ЧУЖИМ входом — плитка из чужого снимка,
   * под чужим именем, на счёт этой карточки. Имя вдобавок проверяется на двойника по `band`
   * ТЕКУЩЕЙ карточки, так что «имя занято» ловилось бы не там, где имя занято.
   *
   * ⚠⚠ ПРОВЕРЯТЬ ЭТО НА ХОЛОДНОЙ КАРТОЧКЕ БЕСПОЛЕЗНО, И ИМЕННО ТАК ЭТОТ СБРОС СНЕСУТ. У карточки,
   * которую в этой сессии ещё не открывали, `useDesignBand` отдаёт `isLoading: true`, `StudioTab`
   * подменяет весь шаг на «loading…» (`decided !== 'card' && techCardId && isLoading`), и блок
   * размонтируется САМ — состояние пропадает без всякого сброса. Опасен обычный ход человека
   * «A → B → A»: у уже посещённой карточки данные в кэше, `isLoading` ложно, экран не
   * подменяется, узел живёт. ЗАМЕРЕНО на стенде: сцена E в `probe-pattern.mjs` прогревает обе
   * карточки и без этих трёх строк показывает имя и цвет карточки 7 на карточке 8 при
   * `sameNode: true`.
   *
   * В ТЕЛЕ РЕНДЕРА, А НЕ В ЭФФЕКТЕ (инвариант 12): эффект оставил бы один закоммиченный кадр с
   * новой карточкой и старым входом — а один кадр это одно нажатие GENERATE. Образец —
   * `generation/generation-history.tsx` (`shownCard`).
   *
   * `wasPending` НЕ ТРОГАЕТСЯ: он про ЖИЗНЬ МУТАЦИИ, а не про карточку, и обнуление здесь
   * стёрло бы память о запросе, который ещё летит.
   */
  const shownCard = useRef(techCardId);
  if (shownCard.current !== techCardId) {
    shownCard.current = techCardId;
    if (source) setSource(null);
    if (name) setName('');
    if (colour) setColour(null);
  }

  const { refs: colourways, loading: colourwaysLoading } = usePatternColourways(techCardId);
  /* История цвета уже лежит на проводе — она заморожена в `params.colour` прошлых прогонов. */
  const recentColours = useMemo(() => recentPatternColours(band), [band]);

  const live = useMemo(() => patternRuns(band).filter(isRunLive), [band]);
  const shelf = (band.assets ?? []).length;
  const step = stepById('pattern');

  /* THE GATE, in the order of the prototype: the source, the name, a twin of the name. The full
     shelf is NOT a gate — the run goes and is paid for, and the tile falls into «made earlier,
     not kept», where `keep it` is dimmed under its own bar. */
  const gate = patternGate(band, sourceId, name);

  /* THE NAME IS SPENT BY THE RUN: once a run has started (the mutation settled with no refusal)
     the field empties, and the next tile has to be named anew — the twin gate catches a repeat at
     once. The source stays: a second tile out of the same picture is a legitimate ask. */
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !run.isPending && !run.refusal) setName('');
    wasPending.current = run.isPending;
  }, [run.isPending, run.refusal]);

  /* THE DOORS OF THE LOCK BAR FIX THEIR OWN REASON. `+ picture ›` opens the same picker the cell
     opens (the cell's trigger is the library button); `name it ›` puts the caret in the field and
     selects it — no redraw, a redraw would blow the focus this door just set. */
  const openSlot = () => {
    slotRef.current?.scrollIntoView({ block: 'nearest' });
    slotRef.current?.querySelector<HTMLButtonElement>('button')?.click();
  };
  const focusName = () => {
    nameRef.current?.focus();
    nameRef.current?.select();
  };

  const advice = run.refusal ? refusalAdvice(run.refusal.words) : '';

  return (
    <Section
      id='design-pattern'
      title='pattern'
      question='— a repeating tile'
      action={
        <>
          <Pill tone='ink' data-step-pill=''>
            {`step ${step.n}`}
          </Pill>
          <Pill>optional</Pill>
          <span data-assets-count=''>
            <Counter n={shelf} noun='asset' total={ASSETS_PER_CARD_MAX} />
          </span>
        </>
      }
    >
      {/* ─── SOURCE PICTURE · NAME ────────────────────────────────────────────────────────── */}
      <GroupLabel
        flush
        action={
          <span data-source-count=''>
            <Counter n={sourceId > 0 ? 1 : 0} noun='picture' total={1} />
          </span>
        }
      >
        source picture
      </GroupLabel>
      <PatternInput
        source={source}
        onPick={setSource}
        onClear={() => setSource(null)}
        name={name}
        onName={setName}
        nameRef={nameRef}
        slotRef={slotRef}
        disabled={disabled}
      />

      {/* ─── COLOUR ─────────────────────────────────────────────────────────────────────── */}
      {/* ДВЕ ПИЛЮЛИ, А БЫЛО ТРИ. Третья повторяла словами то, что ряд под ней показывает лицом
          («no colour» / имя выбранного) — владелец про этот шаг: «не пихай кучу кнопок в одном
          месте». Остались два ФАКТА, которых на лице ряда нет: что цвет не обязателен и что он
          всё-таки уезжает в платный промпт. */}
      <GroupLabel
        action={
          <>
            <Pill tone='ink'>goes to the model</Pill>
            <Pill>optional</Pill>
          </>
        }
      >
        colour
      </GroupLabel>
      <PatternColourRow
        colour={colour}
        recent={recentColours}
        onPick={setColour}
        disabled={disabled}
      />

      {/* ─── the run: the bar, the door, the money ──────────────────────────────────────── */}
      {!gate.ok && (
        <LockLine reason={gate.reason} data-pattern-gate={gate.door}>
          {gate.door === 'name' ? (
            <Button variant='secondary' size='xs' onClick={focusName} data-gate-door='name'>
              name it ›
            </Button>
          ) : (
            <Button
              variant='secondary'
              size='xs'
              onClick={openSlot}
              disabled={disabled}
              data-gate-door='picture'
            >
              + picture ›
            </Button>
          )}
        </LockLine>
      )}
      <GenerateRow
        gate={gate}
        pending={run.isPending}
        disabled={disabled}
        /* THE MONEY LINE, and only it: no price exists on the wire before a run is asked for, so
           the organ says so in the band's own words instead of inventing a number. */
        trailing={<Money data-probe='run-price' />}
        onGenerate={() =>
          run.start({
            kind: 'pattern',
            ask: '',
            params: {
              // A tile has no side of a garment: the list is empty EXPLICITLY, and the server
              // checks its length.
              views: [],
              // NO COLOURWAY ON CREATION (E-1): zero is the legal value «nobody's», and the
              // kept tile lands on the shelf unbound — `worn by` binds it afterwards.
              colorwayId: 0,
              layout: '',
              // THE COLOUR THAT PAINTS THE TILE — the same field every other kind states its
              // colour in, and the server writes it into the prompt for every kind.
              colour: colour ? patternColourRecipe(colour) : undefined,
              threed: undefined,
              fixTarget: '',
              // The field says «extra»; here it carries the ONE input a tile is built from,
              // and the server refuses any other count.
              extraInputMediaIds: [sourceId],
              fixTargets: [],
              fixSlotIds: [],
              autoSplit: false,
              detailSlotIds: [],
              // THE REPEAT TRAVELS AS A LITERAL ZERO: the density is the model's (owner, J-12).
              // THE NAME IS THE FIELD'S, and the gate has made sure it is there and unique.
              // `sourceAssetId` is 0: the only door is the library/paste, which has no parent.
              pattern: { repeatMm: 0, name: name.trim(), sourceAssetId: 0 },
              useFlatSlots: false,
              flatSlotIds: [],
            },
          })
        }
      />
      {/* THE REFUSAL STAYS ON SCREEN AND IS QUOTED VERBATIM (Ф4): the server's words name the
          cause; our half is the advice under them, never instead of them. */}
      <RunRefusal refusal={run.refusal} onDismiss={run.dismissRefusal} />
      {run.refusal && advice && (
        <span data-refusal-advice=''>
          <Reason>{advice}</Reason>
        </span>
      )}

      {/* ─── TILES ON THIS CARD · MADE EARLIER, NOT KEPT ────────────────────────────────── */}
      <PatternLibrary
        band={band}
        techCardId={techCardId}
        disabled={disabled}
        live={live}
        hasSource={sourceId > 0}
        onAttach={openSlot}
        colourways={colourways}
        colourwaysLoading={colourwaysLoading}
      />
    </Section>
  );
}
