// РАСХОД ПО ДЕТАЛЯМ — ИЗ ЧЕГО СЛОЖИЛАСЬ ПЛОЩАДЬ ИЗДЕЛИЯ, СТРОКА НА ДЕТАЛЬ.
//
// До этого разбора норма «по выкройкам» показывалась одним числом на размер: 12 480 см² → 0.867 м.
// Число верное, но непроверяемое — из него не видно НИ ОДНОЙ детали, а ошибаются здесь именно в
// деталях: не тот блок привязан, кратность на изделие поставлена вдвое, карман забыли, спинка
// нарисована с припуском, а полочка без. Все эти ошибки дают правдоподобное итоговое число.
//
// ЧТО ЭТА ТАБЛИЦА ОБЯЗАНА ДЕРЖАТЬ, И ДЕРЖИТ:
//
//   • ИТОГ СХОДИТСЯ. Сумма колонки «вклад» — это и есть площадь изделия того же размера, из которой
//     считается норма (dxfNormAreas складывает ровно эти слагаемые: кратность × площадь контура).
//     Поэтому строка итога печатает площадь ИЗ РАСЧЁТА, а не пересумму: разойдись они однажды —
//     это видно глазом, а не спрятано за нашей же арифметикой.
//   • НИЧЕГО НЕ СЧИТАЕТСЯ ЗАНОВО. Площади берутся из `areas.pieceRows` — той же проекции, что
//     уезжает на сервер (0297). Вторая реализация выбора контура под размер разошлась бы с первой
//     на первой же правке, и «расход по деталям» показывал бы не то, что применяется.
//   • ДОЛЯ — ОТ ПЛОЩАДИ РАСЧЁТА, А НЕ ОТ СУММЫ СТРОК. Деталь, которой в проекции не нашлось
//     (сохранённого line_key нет), не должна раздувать проценты соседей до сотни: тогда неполнота
//     стала бы невидимой. Проценты просто не сойдутся в 100, и внизу об этом сказано словами.
//
// РАЗМЕР ВЫБИРАЕТСЯ, А НЕ УСРЕДНЯЕТСЯ. Градуируемая деталь в S и в XL — разная площадь, и среднее
// по ряду не соответствует ни одному настилу; выбор размера чипом честнее и полезнее (по нему же
// смотрят раскладку). По умолчанию — СРЕДИННЫЙ размер ряда, тот же, которым рисуются силуэты
// деталей везде в карточке (findPiece), чтобы картинка и число описывали одно и то же.
import { formatSizeName } from 'components/managers/product/utility/sizes';
import { cn } from 'lib/utility';
import { useMemo } from 'react';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { PieceSilhouette } from '../piece-silhouette';
import { nettoLengthCm, type DxfNormAreas, type DxfNormPiece } from './dxf-consumption';
import { findPiece, type DxfIndex, type FoundPiece } from './dxf-geometry';
import { toBomUnit, type FabricWeightBasis } from './marker-io';

/** Вклад одной детали в площадь изделия ОДНОГО размера. */
export type PieceContribution = {
  lineKey: string;
  name: string;
  /** `pieces_per_garment` карточки. */
  perGarment: number;
  /** Площадь ОДНОГО экземпляра контура, см² — ровно как в проекции для сервера. */
  areaCm2: number;
  /** perGarment × areaCm2 — то, что складывается в площадь изделия. */
  totalCm2: number;
  /** Деталь одна на весь ряд: её строка пришла с размером 0. */
  ungraded: boolean;
  /** Контур заменён выпуклой оболочкой при раздутии припуском — площадь с запасом. */
  hulled: boolean;
  /** На слое было несколько совпадающих кандидатов, взят первый. */
  ambiguousPick: boolean;
};

/**
 * Слагаемые площади одного размера, в порядке убывания вклада.
 *
 * Порядок — НЕ порядок деталей карточки, и это осознанно: у таблицы один вопрос («на что уходит
 * ткань»), и ответ на него — крупнейшая деталь первой. Алфавит и порядок объявления отвечают на
 * другой вопрос, и на него отвечает вкладка деталей кроя.
 */
