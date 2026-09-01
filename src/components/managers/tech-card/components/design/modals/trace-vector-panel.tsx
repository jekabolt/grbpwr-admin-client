import { cn } from 'lib/utility';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import Text from 'ui/components/text';

import { isRunLive } from '../generation/run-state';
import { useElapsed } from '../generation/use-generation';
import type { common_DesignEditLayer } from 'api/proto-http/admin';
import { runReadsMedia, type TraceVector } from './use-trace-vector';
import type { VectorStroke } from './vector-strokes';

/**
 * THE ENTRY FORK AND EVERYTHING BEHIND ITS «YES» — one panel, four phases, all on the editor's own
 * full-screen surface. A second stacked modal was the lazy spelling; the editor already owns a
 * whole screen, and the question «draw or convert» IS this screen's first state, not a detour.
 *
 *   fork      — the question, and it has THREE answers, not two. Draw over the raster (free, works
 *               today); trace the pixels that are there (free, local, exact — `vector-trace.ts`,
 *               reached through the editor's own rail so the threshold can be seen before it
 *               decides anything); or have the machine redraw it as vector (paid, judged by a
 *               human before anything is filed). The free trace sits between them on purpose: it
 *               is the answer somebody paying for a redraw of an already-correct flat was looking
 *               for, and it is the one that used to be invisible here.
 *   starting  — the paid door was pressed; the row is being filed.
 *   waiting   — the run is live. Leaving is safe and says so: the run is a server job, and the
 *               fork picks it back up on re-entry instead of selling a second one.
 *   arrived   — the judgment. Source raster and machine redraw SIDE BY SIDE, because the redraw
 *               is not a conversion: a cuff can come back different, and only a person can decide
 *               that the difference is acceptable. «Keep» files the layer; «discard» files nothing
 *               and loses nothing — the SVG stays on its history row.
 *
 * EVERY REFUSAL IS WORDED IN PLACE. The server is the gate (budget, one-in-flight, provider
 * configured); this panel copies no gate and names every refusal it is handed, because a door that
 * fails silently and a door that lies about why are the two ways this screen loses trust.
 */

/** One pane of the judgment: a framed picture with its role stated under it. */
function JudgePane({
  src,
  label,
  sub,
  ratio,
}: {
  src: string;
  label: string;
  sub: string;
  ratio: number;
}) {
  return (
    <figure className='min-w-0 flex-1'>
      <div
        className='w-full border border-hairline bg-bgColor'
        style={{ aspectRatio: String(ratio || 0.8) }}
      >
        {src ? (
          <img src={src} alt={label} className='block h-full w-full object-contain' />
        ) : (
          <div className='flex h-full items-center justify-center'>
            <Text size='nano' variant='label' component='span'>
              no picture
            </Text>
          </div>
        )}
      </div>
      <figcaption className='pt-1'>
        <Text size='micro' variant='uppercase' tracking='label' component='span'>
          {label}
        </Text>{' '}
        <Text size='nano' variant='label' component='span'>
          {sub}
        </Text>
      </figcaption>
    </figure>
  );
}

