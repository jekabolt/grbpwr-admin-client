import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';
import { cn } from 'lib/utility';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { viewLabel } from '../views';
import { formatMoney } from './money';
import { isCancelling, isRunLive, runFailureText, runStatus, viewsLine } from './run-state';
import { Thumb } from './thumb';
import { useGenerationWrites } from './use-generation';

/**
 * THE RUN PANEL — what went into a run, unfolded under its row by `META ▸` (the mock-up's
 * `histMeta`). On the row itself only the outputs, the meta line and the doors are visible; the
 * WHOLE INPUT — the pictures it was given, the request, the attempts, the prompt — lives here, and
 * the prompt is folded once more behind its own `SHOW ▸`, because it is a paragraph, not a field.
 *
 * EVERYTHING DRAWN HERE IS A LAUNCH-TIME COPY. The card has almost certainly moved on since —
 * references get deleted, plates get replaced — and the snapshot is what makes «why did this
 * picture come out like that» answerable a month later, precisely because it is NOT a live join
 * into the card.
 *
 * ⚠ THE STORED TEXT IS THE BASE INSTRUCTION, AND THE WORD IS THE CONTRACT'S. On the single-call
 * flat route it is what the provider received byte for byte; on `per_view` each paid call also gets
 * its own view line appended, and on 3D the text is cut to the provider's texture ceiling. The
 * door's title spells the two deviations out.
 *
 * EMPTY MEANS TWO DIFFERENT THINGS AND THEY ARE NOT COLLAPSED: a run nobody has picked up yet has
 * not composed one, and every row older than the column (migration 0352) has none and never will.
 * A panel that says «not composed yet» over an old finished run is lying about history.
 *
 * THE SNAPSHOT IS THE SERVER'S. `DesignInputSnapshot` is output-only — a client-supplied
 * provenance is a claim, not provenance — so this component reads and never composes. A frozen
 * `media_id` whose file has since been deleted comes back with `media` unset and `deleted` true,
 * and is drawn as «deleted», not as a blank cell.
 *
 * THE MONEY IS TWO DIFFERENT FACTS. `price_estimate` is what was RESERVED against the day before
 * dispatch; `price_actual` is the SUM OF ATTEMPTS, paid failures included. A row that failed twice
 * and succeeded once cost three attempts, and the register says so — which is the whole reason
 * attempts are rows and not only a counter. The price of the run itself stands on the row's meta
 * line, beside its author and its clock; this panel keeps the per-attempt half.
 *
 * THE RECALL DOORS ARE NOT HERE ANY MORE (they were, as a second copy of the row's pair). With the
 * mock-up's layout the panel opens DIRECTLY UNDER the meta line that carries them, and a second
 * pair two centimetres below the first was two organs for one gesture.
 */

/* ═══ TWO PILL ORGANS THE HISTORY SHARES — local to the generation folder ═════════════════════════
   `ui/components/pill` has no dashed («gap») tone, and `core/organs.tsx`' `Counter` paints a zero
   RED — the tone this admin reserves for money lost. The mock-up counts in dashed grey at zero
   («counter(n, noun, total)», `gap` tone) and states a reason as a dashed pill. Both are written
   here once and imported by the row, the section and the recall doors. Просится в core: a `gap`
   tone on `Pill`, and `Counter` with a dashed zero instead of a red one. */

/** `1 of 1 run` / `3 pictures` / `0 pictures` (dashed) — a count as a pill. */
export function CountPill({
  n,
  noun,
  plural,
  total,
  title,
  className,
}: {
  n: number;
  noun: string;
  plural?: string;
  total?: number;
  title?: string;
  className?: string;
}) {
  const many = plural ?? `${noun}s`;
  const word = (total ?? n) === 1 ? noun : many;
  return (
    <Pill tone='mut' className={cn(n === 0 && 'border-dashed', className)} title={title}>
      {total != null ? `${n} of ${total} ${word}` : `${n} ${word}`}
    </Pill>
  );
}

/** A dashed pill: a state that is an absence, or the reason a door beside it is dark. */
export function GapPill({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Pill tone='mut' className='border-dashed' title={title}>
      {children}
    </Pill>
  );
}