export function pieceContributions(
  pieces: readonly DxfNormPiece[],
  pieceRows: readonly DxfNormAreas['pieceRows'][number][],
  sizeId: number,
): PieceContribution[] {
  const out: PieceContribution[] = [];
  for (const p of pieces) {
    const key = (p.lineKey ?? '').trim();
    if (!key) continue;
    // Градуируемая деталь отвечает своей строкой размера; неградуируемая — единственной строкой с
    // размером 0 (она и есть одна на все размеры). Порядок проверки именно такой: строка размера
    // сильнее, если по какой-то причине есть обе.
    const row =
      pieceRows.find((r) => r.pieceLineKey === key && r.sizeId === sizeId) ??
      pieceRows.find((r) => r.pieceLineKey === key && r.sizeId === 0);
    if (!row) continue;
    const perGarment = Math.max(1, Math.round(p.perGarment || 1));
    out.push({
      lineKey: key,
      name: p.name,
      perGarment,
      areaCm2: row.areaCm2,
      totalCm2: perGarment * row.areaCm2,
      ungraded: row.sizeId === 0,
      hulled: row.hulled,
      ambiguousPick: row.ambiguousPick,
    });
  }
  return out.sort((a, b) => b.totalCm2 - a.totalCm2);
}

/** Срединный размер набора — тот же выбор, которым рисуются силуэты деталей (findPiece). */
export function middleSize(sizeIds: readonly number[]): number {
  return sizeIds.length === 0 ? 0 : sizeIds[Math.floor((sizeIds.length - 1) / 2)];
}

// Визуальный контракт `Chip` — тот же, что у примитива (ui/components/chip.tsx): выбранный
// заливается ink с белым текстом, невыбранный — белый с серой рамкой и потемнением на ховере.
// Продублирован СОЗНАТЕЛЬНО, ровно ради одного свойства, которого у примитива нет; см. ниже.
const sizeChip =
  'inline-flex cursor-pointer items-center border px-[7px] py-px text-micro uppercase tracking-pill transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor';
const sizeChipOn = 'border-textColor bg-textColor text-bgColor';
const sizeChipOff = 'border-borderColor bg-bgColor text-labelColor hover:text-textColor';

/**
 * Ряд чипов «по какому размеру разобрано».
 *
 * Отдельно от таблицы, потому что читателей два и стоят чипы у них в РАЗНЫХ местах: в диалоге
 * применения размер правит и формулу, и разбивку сразу, поэтому чипы стоят у формулы; в
 * раскрывашке пересчёта разбивка одна, и чипы стоят над ней. Общими они здесь ровно затем, чтобы
 * слово «размер» и порядок кнопок не разъехались между двумя поверхностями одного расчёта.
 *
 * ⚠ ЭТО НЕ `Chip`, И ЭТО ВЫНУЖДЕННО. `Chip` рендерится как `<button>`, а вкладка тех-карты на
 * ВЫПУЩЕННОЙ (RELEASED) карточке целиком лежит внутри `<fieldset disabled>`, который глушит любой
 * form control — кнопку, селект, инпут. Раскрывашка «расход по деталям» там открывается (`<details>`
 * fieldset не берёт), а переключатель размера на `Chip` умирал бы МОЛЧА: замороженная карточка
 * показывала бы разбор ровно одного, срединного размера и никак не сообщала, что остальные есть.
 * Это та же ловушка, что уже ловила раскрывашки на кнопках; здесь она закрыта тем, что чип —
 * `<span role="radio">`: у не-контрола disabled-предок клики не отбирает.
 *
 * Роль `radio` в `radiogroup`, а не `button`: выбор ОДНОГО из взаимоисключающих значений — это
 * радиогруппа, и скринридер обязан прочитать «размер M, 2 из 4», а не четыре отдельные кнопки.
 * Клавиатура — Enter и пробел, как у нативного радио.
 */
