import { common_MediaFull, common_TechCard } from 'api/proto-http/admin';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import Media from 'ui/components/media';
import { Pill } from 'ui/components/pill';
import { Placeholder } from 'ui/components/placeholder';
import Text from 'ui/components/text';
import { mediaAspect } from './sample-cut-views';
import { TechCardFormData } from './schema';
import {
  attachmentKindLabel,
  densityText,
  operationHeading,
  seamAllowanceText,
  seamClassLabel,
  topstitchPhrase,
} from './operation-options';
import { useOperationWorkCatalog } from './useOperationWorkCatalog';
import { useWorkshopSettings } from 'components/managers/workshop/useWorkshopSettings';
import { decimalToInput } from 'utils/decimal';

// ---------------------------------------------------------------------------
// ASSEMBLY MAP — the sketch and the operation list, joined.
//
// Both halves already exist and already reference each other BY NUMBER: an operation carries
// `callout_number`, a callout carries its position on a sketch image. Nothing ever drew the join,
// so turning a fitting complaint ("the pin by the sleeve head") into "which operation, on which
// machine, joining which pieces" was three tab switches and a number held in your head.
//
// Order is real, not invented: operations are POSITIONAL — the server stamps
// operation_number = (position + 1) × 10 on save (schema.ts), so the array order IS the assembly
// order the factory reads. The list here is therefore in the card's order, unsorted.
// ---------------------------------------------------------------------------

// This shape is the FORM's, not the wire's — it is read straight out of react-hook-form, which is
// why nothing here is type-checked against the proto and why the operations break could silently
// leave it reading eleven fields that no longer exist.
type FormOperation = {
  operationType?: string;
  // «На чём» (0306) — the step type says MACHINE, this says which of the twenty-five, and the
  // heading's verb comes from it.
  machineType?: string;
  zone?: string;
  seamClass?: string;
  // РАБОТА (0330) — НАЗВАННОЕ имя шага. Карта примерки читает те же строки формы, что рельс, и
  // обязана звать шаг тем же словом: технолог, приколовший булавку, и швея у машины должны
  // говорить об одном шаге одинаково.
  work?: string;
  stitchesPerCm?: string;
  seamAllowanceMm?: string;
  topstitchMode?: string;
  topstitchWidthMm?: string;
  attachmentKind?: string;
  smv?: string;
  note?: string;
  calloutNumber?: number;
  operationNumber?: number;
  inputKeys?: string[];
};

type FormCallout = {
  number?: number;
  part?: string;
  description?: string;
  mediaId?: number;
  posX?: string;
  posY?: string;
};
type FormPiece = { name?: string; lineKey?: string };

const decimalNum = (v?: string): number => {
  const n = Number(v ?? '');
  return Number.isFinite(n) ? n : NaN;
};

/**
 * The spec line under an operation: what was actually filled in — plus the ONE fact that is filled
 * in ABOVE the step, joined with ·
 *
 * «ПЛЮС ОДИН» — ЭТО ПРИПУСК, И ОГОВОРКА ЗДЕСЬ ГЛАВНОЕ СЛОВО. Строка годами читала ТОЛЬКО
 * собственные значения шага, и для класса шва, отстрочки и лапки это по-прежнему верно: пусто —
 * значит не назначено. Припуск же ХРАНИТСЯ только там, где шаг его переопределяет, и «пусто»
 * означает у него «действует стандарт карточки или цеха». Читая его тем же правилом, что соседей,
 * карта печатала пустоту на шаге, который припуск исправно наследует, — а редактор в ту же секунду
 * печатал число. Лестницу знает `seamAllowanceText`, и обе поверхности зовут теперь её.
 *
 * ЯРЛЫКИ — ОБЩИЕ СОСТАВИТЕЛИ, А НЕ ЗДЕШНИЙ ПОИСК ПО МАССИВУ. `label(...)`, стоявший тут, был
 * второй редакцией правила «UNKNOWN значит наследовать, чужой токен значит промолчать», уже
 * записанного в `seamClassLabel` и `attachmentKindLabel`.
 */
