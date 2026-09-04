import type { GetDesignBandResponse, common_DesignRun } from 'api/proto-http/admin';
import { useState } from 'react';
import { Button } from 'ui/components/button';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';

import { clockStamp } from '../handles';
import { RecallDoors } from '../history-recall';
import { viewLabel } from '../views';
import { formatMoney } from './money';
import { isCancelling, isRunLive, runFailureText, runStatus, viewsLine } from './run-state';
import { Thumb } from './thumb';
import { useGenerationWrites } from './use-generation';

/**
 * THE RUN PANEL — the run's detail at the owner's density (T-9: «сделай раскрытую деталку рана еще
 * компактнее»). Denser is a matter of CHROME, not of facts: the label column narrowed, the row
 * padding halved, `views · layout` and `fit at launch` folded into one line because they are one
 * sentence about one launch, and the attempts lost their group bar and their per-row rules. Nothing
 * that was stated here stopped being stated.
 *
 * EVERYTHING DRAWN HERE IS A LAUNCH-TIME COPY. The card has almost certainly moved on since —
 * references get deleted, plates get replaced — and the snapshot is what makes «why did this
 * picture come out like that» answerable a month later, precisely because it is NOT a live join
 * into the card.
 *
 * IT NOW CARRIES THE SENT TEXT, AND THAT IS WHY THE ASK COULD GO. The `ask` field was removed from
 * the flat form and from the history's own caption (T-3), so the row would have lost the only words
 * it printed. `run.prompt` is a better answer than the one it replaces: the ask was what somebody
 * typed, this is what the worker STORED AT DISPATCH, before the first paid attempt. It is folded
 * away by default because it is a paragraph, not a field.
 *
 * ⚠ THE STORED TEXT IS THE BASE INSTRUCTION, AND THE WORD IS THE CONTRACT'S. On the single-call
 * flat route it is what the provider received byte for byte; on `per_view` each paid call also gets
 * its own view line appended, and on 3D the text is cut to the provider's texture ceiling. The row
 * says «base text» for that reason and its title spells the two deviations out.
 *
 * EMPTY MEANS TWO DIFFERENT THINGS AND THEY ARE NOT COLLAPSED: a run nobody has picked up yet has
 * not composed one, and every row older than the column (migration 0352) has none and never will.
 * A screen that says «not dispatched yet» over an old finished run is lying about history.
 *
 * THE SNAPSHOT IS THE SERVER'S. `DesignInputSnapshot` is output-only — a client-supplied
 * provenance is a claim, not provenance — so this component reads and never composes. A frozen
 * `media_id` whose file has since been deleted comes back with `media` unset and `deleted` true,
 * and is drawn as «deleted», not as a blank cell.
 *
 * THE MONEY IS TWO DIFFERENT FACTS. `price_estimate` is what was RESERVED against the day before
 * dispatch; `price_actual` is the SUM OF ATTEMPTS, paid failures included. A row that failed twice
 * and succeeded once cost three attempts, and the register says so — which is the whole reason
 * attempts are rows and not a counter.
 */

function PanelRow({
  k,
  title,
  children,
}: {
  k: string;
  /** The clause a compacted label no longer has room to say out loud. */
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <div className='flex gap-2 border-b border-hairline py-0.5 last:border-b-0' title={title}>
      <Text
        size='micro'
        variant='label'
        component='span'
        className='w-20 shrink-0 uppercase tracking-label'
      >
        {k}
      </Text>
      <span className='min-w-0 flex-1 break-words text-micro'>{children}</span>
    </div>
  );
}

const MUTED = (
  <Text size='micro' variant='label' component='span'>
    —
  </Text>
);

