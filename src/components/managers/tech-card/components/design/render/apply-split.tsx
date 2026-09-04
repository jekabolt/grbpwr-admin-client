import type { GetDesignBandResponse, common_DesignPicture } from 'api/proto-http/admin';
import { useMemo, useState, type JSX } from 'react';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import Text from 'ui/components/text';

import { cardOutputRows, pictureRepresentation, type Representation } from '../bench-kinds';
import { cropFamilies } from '../generation/composite';
import { useDesignWrites } from '../use-design-band';
import { isPictureHidden } from '../visibility';
import {
  SILHOUETTE_VIEWS,
  isSilhouetteView,
  normaliseViewKey,
  viewLabel,
  type SilhouetteView,
} from '../views';
import type { BenchSide } from './model';

/**
 * ═══ APPLY SPLITTED — E-6, И ЭТО ОДИН МЕХАНИЗМ НА ДВА ЭКРАНА ══════════════════════════════════
 *
 * Владелец, дословно: «в 3д INPUT — RENDERS BY VIEW мультивью карточек тоже должно отображаться и
 * если его расколапсить под мультивью кнока аплай сплитед и они уходят в инпут после нажатия и
 * заменяют текущие вью предварительно очищая предыдущий импут и так же сделать в фабрик рендере
 * INPUT — FLATS OF THIS CARD что бы там после дивайдера показывало фильтром только флеты и
 * мультивью тоже спильнутые».
 *
 * ДВА ЭКРАНА, ОДИН ГЛАГОЛ, ОДНО НАПИСАНИЕ. Вход фабрик-рендера пишет ФЛЭТОВЫЙ верстак, вход 3D —
 * РЕНДЕРНЫЙ; всё остальное у них совпадает построчно. Второе написание этого жеста разошлось бы с
 * первым на первой же правке — ровно тем дефектом, за который эта полоса уже платила («сделай
 * везде одинаково»).
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

/** Склеенный лист вместе со своими кусками — ровно то, что рисует ячейка «мультивью». */
export type SplitDeck = {
  sheet: common_DesignPicture;
  /** Куски, чей `ghost_view` — сторона силуэта. Первый на сторону: разрез — один на лист. */
  pieces: SplitPiece[];
  /**
   * Виды, которые лист ОБЪЯВЛЯЕТ (`composite_views`), даже если разреза ещё нет. Это то, что
   * человек читает на самой карточке; `pieces` — то, что уже можно применить.
   */
  declared: string[];
};

/**
 * СКЛЕЕННЫЕ ЛИСТЫ ЭТОГО РОДА, С ИХ РАЗРЕЗАМИ.
 *
 * ⚠ ПОЧЕМУ ЭТОТ СПИСОК СТРОИТСЯ ЗДЕСЬ, А НЕ БЕРЁТСЯ ИЗ `unmarkedFlats`. `isFlatCandidate`
 * ВЫБРАСЫВАЕТ композиты намеренно и правильно: «a render reads ONE drawing per view, so it must be
 * split first» — в СЛОТ такой лист не встаёт, сервер отказывает (`ErrDesignCompositePlate`).
 * Ровно поэтому владелец их и не видел: экран честно прятал то, что нельзя пометить. E-6 просит не
 * ослабить фильтр, а показать эти листы ВТОРЫМ родом ячейки — с другим глаголом («разрезать» и
 * «применить разрез»), а не с `mark ▸`, который отказал бы.
 *
 * ⚠ РОДСТВО ЧИТАЕТСЯ `cropFamilies` — ТЕМ ЖЕ ЧИТАТЕЛЕМ, ЧТО У ЛЕНТЫ И У ВЫХОДОВ. Он лезет к КОРНЮ
 * родословной, а не к родителю: у куска, вырезанного из ОТРЕДАКТИРОВАННОГО листа, родитель —
 * правка, а корень — сам лист.
 */