export function TraceVectorPanel({
  trace,
  baseSrc,
  baseLabel,
  baseMediaId,
  ratio,
  onDraw,
  onTraceHere,
  onAccepted,
}: {
  trace: TraceVector;
  baseSrc: string;
  /** How the plate is spoken of — the picture handle the header already uses. */
  baseLabel: string;
  baseMediaId: number;
  /** The plate's width ÷ height; both judgment panes share it so the eye compares places. */
  ratio: number;
  onDraw: () => void;
  /**
   * Enter the editor with the LOCAL tracer already open — the free half of «raster → vector».
   * It does not trace anything by itself: see the button's own argument.
   */
  onTraceHere: () => void;
  onAccepted: (result: {
    layer: common_DesignEditLayer;
    strokes: VectorStroke[];
    fileUrl: string;
  }) => void;
}) {
  const { door, phase, refusal } = trace;
  const waitingRun = phase.k === 'waiting' ? phase.run : null;
  const elapsed = useElapsed(
    waitingRun ? ((waitingRun.startedAt ?? waitingRun.createdAt) as string | undefined) : null,
  );

  const wide = phase.k === 'arrived';

  return (
    <div className='flex min-h-0 flex-1 items-start justify-center overflow-y-auto pt-[10vh]'>
      <div
        className={cn(
          'max-w-full space-y-2.5 border border-borderColor bg-bgColor p-4',
          wide ? 'w-[880px]' : 'w-[460px]',
        )}
      >
        {/* ── the question ─────────────────────────────────────────────────────────────── */}
        {(phase.k === 'fork' || phase.k === 'starting') && (
          <>
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='p'
              className='font-bold'
            >
              this flat has no vector yet
            </Text>
            <Text size='micro' variant='label' component='p'>
              Three ways from here. Draw over the raster: your strokes live on their own layer, the
              picture underneath is never touched, and next time this screen opens the vector is
              already here. Or trace the pixels that are already on the plate — free, local, no
              request at all, and the contour comes back exactly where the paint ends. Or have the
              machine redraw the flat as clean vector curves — a paid run, and nothing is filed
              until you have judged the result beside the original.
            </Text>
            <div className='flex flex-wrap items-center gap-1.5'>
              <Button
                type='button'
                variant='main'
                size='sm'
                autoFocus
                disabled={phase.k === 'starting'}
                onClick={onDraw}
              >
                draw over the raster
              </Button>
              {/* ТРЕТИЙ ОТВЕТ НА ТОТ ЖЕ ВОПРОС, И ОН ОБЯЗАН СТОЯТЬ ЗДЕСЬ, А НЕ ТОЛЬКО В РЕЙКЕ.
                  Развилка спрашивает «откуда на этой плите возьмётся вектор», и до сих пор у неё
                  было два ответа: нарисовать руками или купить перерисовку. Обводка — третий, и
                  он ДЕШЕВЛЕ ОБОИХ; человек, не увидевший его в этом вопросе, узнаёт о нём только
                  после того, как заплатил за перерисовку или провёл час пером.

                  ВЕДЁТ В РЕДАКТОР С ОТКРЫТОЙ ПАНЕЛЬЮ, А НЕ ОБВОДИТ САМА. Порог, полярность и
                  канал решают, что именно станет контуром, и запустить движок с умолчаниями по
                  одному нажатию значило бы иногда молча обвести ВСЁ ПОЛЕ вокруг рисунка. Дверь
                  доводит до органов и до живого предпросмотра — решение остаётся за человеком. */}
              <Button
                type='button'
                variant='secondary'
                size='sm'
                data-trace-here=''
                disabled={phase.k === 'starting'}
                onClick={onTraceHere}
              >
                trace the pixels as they are
              </Button>
              {door.live ? (
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  disabled={phase.k === 'starting'}
                  onClick={trace.start}
                >
                  {phase.k === 'starting' ? 'starting the run…' : 'convert the raster to vector'}
                </Button>
              ) : (
                /* THE DOOR IS INERT WITH ITS REASON IN VISIBLE TEXT — a `title` on a disabled
                   button never shows (pointer events are off), and a button that does nothing
                   silently is worse than no button. */
                <Button type='button' variant='secondary' size='sm' disabled>
                  convert the raster to vector
                </Button>
              )}
            </div>
            {!door.live && (
              <Text size='nano' variant='label' component='p'>
                {door.reason}
              </Text>
            )}
            {door.live && (
              <Text size='nano' variant='label' component='p'>
                the conversion is a REDRAW, not a trace: a vector model draws the flat again with
                this raster as its reference, so a cuff can come back different and a seam can
                move. You accept or discard the result next to the original; the approved flat is
                never replaced by itself. One paid run — the price lands on its history row.
              </Text>
            )}
            {phase.k === 'fork' && phase.reviewRun && (
              /* THE MONEY DOOR THAT COSTS NOTHING: a redraw for this plate already exists and was
                 never judged. Offering it BEFORE the paid button is the difference between one
                 payment and two for the same picture. */
              <div className='border-t border-hairline pt-2'>
                <div className='flex flex-wrap items-center gap-1.5'>
                  <Button
                    type='button'
                    variant='secondary'
                    size='sm'
                    onClick={() => trace.review(phase.reviewRun!)}
                  >
                    review the vector from run {phase.reviewRun.id} ▸
                  </Button>
                  <Text size='nano' variant='label' component='span'>
                    already generated for this plate and never judged — reviewing it costs nothing
                  </Text>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── the wait ─────────────────────────────────────────────────────────────────── */}
        {phase.k === 'waiting' && (
          <>
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='p'
              className='font-bold'
            >
              converting the raster to vector
            </Text>
            <Text size='micro' component='p' className='tabular-nums'>
              run {phase.run.id} · {(phase.run.status ?? '').trim() || 'pending'}
              {elapsed ? ` · ${elapsed}` : ''}
            </Text>
            <Text size='nano' variant='label' component='p'>
              the machine is redrawing «{baseLabel}» as vector curves. Leaving this screen does not
              stop the run — it lands on the history row either way, and this door picks it back up
              on the next visit.
            </Text>
            {isRunLive(phase.run) ? (
              <div className='flex flex-wrap items-center gap-1.5'>
                <Button
                  type='button'
                  variant='secondary'
                  size='sm'
                  disabled={phase.cancelPending}
                  onClick={trace.cancel}
                >
                  {phase.cancelPending ? 'cancelling…' : 'cancel the run'}
                </Button>
                <Text size='nano' variant='label' component='span'>
                  a run already at the provider still gets billed — the row says which it was
                </Text>
              </div>
            ) : (
              /* The run has landed; the bytes are on their way back for the judgment. Nothing to
                 cancel any more — offering the door would promise a refund that cannot happen. */
              <Text size='nano' variant='label' component='p'>
                reading the result back…
              </Text>
            )}
          </>
        )}

        {/* ── the judgment ─────────────────────────────────────────────────────────────── */}
        {phase.k === 'arrived' && (
          <>
            <Text
              size='micro'
              variant='uppercase'
              tracking='label'
              component='p'
              className='font-bold'
            >
              the machine’s redraw arrived — yours to judge
            </Text>
            <Text size='nano' variant='label' component='p'>
              run {phase.run.id} · done · the SVG is already in the media library — keeping it
              files it as this plate’s vector layer, discarding files nothing and deletes nothing.
            </Text>

            <div className='flex flex-wrap gap-2.5'>
              <JudgePane
                src={baseSrc}
                label='raster'
                sub={`· «${baseLabel}» — the approved flat, never replaced`}
                ratio={ratio}
              />
              <JudgePane
                src={phase.svg.url}
                label='vector'
                sub='· the machine’s redraw — judge it against the original'
                ratio={ratio}
              />
            </div>

            {/* What the file becomes IN THIS EDITOR — counted, or refused by name. */}
            {phase.svg.reading === null && !phase.svg.fetchFailed && (
              <Text size='nano' variant='label' component='p'>
                reading the file back for editing…
              </Text>
            )}
            {phase.svg.reading?.ok && (
              <Text size='nano' variant='label' component='p' className='tabular-nums'>
                editable: {phase.svg.reading.strokes.length} line
                {phase.svg.reading.strokes.length === 1 ? '' : 's'} ·{' '}
                {phase.svg.reading.anchors} anchors · {phase.svg.reading.curves} curved ·{' '}
                {phase.svg.reading.bytes < 1024
                  ? '<1 KB'
                  : `${Math.round(phase.svg.reading.bytes / 1024)} KB`}
              </Text>
            )}
            {phase.svg.reading && !phase.svg.reading.ok && (
              <Text size='nano' variant='label' component='p'>
                the file cannot be made editable here — {phase.svg.reading.reason} Keeping it still
                files the FILE whole on the layer; strokes can be drawn over it afterwards.
              </Text>
            )}
            {phase.svg.fetchFailed && (
              <Text size='nano' variant='label' component='p'>
                the bytes could not be read back for parsing — the picture above is the file
                itself. Keeping it files the file whole, without an editable form yet.
              </Text>
            )}
            {(phase.svg.reading?.ok ? phase.svg.reading.notes : [])
              /* Нота импортера «the file itself is not kept» написана для двери импорта с диска
                 и на ЭТОМ пути — ложь: файл как раз сохраняется (source_media_id), и download
                 отдаёт его. Заголовок суда уже говорит правду; ложная строка отсеивается. */
              .filter((note) => !/file itself is not kept/i.test(note))
              .map((note, i) => (
                <Text key={i} size='nano' variant='label' component='p'>
                  {note}
                </Text>
              ))}

            <Text size='micro' variant='label' component='p'>
              a redraw is not a conversion — check the cuffs, the pockets and the seam lines
              against the original before keeping it.
            </Text>

            {!runReadsMedia(phase.run, baseMediaId) ? (
              /* PROVENANCE GUARD: the run's frozen input names another plate. Filing it here
                 would write a lineage the snapshot itself contradicts. */
              <CalloutBox tone='error'>
                <Text size='micro' component='p'>
                  <b>this run read a different plate than the one under the editor</b> — the bench
                  moved before it started. It cannot be filed as this plate’s vector; discard it
                  here. The SVG stays on its own history row.
                </Text>
              </CalloutBox>
            ) : null}

            <div className='flex flex-wrap items-center gap-1.5'>
              <Button
                type='button'
                variant='main'
                size='sm'
                disabled={
                  phase.filing ||
                  (phase.svg.reading === null && !phase.svg.fetchFailed) ||
                  !runReadsMedia(phase.run, baseMediaId)
                }
                onClick={() => {
                  void trace.accept(ratio).then((result) => {
                    if (result) onAccepted(result);
                  });
                }}
              >
                {phase.filing ? 'filing the layer…' : 'keep this vector'}
              </Button>
              <Button
                type='button'
                variant='secondary'
                size='sm'
                disabled={phase.filing}
                onClick={trace.discard}
              >
                discard
              </Button>
            </div>
          </>
        )}

        {refusal && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              {refusal}
            </Text>
          </CalloutBox>
        )}
      </div>
    </div>
  );
}