function specLine(
  o: FormOperation,
  pieceNames: string[],
  /** Ступени припуска НАД шагом — стандарт карточки и стандарт цеха. */
  standards: { card?: string; workshop?: string },
): string {
  return [
    pieceNames.join(' + '),
    seamClassLabel(o.seamClass),
    // ПЛОТНОСТЬ И ДЛИНА — ОДНИМ СОСТАВИТЕЛЕМ (`densityText`), ровно по той же причине, что и фраза
    // отстрочки двумя строками ниже. Здесь стояла ручная сборка, и она теряла ВТОРУЮ ПОЛОВИНУ
    // чтения: длина стежка в мм не хранится нигде — она считается как `10 / плотность`, и формула
    // живёт в одном экземпляре (`stitchLengthMm`) затем, чтобы бумага не начала округлять иначе,
    // чем экран. Карта примерки и была той самой третьей копией, только урезанной до половины: у
    // оператора, у которого на машинке диал ДЛИНЫ СТЕЖКА, «4 st/cm» без «(2.5 мм)» превращается в
    // деление в уме, у станка.
    //
    // (Ярлык здесь когда-то говорил «SPI» — стежки на ДЮЙМ — пока все прочие поверхности говорили
    // st/cm: две разные величины под одним числом. Общий составитель закрывает и это навсегда.)
    densityText(o.stitchesPerCm),
    // ПРИПУСК — ОБЩИМ СОСТАВИТЕЛЕМ, С ЛЕСТНИЦЕЙ. Здесь стояла ручная сборка «SA 10 mm», и она
    // теряла ДВЕ вещи разом. Слово: «SA» — двухбуквенный токен в верхнем регистре, стоящий в том
    // же списке ·, что коды ISO 4916 (SS, LS, EF, BS, FS, OS), с которыми он не имеет ничего
    // общего; редактор в ту же секунду печатал «allowance». И факт: собственное значение шага —
    // единственное, что она умела назвать, — так что шаг, ИСПРАВНО наследующий припуск карточки,
    // выглядел здесь шагом без припуска вовсе.
    seamAllowanceText({
      own: o.seamAllowanceMm,
      card: standards.card,
      workshop: standards.workshop,
      operationType: o.operationType,
      seamClass: o.seamClass,
    }),
    // ОДИН СОСТАВИТЕЛЬ ФРАЗЫ НА СХЕМУ И НА ЛИСТ (topstitchPhrase), поэтому бумага и карта сборки
    // не могут сказать про один шаг разное. Миллиметры приезжают С ЛИНИЕЙ, от которой их меряют:
    // «topstitch 6 mm» называла величину и прятала отсчёт, а отсчёт у двух числовых режимов разный
    // — край детали у «at the edge», линия шва у «parallel».
    //
    // И РЕЖИМ БЕЗ ЧИСЛА ТЕПЕРЬ ТОЖЕ НАЗЫВАЕТСЯ: «in the ditch» — инструкция целиком, а схема о ней
    // прежде молчала вовсе (условие требовало заполненных миллиметров), так что шаг с отстрочкой в
    // шов выглядел на карте шагом без отстрочки.
    topstitchPhrase(o.topstitchMode, o.topstitchWidthMm)
      ? `topstitch ${topstitchPhrase(o.topstitchMode, o.topstitchWidthMm)}`
      : '',
    attachmentKindLabel(o.attachmentKind),
  ]
    .filter(Boolean)
    .join(' · ');
}