export function splitDecks(band: GetDesignBandResponse, rep: Representation): SplitDeck[] {
  const rows = cardOutputRows(band, rep);
  const pictures: common_DesignPicture[] = [];
  if (rows) {
    for (const row of rows) pictures.push(row.picture);
  } else {
    /**
     * Сервер не назвал `outputs` (откаченный бинарь) — читаем страницу ленты, ровно как это делает
     * `outputsOfKind` в той же ветке.
     *
     * ⚠ РОД ФИЛЬТРУЕТСЯ И ЗДЕСЬ, И ЭТО НЕ ПЕДАНТИЧНОСТЬ. Ветка `outputs` сужает по роду сама
     * (`cardOutputRows(band, rep)`); ветка ленты, не сужающая, показала бы склеенные ЛИСТЫ ФЛЭТОВ
     * во входе 3D и ЛИСТЫ РЕНДЕРОВ во входе фабрик-рендера — то есть предложила бы поставить
     * чертёж в рендер-слот и получить `wrong_kind` от сервера. Кусок наследует род родителя на
     * СЕРВЕРЕ, в момент разреза, поэтому родословная внутри одного рода не рвётся.
     */
    for (const run of band.runs ?? []) {
      if (!run.pictures) continue;
      for (const picture of run.pictures) {
        if ((picture.id ?? 0) <= 0 || isPictureHidden(picture)) continue;
        if (pictureRepresentation(band, picture) !== rep) continue;
        pictures.push(picture);
      }
    }
  }

  const families = cropFamilies(pictures);
  const out: SplitDeck[] = [];
  for (const sheet of pictures) {
    const id = sheet.id ?? 0;
    const declared = (sheet.compositeViews ?? []).filter(Boolean);
    if (id <= 0 || declared.length === 0) continue;

    const seen = new Set<string>();
    const pieces: SplitPiece[] = [];
    for (const piece of families.membersOf.get(id) ?? []) {
      const view = normaliseViewKey(piece.ghostView);
      // Кусок без стороны — законный (человек мог вырезать деталь), но применить его некуда:
      // он не называет слот. Молча выдумывать сторону было бы враньём в оплаченном входе.
      if (!isSilhouetteView(view) || seen.has(view)) continue;
      seen.add(view);
      pieces.push({ view: view as SilhouetteView, picture: piece });
    }
    // Порядок сторон — обхода силуэта, а не разреза: человек читает вход слева направо.
    pieces.sort(
      (a, b) => SILHOUETTE_VIEWS.indexOf(a.view) - SILHOUETTE_VIEWS.indexOf(b.view),
    );
    out.push({ sheet, pieces, declared });
  }
  return out;
}

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
  sides,
  pieces,
  benchKind,
  colorwayId,
  disabled,
  /** Как этот экран зовёт то, что кладёт в сторону, — «render» или «flat». Для слов вопроса. */
  noun,
}: {
  techCardId: number;
  sides: BenchSide[];
  pieces: SplitPiece[];
  benchKind: 'flat' | 'render';
  colorwayId: number;
  disabled?: boolean;
  noun: string;
}): JSX.Element | null {
  const writes = useDesignWrites(techCardId);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<{
    done: SilhouetteView[];
    failed: { view: SilhouetteView; reason: string }[];
  } | null>(null);

  const steps = useMemo(() => applyPlan(sides, pieces), [sides, pieces]);
  const places = steps.filter((s) => s.act === 'place');
  const clears = steps.filter((s) => s.act === 'clear');
  /** Сколько сторон ТЕРЯЮТ то, что на них стоит. Ровно это и есть разрушительная половина жеста. */
  const losing = steps.filter((s) => s.displaces);

  if (!pieces.length) return null;

  const run = async () => {
    if (busy) return;
    setBusy(true);
    setOutcome(null);
    const done: SilhouetteView[] = [];
    const failed: { view: SilhouetteView; reason: string }[] = [];
    for (const step of steps) {
      try {
        await writes.setBenchSlot.mutateAsync({
          // Род СПЕЛЛИТСЯ всегда: пустое поле сервер читает как `flat`, и «что бы ни стало
          // умолчанием» завтра. Колорвей — тот же, под которым этот экран читает верстак.
          /* ⚠ `slotId` НЕ СТАВИТСЯ ВОВСЕ. `view_key` и `slot_id` — ЧЛЕНЫ ОДНОГО `oneof`, и
             ноль в proto-JSON это ЗАДАННОЕ поле: сервер отвечал «oneof … is already set» и не
             записывал НИ ОДНОЙ стороны. Верстак флэтов всегда слал только `viewKey` — поэтому
             работал он, а эти двери не работали ни разу. */
          slot: { viewKey: step.view, kind: benchKind, colorwayId },
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

  const placeWords = places.map((s) => viewLabel(s.view)).join(', ');
  const clearWords = clears.map((s) => viewLabel(s.view)).join(', ');
  const losingWords = losing.map((s) => viewLabel(s.view)).join(', ');

  return (
    <div className='flex flex-col gap-1' data-apply-split={pieces.length}>
      {/* `w-full` — та же ширина, что у соседних дверей полосы: все они — кнопки `xs` во всю
          ячейку, на одной линии (F-14). Потеря названа на самой двери, до нажатия, подсказкой;
          вопрос — между нажатием и записью. */}
      <Button
        variant='secondary'
        size='xs'
        className='w-full'
        loading={busy}
        disabled={disabled}
        data-apply-split-door=''
        data-apply-split-losing={losing.length}
        title={
          losing.length
            ? `${placeWords || 'no side'} take the pieces; ${losingWords} ${losing.length === 1 ? `loses its ${noun}` : `lose their ${noun}s`} — you are asked first`
            : `${placeWords || 'no side'} take the pieces; no side loses anything`
        }
        onClick={() => (losing.length ? setAsking(true) : void run())}
      >
        apply splitted
      </Button>

      <ConfirmationModal
        open={asking}
        onOpenChange={setAsking}
        title='replace the whole input with this split?'
        confirmLabel='replace the input'
        onConfirm={() => {
          setAsking(false);
          void run();
        }}
      >
        <div className='flex flex-col gap-2'>
          <Text size='control' component='p' className='normal-case'>
            {places.length > 0 && (
              <>
                <b>{placeWords}</b> take the pieces of this split.{' '}
              </>
            )}
            {clears.length > 0 && (
              <>
                <b>{clearWords}</b> {clears.length === 1 ? 'is' : 'are'} emptied — the split does not
                name {clears.length === 1 ? 'that side' : 'those sides'}.
              </>
            )}
          </Text>
          <Text size='control' component='p' className='normal-case'>
            {losing.length} of the four sides {losing.length === 1 ? 'holds a' : 'hold a'} {noun}{' '}
            right now, and {losing.length === 1 ? 'it goes' : 'they go'} out of the input:{' '}
            {losing.map((s) => viewLabel(s.view)).join(', ')}. Nothing is deleted — every picture
            stays on the card and can be put back one side at a time.
          </Text>
        </div>
      </ConfirmationModal>

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