export function RunPanel({
  techCardId,
  run,
  disabled,
}: {
  techCardId: number;
  /**
   * The band used to come in for the recall doors and for nothing else; the doors moved to the
   * row, and the panel — a launch-time snapshot — reads no live band on purpose. The prop stays on
   * the signature so the callers that hand it in keep compiling; it is not read.
   */
  band?: GetDesignBandResponse;
  run: common_DesignRun;
  disabled?: boolean;
}) {
  const { cancelRun } = useGenerationWrites(techCardId);
  const [textOpen, setTextOpen] = useState(false);

  const inputs = run.inputs;
  /**
   * ВСЁ, ЧТО УЕХАЛО МОДЕЛИ — ОДНИМ РЯДОМ, В ПОРЯДКЕ СЕРВЕРА И С НОМЕРАМИ (K-1д).
   *
   * ⚠ ЗДЕСЬ РИСОВАЛАСЬ ПОЛОВИНА СНИМКА. Панель показывала только `refs` — то, что человек принёс
   * сам, — а `slots` (плиты верстака, которые сервер прикладывал молча) не читала вовсе. Владелец
   * увидел в промпте шесть строк на две поданные картинки и не мог понять, откуда взялись
   * остальные: они уезжали, но на экране их не было НИГДЕ.
   *
   * Порядок и нумерация — ровно те, что у сервера (`referenceList`): сначала плиты, отсортированные
   * front → back → side_l → side_r → detail, потом референсы. Номер здесь читается ВМЕСТЕ со
   * строками «- image k: …» под base text; два ряда без номеров были бы третьим мнением о том, что
   * ушло.
   */
  const VIEW_RANK: Record<string, number> = {
    front: 0,
    back: 1,
    side_l: 2,
    side_r: 3,
    detail: 4,
  };
  const plateRows = [...(inputs?.slots ?? [])]
    .filter((sl) => (sl.mediaId ?? 0) > 0)
    .sort((a, b) => (VIEW_RANK[a.viewKey ?? ''] ?? 5) - (VIEW_RANK[b.viewKey ?? ''] ?? 5))
    .map((sl) => ({
      mediaId: sl.mediaId ?? 0,
      media: sl.media,
      deleted: !!sl.deleted,
      name: `plate · ${viewLabel(sl.viewKey) || 'view'}`,
      caption:
        `current state of the garment — ${viewLabel(sl.viewKey) || 'view'}` +
        ((sl.detailName ?? '').trim() ? ` (${sl.detailName})` : ''),
    }));
  const refRows = (inputs?.refs ?? []).map((r) => ({
    mediaId: r.mediaId ?? 0,
    media: r.media,
    deleted: !!r.deleted,
    name: viewLabel(r.role) || 'reference',
    caption:
      [viewLabel(r.role), (r.note ?? '').trim()].filter(Boolean).join(' — ') || 'reference image',
  }));
  /**
   * ═══ СНИМОК ГОВОРИТ БОЛЬШЕ, ЧЕМ УЕХАЛО, И РАЗНИЦА ЗАВИСИТ ОТ РОДА ПРОГОНА (N-2) ══════════════
   *
   * ЗАМЕРЕНО НА ЖИВОМ ПРОГОНЕ (бета, `design_run` id 17): снимок несёт 4 плиты рендера И 2
   * референса карточки, а сохранённый `prompt` того же прогона перечисляет РОВНО ЧЕТЫРЕ строки
   * «- image k: current state of the garment …». Модель получила только плиты. Врала ПАНЕЛЬ.
   *
   * ПОЧЕМУ СНИМОК ШИРЕ ПРОМПТА. Дверь пишет в снимок «чем прогон располагал»
   * (`designSelectBench`), а воркер сужает список ещё раз, уже под род, перед самым вызовом
   * (`designgen/snapshot.go`: `threedPictures` для 3D, `sourcePictures` для перекраса и паттерна).
   * Для 3D сужение выбрасывает референсы карточки целиком — маршрут читает КАЖДУЮ присланную
   * картинку как ВИД одного предмета.
   *
   * ⚠ ПОЧЕМУ ЭТО ЧИНИТСЯ ЗДЕСЬ, А НЕ НА СЕРВЕРЕ. Снимок замерзает навсегда: у всех уже прошедших
   * прогонов лишние строки в нём УЖЕ лежат. Панель читает снимок каждый раз заново — значит она и
   * обязана применять то же правило, что применил воркер, к любому снимку, старому и новому. Правило
   * названо ОДНИМ выражением с именем серверной функции рядом; проба сверяет число миниатюр с
   * числом строк «- image k» в сохранённом промпте, а не с самим снимком.
   */
  const sentRows =
    run.kind === 'threed'
      ? plateRows
      : run.kind === 'recolor' || run.kind === 'pattern'
        ? refRows
        : [...plateRows, ...refRows];
  // Дедуп по медиа за ПЕРВОЙ позицией — так же, как складывает список сервер.
  const seenMedia = new Set<number>();
  const refs = sentRows.filter((r) => {
    if (r.mediaId <= 0 || seenMedia.has(r.mediaId)) return false;
    seenMedia.add(r.mediaId);
    return true;
  });
  /** Сколько из показанных пришло с верстака — считается ПО ПОКАЗАННЫМ, а не по снимку. */
  const platesShown = refs.filter((r) => plateRows.some((pl) => pl.mediaId === r.mediaId)).length;
  /**
   * ═══ ТКАНЬ ПЕРЕКРАСА ЕДЕТ, НО В СНИМКЕ ВХОДОВ ЕЁ НЕТ (J-31) ═══════════════════════════════
   * С круга J-31 вызов перекраса несёт ДВЕ картинки — `refs: [фото_i, плитка]`
   * (`designgen/images.go`), — а `inputs.refs` снимка перечисляет только фотографии: ткань живёт в
   * ЗАМОРОЖЕННЫХ `params.colour`. Читается из параметров прогона, а не из сегодняшней полки:
   * параметры заморожены, полка меняется, и панель — это улика о прошлом, а не о настоящем.
   */
  const runCloth =
    run.kind === 'recolor'
      ? (run.params?.colour?.fabrics ?? []).find((f) => (f.mediaId ?? 0) > 0)
      : undefined;
  const attempts = run.attempts ?? [];
  const live = isRunLive(run);

  const fit = (run.fitAtLaunch ?? '').trim();
  const sent = (run.prompt ?? '').trim();
  const asked = [viewsLine(run.params), fit ? `fit ${fit}` : ''].filter(Boolean).join(' · ');
  const requestId = (run.clientRequestId ?? '').trim();
  /** Полный ответ провайдера об отказе — довод у самой строки ниже (D-4). */
  const failure = runFailureText(run);
  const status = runStatus(run);

  return (
    /* ЛЕВАЯ ЛИНЕЙКА — раскрытие принадлежит строке над ним (макет: `border-left: 1px`). Не блок:
       блока в блоке в этой системе нет, и заливки под панелью больше тоже нет. */
    <div data-run-meta={run.id || undefined} className='mt-2 border-l border-hairline pl-2'>
      <GroupLabel
        flush
        action={
          <span className='flex flex-wrap items-center gap-1'>
            <CountPill n={refs.length} noun='picture' />
            {platesShown > 0 && (
              <CountPill
                n={platesShown}
                noun={run.kind === 'threed' ? 'render plate' : 'plate'}
                title='plates the run took off the bench by itself; the rest are the card’s references'
              />
            )}
            <CountPill n={sent.length} noun='character' />
          </span>
        }
      >
        what went in
      </GroupLabel>

      {/* THE INPUT PICTURES, IN A ROW, NUMBERED. The prompt says «- image 3: …», and without the
          number a person would have to count left to right — repeating the work the screen owes. */}
      {refs.length > 0 ? (
        <div className='flex flex-wrap items-center gap-2'>
          {refs.map((ref, i) => (
            <span
              key={`${ref.mediaId}-${i}`}
              title={`image ${i + 1}: ${ref.caption}`}
              className='flex items-center gap-1'
              data-sent-picture={i + 1}
            >
              <Thumb media={ref.media} gone={ref.deleted} alt={ref.caption} className='h-7 w-7' />
              <Text size='nano' variant='label' component='span' className='truncate'>
                {i + 1} · {ref.name}
              </Text>
            </span>
          ))}
        </div>
      ) : (
        <Text size='nano' variant='label' component='p'>
          nothing was given to this run
        </Text>
      )}
      {runCloth && (
        <Text size='nano' variant='label' component='p'>
          one paid call per picture, and every call also carried the cloth «
          {(runCloth.name ?? '').trim() || 'cloth'}» (media {runCloth.mediaId}) as its second
          picture
        </Text>
      )}

      {/* ONE LINE FOR THE LAUNCH: what was asked for and the fit it was asked under — the product's
          two facts the mock-up's snapshot does not carry; they stay, as one nano line. */}
      {asked && (
        <Text
          size='nano'
          variant='label'
          component='p'
          className='mt-1'
          title='the views and layout this run requested, and the fit the card carried at launch'
        >
          asked · {asked}
        </Text>
      )}

      <div className='mt-1.5 flex flex-wrap items-center gap-1.5'>
        <Pill
          tone='mut'
          title={requestId ? `client request id ${requestId}` : 'no client request id was filed'}
        >
          request {requestId ? requestId.slice(0, 8) : 'not filed'}
        </Pill>
        <CountPill n={attempts.length} noun='attempt' />
        {sent ? (
          <>
            <Button
              variant='secondary'
              size='xs'
              onClick={() => setTextOpen((v) => !v)}
              aria-expanded={textOpen}
              aria-label={`${textOpen ? 'hide' : 'show'} the prompt of run ${run.id ?? ''}`}
              title='the base instruction the worker composed and stored at dispatch, before the first paid attempt. A per-view run appends its own view line to each call and a 3D run is cut to the texture ceiling, so on those two routes this is the base and not a transcript.'
            >
              {textOpen ? 'hide ▾' : 'show ▸'}
            </Button>
            <CountPill n={sent.length} noun='character' />
          </>
        ) : (
          <GapPill
            title={
              live
                ? 'the worker writes the base text when it picks the run up'
                : 'this run is older than the stored-prompt column, or the worker kept none'
            }
          >
            {live ? 'not composed yet' : 'no prompt was filed'}
          </GapPill>
        )}
      </div>

      {textOpen && sent && (
        <Text
          size='micro'
          component='p'
          className='mt-1 max-w-[80ch] whitespace-pre-line break-words'
        >
          {sent}
        </Text>
      )}

      {/* ATTEMPTS ARE THE HONEST HALF OF THE MONEY: without per-attempt lines, `price_actual` reads
          as the price of the LAST attempt and the budget bar undercounts every retry. «Failed, and
          the money was still taken» is exactly the sentence a money register exists to say. One
          nano line per attempt, under the counter that names how many there were. */}
      {attempts.length > 0 && (
        <div className='mt-1 flex flex-col gap-0.5'>
          {attempts.map((attempt, i) => (
            <span
              key={`${attempt.attemptNo ?? i}`}
              className='flex flex-wrap items-baseline gap-1.5'
            >
              <Text size='nano' variant='label' component='span'>
                {[
                  `attempt ${attempt.attemptNo ?? i + 1}`,
                  (attempt.provider ?? '').trim(),
                  (attempt.state ?? '').trim(),
                  (attempt.errorCode ?? '').trim(),
                  formatMoney(attempt.price, run.currency),
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
              {/* `unknown` means the money was POSSIBLY taken and the outcome is not knowable from
                  our side. Collapsing it into «failed» would be a lie about the ledger. */}
              {(attempt.state ?? '') === 'unknown' && (
                <GapPill title='the provider did not answer; the money may or may not have been taken'>
                  outcome not knowable
                </GapPill>
              )}
            </span>
          ))}
        </div>
      )}

      {/* ═══ ПОЧЕМУ ЭТОТ ПРОГОН УПАЛ — ЦЕЛИКОМ, И ИМЕННО ЗДЕСЬ (D-4) ═══════════════════════════
          Строка истории носит исход в пилюле, а пилюля `whitespace-nowrap`: текст провайдера
          длиной до 4 000 знаков (`designMaxErrorText`) уносил бы там страницу вбок. Поэтому чип
          обрезан, а НЕОБРЕЗАННЫЙ ответ живёт здесь — макетный `.callout`, продуктовый `CalloutBox`.
          ⚠ ЗАГОЛОВОК ЗАВИСИТ ОТ СТАТУСА, А НЕ ОТ НАЛИЧИЯ ТЕКСТА: код живёт и у живого (повтор
          после неудачи), и у отменённого прогона, и безусловное «why it failed» утверждало бы
          провал про прогон, подписанный двумя сантиметрами выше «retrying». */}
      {(failure.code || failure.text) && (
        <CalloutBox tone='note' className='mt-1.5'>
          <Text size='nano' variant='label' component='p' className='uppercase tracking-label'>
            {status === 'failed'
              ? 'why it failed'
              : status === 'cancelled'
                ? 'what was cut short'
                : 'the attempt before this one'}
            {failure.code ? ` · ${failure.code}` : ''}
          </Text>
          {failure.text && (
            <Text
              size='micro'
              variant='label'
              component='p'
              className='max-w-[75ch] whitespace-pre-wrap break-words'
            >
              {failure.text}
            </Text>
          )}
        </CalloutBox>
      )}

      {/* THE ONE DOOR THAT IS THE PANEL'S OWN: stopping a run in flight. It is money — an answer
          that still arrives after the stamp is recorded and paid for — so it sits with the facts
          about the run rather than on the row's line of navigation doors. */}
      {live && (
        <div className='mt-1.5'>
          <Button
            variant='secondary'
            size='xs'
            disabled={disabled || isCancelling(run) || cancelRun.isPending}
            onClick={() => cancelRun.mutate(run.id ?? 0)}
            title={
              isCancelling(run)
                ? 'already asked to stop — an answer that still arrives is recorded and paid for'
                : 'stop this run'
            }
          >
            {isCancelling(run) ? 'cancelling…' : 'cancel this run'}
          </Button>
        </div>
      )}
    </div>
  );
}