export function SampleAssemblyMap({ techCard }: { techCard?: common_TechCard }) {
  const { control } = useFormContext<TechCardFormData>();
  // Каталог работ — одной подпиской на всю карту: ключ у запроса общий на приложение, второго
  // обращения к сети нет. Не приехал — имена деградируют до сегодняшних, а не до пустоты.
  const { catalog: workCatalog } = useOperationWorkCatalog();
  // СТУПЕНИ ПРИПУСКА НАД ШАГОМ — те же две, по которым ходит редактор: стандарт карточки (её
  // собственное поле, читается той же формой) и стандарт цеха. Настройки цеха — одна строка на всё
  // приложение и один ключ запроса, тот же, что уже прочитал редактор рядом: второго обращения к
  // сети здесь нет, а не приехал ответ — ступень просто молчит, как молчала бы пустая.
  const cardAllowanceMm = (useWatch({ control, name: 'requiredSeamAllowanceMm' }) ?? '') as string;
  const { data: workshop } = useWorkshopSettings();
  const shopAllowanceMm = decimalToInput(workshop?.settings?.defaultSeamAllowanceMm).trim();
  const operations = (useWatch({ control, name: 'operations' }) ?? []) as FormOperation[];
  const callouts = (useWatch({ control, name: 'callouts' }) ?? []) as FormCallout[];
  const pieces = (useWatch({ control, name: 'pieces' }) ?? []) as FormPiece[];

  const pieceNameByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pieces) if (p.lineKey && p.name?.trim()) m.set(p.lineKey, p.name.trim());
    return m;
  }, [pieces]);

  const { sketch, pins, orphanCallouts, totalTime, uncosted } = useMemo(() => {
    const calloutByNumber = new Map<number, FormCallout>();
    for (const c of callouts) if (c.number) calloutByNumber.set(c.number, c);

    // A callout that no operation answers is an unanswered question, not a gap to hide.
    const answered = new Set(operations.map((o) => o.calloutNumber ?? 0).filter((n) => n > 0));
    const orphans = callouts.filter((c) => c.number && !answered.has(c.number));

    // Draw whichever sketch carries the most callouts this list points at.
    const counts = new Map<number, number>();
    for (const n of answered) {
      const c = calloutByNumber.get(n);
      if (c?.mediaId) counts.set(c.mediaId, (counts.get(c.mediaId) ?? 0) + 1);
    }
    for (const c of orphans) {
      if (c.mediaId) counts.set(c.mediaId, (counts.get(c.mediaId) ?? 0) + 1);
    }
    let bestId = 0;
    let best = 0;
    for (const [id, n] of counts) {
      if (n > best) {
        best = n;
        bestId = id;
      }
    }
    const resolved = (techCard?.resolvedTechnicalMedia ?? [])
      .map((rm) => rm.media)
      .filter((m): m is common_MediaFull => !!m?.id);
    const chosen = bestId ? resolved.find((m) => m.id === bestId) : resolved[0];
    const chosenId = chosen?.id ?? 0;

    const marks = callouts
      .filter((c) => !!c.number && c.mediaId === chosenId)
      .map((c) => ({ c, answered: answered.has(c.number as number) }));

    let time = 0;
    let missing = 0;
    for (const o of operations) {
      const t = Number(o.smv ?? '');
      if (Number.isFinite(t) && t > 0) time += t;
      else missing += 1;
    }

    return {
      sketch: chosen,
      pins: marks,
      orphanCallouts: orphans,
      totalTime: time,
      uncosted: missing,
    };
  }, [operations, callouts, techCard?.resolvedTechnicalMedia]);

  if (operations.length === 0 && callouts.length === 0) {
    return (
      <CalloutBox tone='note'>
        <Text size='micro'>
          nothing to map yet — pin callouts on the technical sketch and describe the operations on
          the construction tab, and they meet here
        </Text>
      </CalloutBox>
    );
  }

  const url = sketch?.media?.fullSize?.mediaUrl || sketch?.media?.thumbnail?.mediaUrl || '';

  return (
    <div className='grid grid-cols-1 items-start gap-2.5 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]'>
      <div>
        {url ? (
          <div className='relative border border-borderColor'>
            <Media src={url} alt='technical sketch' aspectRatio={mediaAspect(sketch)} fit='cover' />
            {pins.map(({ c, answered }) => {
              const x = decimalNum(c.posX);
              const y = decimalNum(c.posY);
              if (Number.isNaN(x) || Number.isNaN(y)) return null;
              return (
                <span
                  key={c.number}
                  title={c.description?.trim() || c.part?.trim() || `callout ${c.number}`}
                  style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
                  className={`absolute flex size-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border text-nano leading-none tabular-nums ${
                    answered
                      ? 'border-bgColor bg-textColor text-bgColor'
                      : 'border-error bg-bgColor text-error'
                  }`}
                >
                  {c.number}
                </span>
              );
            })}
          </div>
        ) : (
          <Placeholder aspect='3/4' label='no technical sketch' />
        )}
        <Text size='nano' variant='label' className='mt-1 uppercase'>
          filled pin = an operation answers it · hollow = nothing does
        </Text>
      </div>

      <div>
        <div className='mb-1 flex flex-wrap items-center gap-1.5'>
          <Pill tone='mut'>
            {operations.length} operation{operations.length === 1 ? '' : 's'}
          </Pill>
          {totalTime > 0 && <Pill tone='mut'>{Number(totalTime.toFixed(2))}′ SAM</Pill>}
          {uncosted > 0 && <Pill tone='attention'>{uncosted} without a time norm</Pill>}
          {orphanCallouts.length > 0 && (
            <Pill tone='attention'>{orphanCallouts.length} callout without an operation</Pill>
          )}
        </div>

        <GroupLabel>operations — in the card’s order</GroupLabel>
        <div className='flex flex-col'>
          {operations.map((o, i) => {
            // Неизвестный ключ — узел: показываем его меткой, а не выбрасываем. Иначе шаг,
            // собирающий два узла, отрисовался бы вовсе без состава.
            const names = (o.inputKeys ?? []).map((k) => pieceNameByKey.get(k) ?? `▣ ${k}`);
            const spec = specLine(o, names, {
              card: cardAllowanceMm,
              workshop: shopAllowanceMm,
            });
            const t = Number(o.smv ?? '');
            return (
              <div
                key={i}
                className='grid grid-cols-[auto_minmax(0,1fr)_auto] items-baseline gap-2 border-b border-hairline py-1'
              >
                <span className='flex size-4 shrink-0 items-center justify-center bg-textColor text-nano leading-none tabular-nums text-bgColor'>
                  {o.calloutNumber ? o.calloutNumber : i + 1}
                </span>
                <span className='min-w-0'>
                  <Text size='micro' component='span' data-map-step={i}>
                    {operationHeading({
                      operationType: o.operationType as Parameters<
                        typeof operationHeading
                      >[0]['operationType'],
                      // The verb of a machine step is its machine's (0306) — without this every
                      // sewing step on the map reads «machine».
                      machineType: o.machineType as Parameters<
                        typeof operationHeading
                      >[0]['machineType'],
                      // ...а вид — из класса шва: у отстрочки якорь именно там, и без него карта
                      // называла бы её «join» рядом с редактором, который зовёт её «Topstitch».
                      seamClass: o.seamClass,
                      // ...а названная работа бьёт обе выведенные лестницы (R8): шаг, которому
                      // назначили работу, зовётся здесь её подписью — той же, что в рельсе и на
                      // печатном листе.
                      work: o.work,
                      workCatalog,
                      zone: o.zone as Parameters<typeof operationHeading>[0]['zone'],
                      pieceNames: names,
                      note: o.note,
                    }) || `operation ${i + 1}`}
                  </Text>
                  {spec && (
                    <Text size='nano' variant='label' className='uppercase'>
                      {spec}
                    </Text>
                  )}
                  {!o.calloutNumber && (
                    <Text size='nano' variant='label' className='uppercase'>
                      not pinned to the sketch
                    </Text>
                  )}
                </span>
                <Text
                  size='nano'
                  variant='label'
                  component='span'
                  className='shrink-0 tabular-nums uppercase'
                >
                  {Number.isFinite(t) && t > 0 ? `${Number(t)}′` : '—'}
                </Text>
              </div>
            );
          })}
        </div>

        {orphanCallouts.length > 0 && (
          <div className='mt-1.5'>
            <GroupLabel>callouts nothing answers</GroupLabel>
            {orphanCallouts.map((c) => (
              <div
                key={c.number}
                className='flex items-baseline gap-2 border-b border-hairline py-1'
              >
                <span className='flex size-4 shrink-0 items-center justify-center border border-error text-nano leading-none tabular-nums text-error'>
                  {c.number}
                </span>
                <Text size='micro' variant='error' component='span' className='min-w-0'>
                  {c.description?.trim() || c.part?.trim() || 'no note'}
                </Text>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