export function BreakdownSizeChips({
  sizeIds,
  sizeId,
  sizeNameById,
  onChange,
  label = 'разобрано по размеру',
}: {
  sizeIds: readonly number[];
  sizeId: number;
  sizeNameById: Map<number, string>;
  onChange: (sizeId: number) => void;
  label?: string;
}) {
  if (sizeIds.length < 2) return null;
  return (
    <div className='flex flex-wrap items-baseline gap-2'>
      {/* Подпись опускается пустой строкой там, где её уже несёт заголовок группы: два раза слово
          «размер» в одной строке читается как две разные настройки. */}
      {label && (
        <Text size='micro' variant='label' component='span' className='uppercase'>
          {label}
        </Text>
      )}
      <div
        role='radiogroup'
        aria-label='размер, по которому показан разбор'
        className='flex flex-wrap items-center gap-1'
      >
        {sizeIds.map((id) => {
          const on = id === sizeId;
          return (
            <span
              key={id}
              role='radio'
              aria-checked={on}
              // ФОКУСИРУЕМЫ ВСЕ, а не только выбранный: перекатывающийся tabindex обязан
              // возить фокус стрелками, а без этого он просто отнимает у клавиатуры доступ к
              // невыбранным размерам. Четыре чипа в Tab-порядке дешевле и работают.
              tabIndex={0}
              className={cn(sizeChip, on ? sizeChipOn : sizeChipOff)}
              onClick={() => onChange(id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(id);
                }
              }}
            >
              {formatSizeName(sizeNameById.get(id) ?? `#${id}`)}
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Разряды разделяются — 12 480 читается, 12480 пересчитывается пальцем. Неразрывным пробелом,
// который отдаёт сама локаль: тонкий (U+202F) в FeatureMono покрыт не везде и вылезал бы «тофу».
export const fmtInt = (n: number) => Math.round(n).toLocaleString('ru-RU');

/**
 * То же, но С ДРОБНОЙ ЧАСТЬЮ — для чисел, которые ВХОДЯТ В ПОКАЗАННОЕ ДЕЛЕНИЕ.
 *
 * Площадь в сотнях тысяч см² округляется до целых без потери смысла, а вот сомножители формулы
 * округлять нельзя: полоса «1 042 ÷ 6 = 1.737» существует затем, чтобы деление можно было
 * проверить в уме, и «100 ÷ 1 = 1.005» ломает ровно это — единственное, ради чего она есть.
 *
 * Разделитель дробной части — ТОЧКА, а не запятая локали: рядом стоит само частное, пришедшее с
 * провода десятичной строкой через точку, и две нотации в одной строке читаются как две системы
 * счисления.
 */
export const fmtNum = (n: number, maxFrac = 2) => {
  const rounded = Math.round(n * 10 ** maxFrac) / 10 ** maxFrac;
  const [int, frac] = String(rounded).split('.');
  const head = Number(int).toLocaleString('ru-RU');
  return frac ? `${head}.${frac}` : head;
};

/**
 * ФОРМУЛА НОРМЫ — ТРЕМЯ ЧИСЛАМИ, А НЕ АБЗАЦЕМ.
 *
 * Диалог применения открывался пятистрочным объяснением, а число, ради которого его открыли, лежало
 * под ним таблицей в один вес со всем остальным. Проверить его было нечем: чтобы понять, откуда
 * взялось 0.867, надо было прочитать текст, найти в нём слово «раскройная», вспомнить, чему она
 * равна у этого артикула, и поделить в уме.
 *
 * Здесь те же три величины стоят равенством: делимое, делитель, частное. Это объясняет формулу без
 * единого предложения и делает результат проверяемым в одно движение глаз — а ошибку в ширине,
 * которая входит в норму ЛИНЕЙНО и больше нигде не видна, ловит на месте.
 *
 * Оператор («÷», «=») — часть ПОДПИСИ следующей ячейки, а не своя колонка: строится это на общей
 * StatGrid, которая сама переносит ячейки на узком экране, и колонка с одним глифом при переносе
 * повисала бы отдельной строкой.
 */
export function NettoFormula({
  areaCm2,
  sizeLabel,
  cuttingWidthCm,
  netto,
  unit,
}: {
  areaCm2: number;
  sizeLabel: string;
  cuttingWidthCm: number;
  /** Готовое netto в единице строки; null — считать не из чего (нет ширины либо единицы). */
  netto: number | null;
  unit: string;
}) {
  return (
    <StatGrid min={150}>
      <Stat label='Σ площадь деталей' value={fmtInt(areaCm2)} sub={`см² · размер ${sizeLabel}`} />
      <Stat
        label='÷ раскройная ширина'
        value={cuttingWidthCm > 0 ? fmtInt(cuttingWidthCm) : '—'}
        sub='см · рулон − 2×кромка'
      />
      <Stat
        label='= netto на изделие'
        value={netto != null ? netto : '—'}
        sub={unit ? `${unit} · без межлекальных выпадов` : 'единица слота не задана'}
      />
    </StatGrid>
  );
}

/**
 * Таблица «расход по деталям» для одного размера.
 *
 * Монтируется только там, где геометрия УЖЕ разобрана (диалог применения, открытая раскрывашка
 * пересчёта): ни одного запроса и ни одного разбора отсюда не начинается.
 */
export function DxfPieceBreakdown({
  index,
  pieces,
  areas,
  sizeId,
  sizeNameById,
  cuttingWidthCm,
  unit,
  fabric,
}: {
  /** Разобранная пачка — нужна только силуэтам; null рисует таблицу без картинок. */
  index: DxfIndex | null;
  pieces: readonly DxfNormPiece[];
  areas: DxfNormAreas;
  /** Размер, по которому разобрано. Владеет им вызывающий — см. BreakdownSizeChips. */
  sizeId: number;
  sizeNameById: Map<number, string>;
  /** РАСКРОЙНАЯ ширина, см. 0/NaN — колонки netto не будет: делить не на что. */
  cuttingWidthCm: number;
  unit: string;
  /** Основа веса кг-слота. Без неё кг не считаются, и колонка честно молчит. */
  fabric?: FabricWeightBasis;
}) {
  const rows = useMemo(
    () => pieceContributions(pieces, areas.pieceRows, sizeId),
    [pieces, areas.pieceRows, sizeId],
  );
  const shapeOf = useMemo(() => {
    const m = new Map<string, FoundPiece | null>();
    if (!index) return m;
    for (const p of pieces) {
      const key = (p.lineKey ?? '').trim();
      if (key) m.set(key, findPiece(index, p.refs));
    }
    return m;
  }, [index, pieces]);

  // ЗНАМЕНАТЕЛЬ ДОЛИ — ПЛОЩАДЬ ИЗ РАСЧЁТА, а не сумма строк (см. шапку файла).
  const garmentCm2 = areas.rows.find((r) => r.sizeId === sizeId)?.areaCm2 ?? 0;
  const listedCm2 = rows.reduce((s, r) => s + r.totalCm2, 0);
  // Расхождение больше сотой доли процента — это не дребезг double, а недостача строк.
  const unlisted = garmentCm2 > 0 && Math.abs(garmentCm2 - listedCm2) / garmentCm2 > 0.0001;

  const widthOk = Number.isFinite(cuttingWidthCm) && cuttingWidthCm > 0;
  const nettoOf = (cm2: number) => {
    if (!widthOk) return null;
    const cm = nettoLengthCm(cm2, cuttingWidthCm);
    return cm != null ? toBomUnit(cm, unit, fabric) : null;
  };
  const total = nettoOf(garmentCm2);
  const sizeLabel = formatSizeName(sizeNameById.get(sizeId) ?? `#${sizeId}`);

  if (rows.length === 0) return null;

  return (
    <div className='flex flex-col gap-1.5'>
      <DataTable>
        <thead>
          <tr>
            <th>деталь</th>
            <th>× на изделие</th>
            <th>площадь ед., см²</th>
            <th>вклад, см²</th>
            <th>доля</th>
            {widthOk && <th>netto{unit ? `, ${unit}` : ''}</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const share = garmentCm2 > 0 ? r.totalCm2 / garmentCm2 : 0;
            const netto = nettoOf(r.totalCm2);
            return (
              <tr key={r.lineKey}>
                <td>
                  <span className='flex min-w-0 items-center gap-1.5'>
                    {/* Тот же глиф, что у имени детали везде на карточке (piece-silhouette.tsx):
                        своя копия здесь дала бы одной детали два разных силуэта на двух экранах, и
                        сравнить их было бы негде. */}
                    <PieceSilhouette
                      found={shapeOf.get(r.lineKey) ?? null}
                      boxClassName='mr-0 h-6 w-9'
                    />
                    <span className='flex min-w-0 flex-col'>
                      <Text size='micro' component='span' className='truncate uppercase'>
                        {r.name}
                      </Text>
                      {(r.ungraded || r.hulled || r.ambiguousPick) && (
                        <span className='flex flex-wrap items-center gap-1 pt-0.5'>
                          {/* Неградуируемая деталь входит в КАЖДЫЙ размер целиком — на переключении
                              чипа её число не двинется, и без этой пометки это читалось бы как
                              подозрительное совпадение. */}
                          {r.ungraded && <Pill tone='mut'>во всех размерах</Pill>}
                          {r.hulled && (
                            <Pill
                              tone='attention'
                              title='контур не сошёлся при раздутии припуском и заменён выпуклой оболочкой — площадь этой детали С ЗАПАСОМ'
                            >
                              оболочка
                            </Pill>
                          )}
                          {r.ambiguousPick && (
                            <Pill
                              tone='attention'
                              title='на выбранном слое лежало несколько совпадающих по площади копий этой детали — взята первая по порядку листов в пачке'
                            >
                              копий несколько
                            </Pill>
                          )}
                        </span>
                      )}
                    </span>
                  </span>
                </td>
                <td>{r.perGarment > 1 ? `×${r.perGarment}` : <EmptyCell>×1</EmptyCell>}</td>
                <td>{fmtInt(r.areaCm2)}</td>
                <td>{fmtInt(r.totalCm2)}</td>
                <td>
                  {/* Доля — числом И полосой. Полоса отвечает на «какая деталь тут главная» без
                      чтения цифр; она монохромна, потому что цвет в этой системе носит состояние,
                      а доля — не состояние. Трек и заливка — те же, что у ранжированной полосы
                      системы (BarRow): трек `trackBg`, заливка ИНК. Заливка светло-серым
                      (`progressBg`) на светло-сером треке не читалась вовсе — проверено на экране. */}
                  <span className='flex flex-col items-end gap-0.5'>
                    <span>{(share * 100).toFixed(share < 0.1 ? 1 : 0)}%</span>
                    <span aria-hidden className='block h-[3px] w-full bg-trackBg'>
                      <span
                        className='block h-full bg-textColor'
                        style={{ width: `${Math.min(100, Math.max(2, share * 100))}%` }}
                      />
                    </span>
                  </span>
                </td>
                {widthOk && <td>{netto && netto.value > 0 ? netto.value : <EmptyCell />}</td>}
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <TotalRow>
            <td>изделие {sizeLabel}</td>
            <td />
            <td />
            <td>{fmtInt(garmentCm2)}</td>
            <td>100%</td>
            {widthOk && <td>{total ? total.value : <EmptyCell />}</td>}
          </TotalRow>
        </tfoot>
      </DataTable>

      {unlisted && (
        <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
          {`строки выше складываются в ${fmtInt(listedCm2)} см² из ${fmtInt(garmentCm2)} см² — часть деталей ещё не сохранена, и её площади не на что записать. Норма при этом считается по ПОЛНОЙ площади: расхождение только в этой разбивке`}
        </Text>
      )}
      {/* ОКРУГЛЕНИЕ НАЗЫВАЕТСЯ ВСЛУХ. Строки печатаются целыми см², итог — тоже целым, но он
          округляет ПОЛНУЮ сумму, а не сумму округлённых строк: 100.49 + 100.49 напечатаются как
          «100 + 100» при итоге «201». Расхождение до единиц см² — то есть до тысячных долей
          процента, — и подгонять под него сами числа нельзя: итог обязан остаться той площадью, из
          которой посчитана норма (иначе таблица перестанет быть проверкой). Остаётся сказать. */}
      <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
        строки округлены до целых см², итог — нет: сумма столбца «вклад» может разойтись с итогом на
        единицы. Итог — это площадь ИЗ РАСЧЁТА нормы, и подгонять её под округлённые строки значило
        бы сделать таблицу непроверяемой
      </Text>
      {widthOk ? (
        <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
          {`netto детали — её доля полотна: вклад ÷ раскройную ширину ${fmtInt(cuttingWidthCm)} см. Это не отдельная норма и никуда не сохраняется: ткань покупается одним куском на изделие, а строки складываются в него`}
        </Text>
      ) : (
        <Text size='nano' variant='label' component='p' className='max-w-[90ch]'>
          раскройная ширина неизвестна — площади показаны, а метры из них не выводятся: делить не на
          что
        </Text>
      )}
    </div>
  );
}