export function RunPanel({
  techCardId,
  band,
  run,
  disabled,
}: {
  techCardId: number;
  /**
   * Полоса — РАДИ ДВЕРЕЙ РЕКОЛА И БОЛЬШЕ НИ РАДИ ЧЕГО. Всё остальное на этой панели — снимок
   * запуска, и join в живую карточку был бы ровно тем, чем снимок быть отказывается. Реколу же
   * полоса нужна, чтобы посчитать вопрос: какие роли стоят на карточке сейчас и какие слоты
   * верстака примут плиты этого прогона.
   */
  band: GetDesignBandResponse;
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
   * Заголовок этой панели обещает «всё нарисованное здесь — копия на момент запуска, то, что делает
   * вопрос „почему картинка вышла такой“ отвечаемым через месяц». Обещание держится только теперь.
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
      caption:
        `current state of the garment — ${viewLabel(sl.viewKey) || 'view'}` +
        ((sl.detailName ?? '').trim() ? ` (${sl.detailName})` : ''),
    }));
  const refRows = (inputs?.refs ?? []).map((r) => ({
    mediaId: r.mediaId ?? 0,
    media: r.media,
    deleted: !!r.deleted,
    caption:
      [viewLabel(r.role), (r.note ?? '').trim()].filter(Boolean).join(' — ') || 'reference image',
  }));
  /**
   * ═══ СНИМОК ГОВОРИТ БОЛЬШЕ, ЧЕМ УЕХАЛО, И РАЗНИЦА ЗАВИСИТ ОТ РОДА ПРОГОНА (N-2) ══════════════
   *
   * Владелец, пройдя бету: «в 3д промпт идут лишниие медиа должны идти только INPUT — RENDERS BY
   * VIEW а сейчас пошли медиа из флэт шита». ЗАМЕРЕНО НА ЖИВОМ ПРОГОНЕ (бета, `design_run` id 17):
   * снимок несёт 4 плиты рендера И 2 референса карточки, а сохранённый `prompt` того же прогона
   * перечисляет РОВНО ЧЕТЫРЕ строки «- image k: current state of the garment …». То есть модель
   * получила только плиты; денег не потрачено, промпт чист. Врала ПАНЕЛЬ — она рисовала шесть
   * миниатюр с номерами и подписывала их «6 pictures sent».
   *
   * ПОЧЕМУ СНИМОК ШИРЕ ПРОМПТА. Это ДВЕ РАЗНЫЕ ПОЛОВИНЫ: дверь пишет в снимок «чем прогон
   * располагал» (`designSelectBench`), а воркер сужает список ещё раз, уже под род, перед самым
   * вызовом (`designgen/snapshot.go`: `threedPictures` для 3D, `sourcePictures` для перекраса и
   * паттерна). Для 3D сужение выбрасывает референсы карточки целиком — маршрут читает КАЖДУЮ
   * присланную картинку как ВИД одного предмета, и чужая картинка стала бы пятым «видом».
   *
   * ⚠ ПОЧЕМУ ЭТО ЧИНИТСЯ ЗДЕСЬ, А НЕ НА СЕРВЕРЕ. Снимок замерзает навсегда: у всех уже прошедших
   * прогонов лишние строки в нём УЖЕ лежат, и правка двери не исправила бы ни одной прошлой
   * записи. Панель же читает снимок каждый раз заново — значит она и обязана применять то же
   * правило, что применил воркер, к любому снимку, старому и новому.
   *
   * ⚠ И ПОЧЕМУ ЭТО НЕ КОПИЯ ПРАВИЛА. Копия расходится молча — этим кончилась история K-1. Здесь
   * правило названо ОДНИМ выражением с именем серверной функции рядом, и утверждение у него ровно
   * одно: «для 3D промпт видит только плиты». Разойтись оно может единственным образом — если
   * сервер перестанет сужать, — и тогда панель СЪЕСТ картинку, которая уехала. Поэтому проба
   * сверяет число миниатюр с числом строк «- image k» в сохранённом промпте, а не с самим снимком.
   */
  const sentRows =
    run.kind === 'threed'
      ? // 3D: только плиты. Референсы карточки воркер выбрасывает (`threedPictures`).
        plateRows
      : run.kind === 'recolor' || run.kind === 'pattern'
        ? // Перекрас и паттерн действуют на НАЗВАННЫЕ снимки, и верстак им не даёт ничего
          // (`designSelectBench` возвращает пусто, `sourcePictures` сужает до названных).
          refRows
        : [...plateRows, ...refRows];
  // Дедуп по медиа за ПЕРВОЙ позицией — так же, как складывает список сервер: одна и та же
  // картинка, попавшая и в плиту, и в референс, уезжает один раз и нумеруется один раз.
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
   *
   * ⚠ ЭТО НЕ УКРАШЕНИЕ ПАНЕЛИ, А ПОДПИСЬ, КОТОРАЯ ИНАЧЕ ПРОТИВОРЕЧИТ ТЕЛУ ЗАПРОСА. С круга J-31
   * вызов перекраса несёт ДВЕ картинки — `refs: [фото_i, плитка]` (`designgen/images.go`), — а
   * `inputs.refs` снимка перечисляет только фотографии: ткань живёт в ЗАМОРОЖЕННЫХ
   * `params.colour`, куда `designAssembleInputs` её не складывает. Значит строка «N pictures
   * sent» была бы верна про снимок и неверна про то, что уехало поставщику.
   *
   * ЧИТАЕТСЯ ИЗ ПАРАМЕТРОВ ПРОГОНА, А НЕ ИЗ СЕГОДНЯШНЕЙ ПОЛКИ: параметры заморожены, полка
   * меняется, и панель — это улика о прошлом, а не о настоящем. Миниатюры у такой строки нет по
   * той же причине — адреса картинки замороженная копия не несёт, а разрешать `media_id` в
   * сегодняшнюю строку значило бы показать то, чем ткань стала, вместо того, чем она была.
   */
  const runCloth =
    run.kind === 'recolor'
      ? (run.params?.colour?.fabrics ?? []).find((f) => (f.mediaId ?? 0) > 0)
      : undefined;
  const attempts = run.attempts ?? [];
  const live = isRunLive(run);

  const priceActual = formatMoney(run.priceActual, run.currency);
  const priceEstimate = formatMoney(run.priceEstimate, run.currency);
  const money = priceActual || (priceEstimate ? `${priceEstimate} reserved` : '');

  const fit = (run.fitAtLaunch ?? '').trim();
  const sent = (run.prompt ?? '').trim();
  /** Полный ответ провайдера об отказе — довод у самой строки ниже (D-4). */
  const failure = runFailureText(run);


  return (
    <div className='mt-1 bg-bgZebra px-2 py-1.5'>
      {/* THE INPUT REFERENCES, AS THUMBNAILS IN A ROW (S-9). Role and note ride in the title —
          the full, worded prompt is what `recall` below is for. */}
      {refs.length > 0 && (
        <div className='flex flex-col gap-1 border-b border-hairline pb-1'>
          <div className='flex flex-wrap items-center gap-1'>
            {refs.map((ref, i) => (
              <span
                key={`${ref.mediaId}-${i}`}
                title={`image ${i + 1}: ${ref.caption}`}
                className='relative'
                data-sent-picture={i + 1}
              >
                <Thumb
                  media={ref.media}
                  gone={ref.deleted}
                  alt={ref.caption}
                  className='h-11 w-9'
                />
                {/* НОМЕР НА КАРТИНКЕ. Промпт говорит «- image 3: …», и без номера соотнести
                    строку со снимком можно было только счётом слева направо — то есть повторив
                    работу, которую экран обязан был сделать сам. */}
                <span className='absolute left-0 top-0 bg-bgColor px-0.5 text-[9px] leading-none'>
                  {i + 1}
                </span>
              </span>
            ))}
          </div>
          <Text size='nano' variant='label' component='p'>
            {/* ПЛИТЫ НАЗЫВАЮТСЯ СВОИМ ИМЕНЕМ. «from flat slots» стояло здесь литералом и было
                неправдой на 3D: тот строится из ПЛИТ РЕНДЕРА, и подпись отправляла человека
                искать во FLAT SLOTS картинки, которых там нет. Ось верстака две — вид × род, —
                и род выбирается родом прогона (`designSelectBench`). */}
            {refs.length} picture{refs.length === 1 ? '' : 's'} sent
            {runCloth
              ? ` · one paid call each, and every call also carried the cloth «${(runCloth.name ?? '').trim() || 'cloth'}» (media ${runCloth.mediaId}) as its second picture`
              : ''}
            {platesShown > 0
              ? ` · ${platesShown} ${run.kind === 'threed' ? 'render plate' : 'flat slot'}${platesShown === 1 ? '' : 's'}${
                  refs.length - platesShown > 0
                    ? ` · ${refs.length - platesShown} reference${refs.length - platesShown === 1 ? '' : 's'}`
                    : ''
                }`
              : ' · all from the card’s references'}
          </Text>
        </div>
      )}

      {/* ONE LINE FOR THE LAUNCH: what was asked for and the fit it was asked under. Two rows for
          one sentence was the loosest thing on this panel. */}
      <PanelRow k='asked' title='the views and layout this run requested, and the fit the card carried at launch'>
        {[viewsLine(run.params), fit ? `fit ${fit}` : 'fit not stated — the mint asks']
          .filter(Boolean)
          .join(' · ')}
      </PanelRow>

      <PanelRow k='who · when'>
        {[(run.author ?? '').trim(), clockStamp(run.createdAt), money].filter(Boolean).join(' · ') ||
          MUTED}
      </PanelRow>

      <PanelRow
        k='base text'
        title='the base instruction the worker composed and stored at dispatch, before the first paid attempt. A per-view run appends its own view line to each call and a 3D run is cut to the texture ceiling, so on those two routes this is the base and not a transcript.'
      >
        {sent ? (
          <>
            <button
              type='button'
              onClick={() => setTextOpen((v) => !v)}
              aria-expanded={textOpen}
              className='cursor-pointer uppercase tracking-label text-labelColor underline hover:text-textColor'
            >
              {textOpen ? '▾ hide' : '▸ show'} · {sent.length} characters
            </button>
            {textOpen && (
              <Text size='micro' component='p' className='mt-1 whitespace-pre-wrap break-words'>
                {sent}
              </Text>
            )}
          </>
        ) : live ? (
          <Text size='micro' variant='label' component='span'>
            not composed yet — the worker writes it when it picks the run up
          </Text>
        ) : (
          <Text size='micro' variant='label' component='span'>
            not kept for this run
          </Text>
        )}
      </PanelRow>

      {/* ═══ ПОЧЕМУ ЭТОТ ПРОГОН УПАЛ — ЦЕЛИКОМ, И ИМЕННО ЗДЕСЬ (D-4) ═══════════════════════════
          Строка истории носит исход в `Pill`, а `Pill` по построению `whitespace-nowrap`: текст
          провайдера длиной до 4 000 знаков (`designMaxErrorText`) уносил бы там страницу вбок
          на шестнадцать экранов. Поэтому чип обрезан, а НЕОБРЕЗАННЫЙ ответ живёт на панели —
          поверхности, которая умеет переносить абзац. Ничего не потеряно и ничего не пересказано
          своими словами: код провайдера и его же текст, как есть.

          `break-words` + `whitespace-pre-wrap` — та же пара, что у base text выше: ответ
          провайдера регулярно приезжает как JSON без единого пробела на строке. */}
      {/* ⚠ ЗАГОЛОВОК РЯДА ЗАВИСИТ ОТ СТАТУСА, А НЕ ОТ НАЛИЧИЯ ТЕКСТА. Код и текст последней
          ошибки живут на строке И У ЖИВОГО, И У ОТМЕНЁННОГО прогона — `runOutcomeNote` разбирает
          ровно эти три случая: живой прогон с кодом это ПОВТОР после неудачи, отменённый с кодом
          это то, что человек оборвал. Безусловное «why it failed» утверждало провал про прогон,
          который в двух сантиметрах выше подписан «retrying» или «cancelled», — две несогласные
          фразы об одном прогоне на одном экране. */}
      {(failure.code || failure.text) && (
        <PanelRow
          k={
            runStatus(run) === 'failed'
              ? 'why it failed'
              : runStatus(run) === 'cancelled'
                ? 'what was cut short'
                : 'the attempt before this one'
          }
          title='the provider’s own code and message, stored on the run'
        >
          {failure.code && (
            <Text size='micro' component='span' className='uppercase tracking-label'>
              {failure.code}
            </Text>
          )}
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
        </PanelRow>
      )}

      {/* ATTEMPTS ARE THE HONEST HALF OF THE MONEY: without per-attempt rows, `price_actual` reads
          as the price of the LAST attempt and the budget bar undercounts every retry. «Failed, and
          the money was still taken» is exactly the sentence a money register exists to say. They
          sit inside one row now instead of under a group bar of their own — same lines, one less
          rule and one less heading. */}
      {attempts.length > 0 && (
        <PanelRow k={`attempts · ${attempts.length}`}>
          {attempts.map((attempt, i) => (
            <span
              key={`${attempt.attemptNo ?? i}`}
              className='flex flex-wrap items-baseline gap-1.5'
            >
              <Text size='micro' component='span' className='uppercase tracking-label'>
                {attempt.attemptNo ?? i + 1}
              </Text>
              <Text size='micro' variant='label' component='span'>
                {[
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
                <Pill tone='attention'>outcome not knowable</Pill>
              )}
            </span>
          ))}
        </PanelRow>
      )}

      {/* ПОДВАЛ ПАНЕЛИ. `empty:mt-0` несущее: обе его половины условны, и на строке без дверей и без
          отмены пустой блок иначе оставлял бы отступ под собой. */}
      <div className='mt-1 flex flex-wrap items-center gap-2 empty:mt-0'>
        {/* ТА ЖЕ ПАРА ДВЕРЕЙ, ЧТО НА СТРОКЕ ИСТОРИИ, И ТОТ ЖЕ ОРГАН (V-12/V-13) — не второй глагол
            во второй позе, а один механизм в двух местах. Держать здесь свою копию условий и свой
            вопрос значило бы завести второе описание одного разрушения, и короче оказалось бы то,
            которое реже читают. Кнопки RERUN рядом по-прежнему нет: прогон запускается только из
            GENERATION — FLAT → GENERATE. */}
        <RecallDoors techCardId={techCardId} band={band} run={run} disabled={disabled} />
        {live && (
          <span className='ml-auto'>
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
          </span>
        )}
      </div>
    </div>
  );
}
