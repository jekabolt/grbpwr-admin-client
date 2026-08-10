import { useQueries } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_AdminColorwayRef,
  common_TechCard,
  StyleCostComparison,
  StyleCostEstimate,
  StyleCostMaterialLine,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { techCardBomSectionOptions } from 'constants/filter';
import { useDictionary } from 'lib/providers/dictionary-provider';
import { useState } from 'react';
import { BarRow } from 'ui/components/bar-row';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Stat, StatGrid } from 'ui/components/stat-grid';
import Text from 'ui/components/text';
import { decimalToInput, parseDecimalNumber } from 'utils/decimal';
import { LineProblems, noFx, NO_PRICE, PriceOrigin } from './costing-vocab';
import { styleReadViewKeys } from './useStyleReadViews';

const num = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Optional money: a blank decimal becomes `undefined`, never 0. The difference between «этого
 * колорвея не считали» and «он стоит ноль» is the whole reason this table exists.
 */
const opt = (s?: string) => {
  const n = parseDecimalNumber(s);
  return Number.isFinite(n) ? n : undefined;
};

/** `+1.20` / `−1.20` / `0.00` — the sign is the message, so a rounding residual must not carry one. */
const signed = (n: number, digits = 2) => {
  const eps = 0.5 * Math.pow(10, -digits);
  if (Math.abs(n) < eps) return (0).toFixed(digits);
  return `${n > 0 ? '+' : '−'}${Math.abs(n).toFixed(digits)}`;
};

const sectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '—';

/** Плохо/хорошо по знаку: перерасход красный, экономия зелёная. */
const deltaTone = (d: number) =>
  Math.abs(d) < 0.005 ? undefined : d > 0 ? 'text-error' : 'text-success';

/** То же правило знака для `Stat`, у которого тон — не класс, а `up`/`down`. */
const statTone = (d?: number): 'up' | 'down' | undefined =>
  d == null || Math.abs(d) < 0.005 ? undefined : d > 0 ? 'down' : 'up';

// ─────────────────────────────────────────────────────────────────────────────────────────────
// РАЗБОР ОДНОГО КОЛОРВЕЯ
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Расход материала и то, что в нём уже сидит.
 *
 * Kept verbatim from the previous table (0261) because the distinction is load-bearing. On a
 * `bom_estimate` line the percent is a MULTIPLIER the line total already carries. On a `marker`
 * line nothing is multiplied — the measured length paid for the waste — and the percent is the
 * decomposition of what that length contains. Rendering both as a bare number made a marker row
 * read as an uplift it never received.
 */
function WastageCell({ m }: { m: StyleCostMaterialLine }) {
  if (m.wastageSource !== 'marker') {
    const pct = decimalToInput(m.wastagePct);
    if (!pct) return <EmptyCell />;
    // T7, волна 1: провенанс процента — тем же приёмом, что источник нормы в рецепте. Утверждение
    // «введено руками» здесь клиентское, но честное: другого писателя у bom_item.wastage_percent
    // сегодня не существует. Когда бекенд начнёт считать медиану по настилам и появится
    // wastage_source, эта подпись станет ветвлением («медиана по N раскроям» / «введено руками»)
    // — место для него ровно здесь.
    return (
      <span className='flex flex-col items-end gap-0.5'>
        <span>{pct}</span>
        <Text size='micro' variant='label' component='span'>
          введено руками
        </Text>
      </span>
    );
  }
  return (
    <span className='flex flex-col items-end gap-0.5'>
      <Pill tone='mut'>из раскладки</Pill>
      <Text size='micro' variant='label' component='span'>
        {/* A marker with no recorded efficiency (hand-built or imported) stores no decomposition,
            and the server's wastage_pct is the SUM of the two components — so it is 0 there too,
            not an independently known total. Printing «кромка 0% + выпады 0%» would state a split
            nobody measured; the norm still contains its waste, we just cannot say how it divides. */}
        {decimalToInput(m.wastageSelvedgePct) || decimalToInput(m.wastageCutPct)
          ? `кромка ${decimalToInput(m.wastageSelvedgePct) || '0'}% + выпады ${
              decimalToInput(m.wastageCutPct) || '0'
            }% — уже в норме`
          : 'отходы уже в норме; разложение не записано'}
      </Text>
    </span>
  );
}

/** DataTable ставит все колонки, кроме первой, вправо — а вокабулярные ячейки внутри выровнены влево. */
function RightCell({ children }: { children: React.ReactNode }) {
  return <span className='flex justify-end'>{children}</span>;
}

const BREAKDOWN_COLS = 8;
/** Всё до «сумма» — заголовок группы занимает эти колонки, чтобы итог группы встал в свой столбец. */
const BREAKDOWN_LEAD = BREAKDOWN_COLS - 2;

/**
 * ОДНА таблица, которая складывается в unit cost.
 *
 * Раньше здесь было две несвязанных таблицы (7 колонок материалов + 3 колонки статей) и НИ ОДНОГО
 * итога: увидеть, как шесть строк BOM, три статьи и процент брака превращаются в заголовочную
 * цифру, было нельзя в принципе. Теперь строки идут группами, у каждой группы своя подсумма и
 * доля, а закрывающая строка — это ровно тот unit cost, который сервер отдал в `unit_cost_base`.
 */
function Breakdown({ estimate }: { estimate: StyleCostEstimate }) {
  const cur = estimate.baseCurrency || '';
  const materials = estimate.materials ?? [];
  const articles = estimate.articles ?? [];
  const comparison = estimate.comparison;

  const unitCost = num(decimalToInput(estimate.unitCostBase));
  // Подсумма материалов — СЕРВЕРНАЯ (materials_per_unit_base), а не сумма строк ниже: строка без
  // курса в серверный итог не попала, и пересчитать её здесь значило бы показать unit cost, которого
  // сервер не считал. Ровно эти строки помечены в колонке «проблема».
  const materialsSubtotal = num(decimalToInput(estimate.materialsPerUnitBase));
  // У статей серверного агрегата нет — складываем те, что свернулись в базовую валюту.
  const articlesSubtotal = articles.reduce(
    (s, a) => s + (a.hasBase === false ? 0 : num(decimalToInput(a.amountBase))),
    0,
  );
  // Брак — ОСТАТОК, а не пересчёт процента: сервер округляет составляющие независимо, и только
  // остаток гарантирует, что столбец «сумма» действительно складывается в заголовочную цифру.
  const defectAmount = Math.max(0, unitCost - materialsSubtotal - articlesSubtotal);
  const defectPct = num(decimalToInput(estimate.defectPct));

  const share = (n: number) => (unitCost > 0 ? `${((n / unitCost) * 100).toFixed(0)}%` : '—');
  const excluded =
    materials.filter((m) => m.hasBase === false || m.priceSource === 'STYLE_COST_PRICE_SOURCE_NONE')
      .length + articles.filter((a) => a.hasBase === false).length;

  return (
    <div className='flex flex-col gap-2 py-1'>
      <GroupLabel flush>из чего складывается unit cost</GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th>строка</th>
            <th>расход</th>
            <th>цена</th>
            <th>откуда цена</th>
            <th>проблема</th>
            <th>wastage</th>
            <th>сумма{cur ? ` (${cur})` : ''}</th>
            <th>доля</th>
          </tr>
        </thead>
        <tbody>
          <tr className='bg-bgZebra'>
            <td colSpan={BREAKDOWN_LEAD}>
              <Text
                size='micro'
                variant='label'
                tracking='group'
                component='span'
                className='font-bold uppercase'
              >
                материалы
              </Text>
            </td>
            <td>{materialsSubtotal > 0 ? materialsSubtotal.toFixed(2) : <EmptyCell />}</td>
            <td>{share(materialsSubtotal)}</td>
          </tr>
          {materials.length === 0 ? (
            <tr>
              <td colSpan={BREAKDOWN_COLS}>
                <Text size='micro' variant='label' component='span'>
                  в BOM нет материалов
                </Text>
              </td>
            </tr>
          ) : (
            materials.map((m, i) => (
              <tr key={m.bomItemId || `m${i}`}>
                <td>
                  {m.materialName || `#${m.bomItemId}`}
                  {/* Секция — приписка к названию, а не своя колонка: она нужна, только чтобы
                      найти строку в BOM, и отдельный столбец под это тратил ширину зря. */}
                  <Text size='micro' variant='label' component='span'>
                    {` · ${sectionLabel(m.section)}`}
                  </Text>
                </td>
                <td>
                  {decimalToInput(m.consumption) || '—'} {m.unit || ''}
                </td>
                <td>
                  {decimalToInput(m.unitPrice) || '—'} {m.currency || ''}
                </td>
                <td>
                  <RightCell>
                    <PriceOrigin source={m.priceSource} date={m.priceDate} />
                  </RightCell>
                </td>
                <td>
                  <RightCell>
                    <LineProblems
                      noPrice={m.priceSource === 'STYLE_COST_PRICE_SOURCE_NONE'}
                      noFxRate={m.hasBase === false}
                      currency={m.currency}
                    />
                  </RightCell>
                </td>
                <td>
                  <WastageCell m={m} />
                </td>
                <td>{decimalToInput(m.lineTotalBase) || <EmptyCell />}</td>
                <td>
                  {m.hasBase === false ? (
                    <EmptyCell />
                  ) : (
                    share(num(decimalToInput(m.lineTotalBase)))
                  )}
                </td>
              </tr>
            ))
          )}

          <tr className='bg-bgZebra'>
            <td colSpan={BREAKDOWN_LEAD}>
              <Text
                size='micro'
                variant='label'
                tracking='group'
                component='span'
                className='font-bold uppercase'
              >
                статьи
              </Text>
            </td>
            <td>{articlesSubtotal > 0 ? articlesSubtotal.toFixed(2) : <EmptyCell />}</td>
            <td>{share(articlesSubtotal)}</td>
          </tr>
          {articles.length === 0 ? (
            <tr>
              <td colSpan={BREAKDOWN_COLS}>
                <Text size='micro' variant='label' component='span'>
                  статей нет
                </Text>
              </td>
            </tr>
          ) : (
            articles.map((a, i) => (
              <tr key={`a${i}`}>
                <td>{a.kind || '—'}</td>
                <td>
                  <EmptyCell />
                </td>
                <td>
                  {decimalToInput(a.amount) || '—'} {a.currency || ''}
                </td>
                {/* У статьи нет лестницы цен — её вписал человек, «откуда» здесь нечему быть. */}
                <td>
                  <EmptyCell />
                </td>
                <td>
                  <RightCell>
                    <LineProblems noFxRate={a.hasBase === false} currency={a.currency} />
                  </RightCell>
                </td>
                <td>
                  <EmptyCell />
                </td>
                <td>{decimalToInput(a.amountBase) || <EmptyCell />}</td>
                <td>
                  {a.hasBase === false ? <EmptyCell /> : share(num(decimalToInput(a.amountBase)))}
                </td>
              </tr>
            ))
          )}

          {/* Закрывающая строка-остаток. Порог ≥ 0.005, не > 0: округление составляющих даёт
              ±0.005, и фантомная строка «· 0.00» читалась бы как настоящая надбавка.

              ИМЕНЕМ «брак N%» она называется, ТОЛЬКО когда процент брака действительно
              положительный. Остаток считается от КЛИЕНТСКОЙ суммы статей, поэтому всё, что клиент
              не сумел свернуть в базовую валюту, всплывает здесь же — и печатать над этими деньгами
              «брак 0%» значило бы объявить ставку, которой нет. При нулевой ставке строка остаётся
              (иначе столбец «сумма» перестанет складываться в unit cost), но называет себя тем, что
              она есть: неразнесённой разницей. */}
          {defectAmount >= 0.005 && (
            <tr className='bg-bgZebra'>
              <td colSpan={BREAKDOWN_LEAD}>
                <Text
                  size='micro'
                  variant='label'
                  tracking='group'
                  component='span'
                  className='font-bold uppercase'
                >
                  {defectPct > 0 ? `брак ${defectPct}%` : 'не разнесено'}
                </Text>
                {defectPct <= 0 && (
                  <Text size='micro' variant='label' component='span'>
                    {' · разница между unit cost и суммой строк выше'}
                  </Text>
                )}
              </td>
              <td>{defectAmount.toFixed(2)}</td>
              <td>{share(defectAmount)}</td>
            </tr>
          )}
          <TotalRow>
            <td colSpan={BREAKDOWN_LEAD}>unit cost{cur ? ` · ${cur}` : ''}</td>
            <td>{unitCost > 0 ? unitCost.toFixed(2) : '—'}</td>
            <td>{unitCost > 0 ? '100%' : '—'}</td>
          </TotalRow>
        </tbody>
      </DataTable>
      {excluded > 0 && (
        <Text size='micro' variant='label'>
          {`Строки с пометкой «${NO_PRICE}» или «${noFx()}» (${excluded}) в сумму не входят — unit cost занижен ровно на них.`}
        </Text>
      )}

      {estimate.caveat && (
        <CalloutBox tone='note'>
          <Text size='micro'>{estimate.caveat}</Text>
        </CalloutBox>
      )}
      {comparison?.caveat && (
        <CalloutBox tone='note'>
          <Text size='micro'>{comparison.caveat}</Text>
        </CalloutBox>
      )}

      <VarianceByKind comparison={comparison} cur={cur} />
      <SnapshotReconciliation
        comparison={comparison}
        cur={cur}
        planUnitCost={unitCost > 0 ? unitCost : undefined}
      />
    </div>
  );
}

// Booked COGS snapshot + how it reconciles against estimate and actual. Detail-level: shown only
// inside the cost-breakdown disclosure, and only when a snapshot exists.
function SnapshotReconciliation({
  comparison,
  cur,
  planUnitCost,
}: {
  comparison?: StyleCostComparison;
  cur: string;
  /** Тот же unit cost, что стоит в итоге таблицы — страховка, если сравнение пришло без плана. */
  planUnitCost?: number;
}) {
  if (!comparison?.hasSnapshot) return null;

  const snapshot = opt(decimalToInput(comparison.snapshotCostBase));
  const plan = opt(decimalToInput(comparison.estimateUnitCostBase)) ?? planUnitCost;
  const actual = comparison.hasActual
    ? opt(decimalToInput(comparison.actualUnitCostBase))
    : undefined;
  // Обе Δ считаются ЗДЕСЬ из трёх исходных цифр, а не читаются из `estimate_vs_snapshot` /
  // `actual_vs_snapshot`. Соглашение о знаке у этих полей нигде не описано — ровно по той же
  // причине этот файл пересчитывает Δ в матрице (~590) и в «отклонении по видам» (~370). Печатать
  // здесь чужой знак, а в двух шагах отсюда свой, значило бы держать две политики на одно семейство
  // полей, и перевёрнутый знак покрасил бы недобор COGS как экономию.
  const snapshotVsPlan = snapshot != null && plan != null ? snapshot - plan : undefined;
  const actualVsSnapshot = snapshot != null && actual != null ? actual - snapshot : undefined;
  // Валюта — часть цифры: «+1.20» без неё не сумма, а число. При отсутствующем значении печатается
  // голый «—», а не «— EUR» (валюта у пустоты).
  const money = (n: number) => `${signed(n)}${cur ? ` ${cur}` : ''}`;

  return (
    <>
      <GroupLabel>проведённый snapshot</GroupLabel>
      <StatGrid min={130}>
        <Stat
          label={`snapshot${comparison.snapshotSource ? ` · ${comparison.snapshotSource}` : ''}`}
          value={snapshot != null ? `${snapshot.toFixed(2)}${cur ? ` ${cur}` : ''}` : '—'}
          sub={snapshotVsPlan != null ? `Δ к плану ${money(snapshotVsPlan)}` : undefined}
        />
        {comparison.hasActual && (
          <Stat
            label='Δ факт к snapshot'
            value={actualVsSnapshot != null ? money(actualVsSnapshot) : '—'}
            tone={statTone(actualVsSnapshot)}
          />
        )}
      </StatGrid>
    </>
  );
}

/**
 * Per-cost-kind variance, drawn as bars off the biggest mover — the one part of this disclosure
 * people actually read (spec 16.3). Two seconds to see that trims, not fabric, are the problem.
 *
 * The delta is computed here from estimate/actual rather than read off `variance`: the field's
 * sign convention is undocumented, and a flipped sign would paint an overspend green.
 * With no production actuals there is nothing to vary, so the same bars show where the PLAN
 * cost sits instead (ink, not a fake zero variance).
 */
function VarianceByKind({ comparison, cur }: { comparison?: StyleCostComparison; cur: string }) {
  const byKind = comparison?.byKind ?? [];
  if (byKind.length === 0) return null;
  const hasActual = !!comparison?.hasActual;

  const rows = byKind.map((k) => {
    const estimate = num(decimalToInput(k.estimateBase));
    const actual = num(decimalToInput(k.actualBase));
    const delta = k.hasActual ? actual - estimate : 0;
    return { kind: k.kind || '—', estimate, delta, lineHasActual: !!k.hasActual };
  });

  // Два РАЗНЫХ повода для пустого списка, и путать их нельзя: «ни один вид не сдвинулся» — это
  // хорошая новость, а «ни у одного вида нет факта» — это отсутствие данных. Итоговый факт по
  // колорвею (`hasActual`) может существовать без разбивки по видам, и печатать над такой картой
  // «все виды затрат уложились в план» значит подтвердить сходимость, которую никто не проверял.
  const anyLineActual = rows.some((r) => r.lineHasActual);
  const moved = rows.filter((r) => r.lineHasActual && Math.abs(r.delta) >= 0.005);
  const shown = hasActual ? moved : rows.filter((r) => r.estimate > 0);
  const measure = (r: (typeof rows)[number]) => (hasActual ? Math.abs(r.delta) : r.estimate);
  const max = Math.max(...shown.map(measure), 0);
  const sorted = [...shown].sort((a, b) => measure(b) - measure(a));

  return (
    <>
      <GroupLabel>{hasActual ? 'отклонение по видам затрат' : 'план по видам затрат'}</GroupLabel>
      {sorted.length === 0 ? (
        <Text size='micro' variant='label'>
          {!hasActual
            ? 'цифр по видам нет'
            : anyLineActual
              ? 'все виды затрат уложились в план'
              : 'факта по видам затрат нет — сравнивать не с чем'}
        </Text>
      ) : (
        <div className='flex flex-col'>
          {sorted.map((r) => (
            <BarRow
              key={r.kind}
              name={r.kind}
              pct={max > 0 ? (measure(r) / max) * 100 : 0}
              tone={hasActual ? (r.delta > 0 ? 'down' : 'up') : 'ink'}
              value={hasActual ? signed(r.delta) : `${r.estimate.toFixed(2)} ${cur}`}
            />
          ))}
        </div>
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// МАТРИЦА ПЛАН/ФАКТ
// ─────────────────────────────────────────────────────────────────────────────────────────────

const MATRIX_COLS = 7;

type RowState = 'pending' | 'forbidden' | 'error' | 'ok';

type MatrixRow = {
  colorwayId: number;
  label: string;
  sku: string;
  hex?: string;
  state: RowState;
  /** Цифры есть, но последний запрос за ними упал — показываем кэш и говорим, что он несвежий. */
  stale?: boolean;
  estimate?: StyleCostEstimate;
  plan?: number;
  actual?: number;
  delta?: number;
  deltaPct?: number;
  /** Самая крупная по модулю статья отклонения — куда смотреть первым делом. */
  top?: { kind: string; delta: number };
};

/**
 * Разворот строки, переживающий `<fieldset disabled>`.
 *
 * Вся вкладка обёрнута в `<fieldset disabled>` на RELEASED-карте (index.tsx), а отключённый
 * fieldset гасит КАЖДУЮ кнопку внутри — включая ту, что открывает доказательства, то есть ровно на
 * тех картах, которые читают чаще всего. `<span role="button">` формой не является, поэтому
 * fieldset его не трогает; обработчик клавиатуры — то, чего Radix/браузер за не-кнопку не сделает,
 * и без него контрол остался бы мышиным. Тот же приём, что у `HelpMark` в costing-vocab.
 *
 * `<details>` здесь не подходит: раскрывать надо строку таблицы, а `<summary>` внутри `<tr>`
 * невалиден и в Safari просто не открывается.
 */
function RowDisclosure({
  open,
  onToggle,
  label,
}: {
  open: boolean;
  onToggle: () => void;
  /** Строк в таблице столько же, сколько колорвеев; без этого все контролы зовутся «разбор». */
  label: string;
}) {
  return (
    <span
      role='button'
      tabIndex={0}
      aria-expanded={open}
      aria-label={`разбор — ${label}`}
      onClick={onToggle}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
      className='inline-flex cursor-pointer items-center gap-1 whitespace-nowrap border border-borderColor px-[7px] py-px text-micro uppercase tracking-pill text-labelColor hover:border-textColor hover:text-textColor focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-textColor'
    >
      разбор
      <span aria-hidden>{open ? '▾' : '▸'}</span>
    </span>
  );
}

/** Бледная краска исчезает на белом без обводки, поэтому у образца всегда есть рамка. */
function Swatch({ hex }: { hex?: string }) {
  return (
    <span
      aria-hidden
      className='inline-block size-[9px] shrink-0 border border-borderColor'
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

function MatrixValue({ row }: { row: MatrixRow }) {
  if (row.state === 'pending')
    return (
      <Text size='micro' variant='label' component='span'>
        …
      </Text>
    );
  return <EmptyCell />;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * Q4 — плановая себестоимость стиля по ВСЕМ колорвеям сразу, только на чтение.
 *
 * Раньше здесь стоял `<Select>` с колорвеем и пустой экран «выберите колорвей»: чтобы сравнить два
 * колорвея, надо было переключаться между ними и держать первую цифру в голове, а именно сравнение
 * — единственное, зачем на эту таблицу смотрят. Теперь колорвеи лежат матрицей план/факт, а разбор
 * одного раскрывается под его строкой.
 *
 * Колонки «прогонов» нет намеренно: `StyleCostEstimate` не несёт ни числа прогонов, ни выпуска
 * (`order_qty` — снятый с карточки «типовой тираж», а не факт производства). Выдумывать её было бы
 * враньём в столбце, который читают как факт; сколько было прогонов, видно на /production-runs.
 *
 * 🔒 costing:read — сервер отдаёт PermissionDenied (403) на сам RPC, так что это экранный гейт, а
 * не шейпинг полей.
 */
export function CostEstimateField({
  techCardId,
  techCard,
  active,
}: {
  techCardId?: number;
  techCard?: common_TechCard;
  /**
   * Вкладка COSTING открыта. Обязателен и не имеет значения по умолчанию: вкладки карточки
   * смонтированы ВСЕ сразу и спрятаны через `hidden`, поэтому без этого флага открытие любой
   * тех-карты веером выстреливало бы по одному GetStyleCostEstimate на колорвей — на вкладке,
   * которую никто не смотрит. Тот же контракт, что у `PiecesTab`.
   */
  active: boolean;
}) {
  const { canReadCosting } = usePermissions();
  const { dictionary } = useDictionary();
  const colorways: common_AdminColorwayRef[] = techCard?.colorways ?? [];
  const [openId, setOpenId] = useState(0);

  // Ключ — общий с `useStyleCostEstimate` (styleReadViewKeys), поэтому кэш один: сохранение рецепта
  // колорвея инвалидирует ровно эту запись (useColorwayRecipe), а второго запроса за теми же
  // данными не случается. retry:false — 403 должен всплыть сразу, а не притворяться сетевым сбоем.
  const results = useQueries({
    queries: colorways.map((c) => ({
      queryKey: styleReadViewKeys.costEstimate(techCardId ?? 0, c.colorwayId ?? 0),
      queryFn: () =>
        adminService.GetStyleCostEstimate({
          techCardId: techCardId ?? 0,
          colorwayId: c.colorwayId ?? 0,
        }),
      enabled: active && canReadCosting && !!techCardId && !!c.colorwayId,
      retry: false,
    })),
  });

  if (!canReadCosting) {
    return (
      <Text size='micro' variant='label'>
        нужен доступ к костингу
      </Text>
    );
  }

  if (colorways.length === 0) {
    return (
      <Text size='micro' variant='label'>
        колорвеев пока нет — добавьте колорвей, тогда посчитается и его себестоимость
      </Text>
    );
  }

  const forbiddenAt = (i: number) =>
    (results[i]?.error as { status?: number } | null)?.status === 403;

  // Сбой одного колорвея не должен гасить таблицу: состояние живёт на строке. Исключение — когда
  // 403 пришёл на ВСЕ: это не «строка сломалась», это отсутствие доступа, и говорить надо один раз.
  if (results.length > 0 && results.every((r, i) => r.isError && forbiddenAt(i))) {
    return (
      <Text size='micro' variant='label'>
        нужен доступ к костингу
      </Text>
    );
  }

  const rows: MatrixRow[] = colorways.map((c, i) => {
    const r = results[i];
    const dc = c.colorCode ? dictionary?.colors?.find((d) => d.code === c.colorCode) : undefined;
    // Ровно та же лестница, что и в costing-field.tsx (colorwayLabel): имя из словаря → код цвета →
    // «колорвей #id». baseSku идёт приписком, потому что в BOM и на складе ищут именно по нему.
    const label = dc?.name || c.colorCode || `колорвей #${c.colorwayId ?? 0}`;
    const base: MatrixRow = {
      colorwayId: c.colorwayId ?? 0,
      label,
      sku: c.baseSku || '',
      hex: dc?.hex,
      state: 'pending',
    };
    if (!r) return base;
    // 403 гасит строку ДАЖЕ при заполненном кэше: доступ отозвали, и показывать то, что успели
    // прочитать до отзыва, — ровно то, что этот гейт и должен останавливать.
    if (forbiddenAt(i)) return { ...base, state: 'forbidden' };
    const estimate = r.data?.estimate;
    // Ошибка стирает цифры ТОЛЬКО когда показывать нечего. TanStack Query оставляет `data` от
    // прошлого успешного ответа и одновременно поднимает `isError` на упавшем ФОНОВОМ рефетче, а
    // проверка `isError` раньше `data` вычищала план/факт/Δ/разбор целого колорвея из-за одного
    // сетевого моргания — при том, что цифры лежали в кэше. Данные есть → рисуем их и помечаем
    // строку несвежей; данных нет → это настоящий сбой.
    if (!estimate) return r.isError ? { ...base, state: 'error' } : base;

    const comparison = estimate.comparison;
    const plan = opt(decimalToInput(estimate.unitCostBase));
    const hasActual = !!comparison?.hasActual;
    const actual = hasActual ? opt(decimalToInput(comparison?.actualUnitCostBase)) : undefined;
    // Δ считается ЗДЕСЬ из плана и факта, а не читается из `variance`: соглашение о знаке этого поля
    // нигде не описано, а перевёрнутый знак покрасил бы перерасход зелёным.
    const delta = plan != null && actual != null ? actual - plan : undefined;
    const deltaPct = delta != null && plan != null && plan > 0 ? (delta / plan) * 100 : undefined;

    const movers = (comparison?.byKind ?? [])
      .filter((k) => k.hasActual)
      .map((k) => ({
        kind: k.kind || '—',
        delta: num(decimalToInput(k.actualBase)) - num(decimalToInput(k.estimateBase)),
      }))
      .filter((k) => Math.abs(k.delta) >= 0.005)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    return {
      ...base,
      state: 'ok',
      stale: r.isError,
      estimate,
      plan,
      actual,
      delta,
      deltaPct,
      top: movers[0],
    };
  });

  // Базовая валюта у стиля одна; берём первую пришедшую, чтобы шапка не ждала последний ответ.
  const cur = rows.find((r) => r.estimate?.baseCurrency)?.estimate?.baseCurrency || '';

  const withPlan = rows.filter((r) => r.plan != null);
  const both = rows.filter((r) => r.plan != null && r.actual != null);
  // ВЗВЕШИВАТЬ НЕЧЕМ. Средневзвешенная себестоимость требует выпуска на колорвей, а его в
  // StyleCostEstimate нет (order_qty — снятый «типовой тираж», не факт). Поэтому итог — простое
  // среднее арифметическое, и подпись под таблицей говорит об этом прямым текстом.
  //
  // Все четыре ячейки итога считаются по ОДНОМУ множеству — колорвеям, у которых есть и план, и
  // факт. Если взять план по всем, а факт по подмножеству, разность строки перестанет сходиться:
  // читатель вычтет одну показанную цифру из другой и получит не то Δ, которое написано рядом.
  const totalBase = both.length > 0 ? both : withPlan;
  const meanOf = (pick: (r: MatrixRow) => number | undefined) => {
    const vals = totalBase.map(pick).filter((v): v is number => v != null);
    return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : undefined;
  };
  const meanPlan = meanOf((r) => r.plan);
  const meanActual = both.length > 0 ? meanOf((r) => r.actual) : undefined;
  const meanDelta = meanPlan != null && meanActual != null ? meanActual - meanPlan : undefined;
  const meanDeltaPct =
    meanDelta != null && meanPlan != null && meanPlan > 0
      ? (meanDelta / meanPlan) * 100
      : undefined;
  const totalLabel =
    both.length > 0
      ? `среднее по ${both.length} ${both.length === 1 ? 'колорвею' : 'колорвеям'} с планом и фактом`
      : `среднее плана по ${withPlan.length} ${withPlan.length === 1 ? 'колорвею' : 'колорвеям'}`;

  return (
    <div className='flex flex-col gap-2'>
      <DataTable>
        <thead>
          <tr>
            <th>колорвей</th>
            <th>план{cur ? ` (${cur})` : ''}</th>
            <th>факт</th>
            <th>Δ</th>
            <th>Δ%</th>
            <th>главное отклонение</th>
            <th />
          </tr>
        </thead>
        {rows.map((row) => {
          const open = openId === row.colorwayId;
          return (
            // По <tbody> на колорвей: разбор — вторая строка той же группы, поэтому он физически
            // не может оторваться от своей строки при любом порядке рендера.
            <tbody key={row.colorwayId}>
              <tr>
                <td>
                  <span className='flex flex-wrap items-center gap-1.5'>
                    <Swatch hex={row.hex} />
                    <span>{row.label}</span>
                    {row.sku && (
                      <Text size='micro' variant='label' component='span'>
                        {row.sku}
                      </Text>
                    )}
                    {row.state === 'forbidden' && <Pill tone='warn'>нет доступа</Pill>}
                    {row.state === 'error' && <Pill tone='warn'>не загрузилось</Pill>}
                    {/* warn (красный) занят «показать нечего»; здесь цифры ЕСТЬ, просто несвежие —
                        а «stale» в системе (DESIGN.md, «Blue») это attention. */}
                    {row.stale && <Pill tone='attention'>не обновилось</Pill>}
                  </span>
                </td>
                <td>{row.plan != null ? row.plan.toFixed(2) : <MatrixValue row={row} />}</td>
                <td>{row.actual != null ? row.actual.toFixed(2) : <MatrixValue row={row} />}</td>
                <td className={row.delta != null ? deltaTone(row.delta) : undefined}>
                  {row.delta != null ? signed(row.delta) : <MatrixValue row={row} />}
                </td>
                <td className={row.delta != null ? deltaTone(row.delta) : undefined}>
                  {row.deltaPct != null ? `${signed(row.deltaPct, 1)}%` : <MatrixValue row={row} />}
                </td>
                <td>
                  {row.state !== 'ok' ? (
                    <MatrixValue row={row} />
                  ) : row.actual == null ? (
                    <Text size='micro' variant='label' component='span'>
                      прогонов не было
                    </Text>
                  ) : row.top ? (
                    <span className={deltaTone(row.top.delta)}>
                      {`${row.top.kind} ${signed(row.top.delta)}`}
                    </span>
                  ) : (
                    <EmptyCell />
                  )}
                </td>
                <td>
                  {row.state === 'ok' && (
                    <RowDisclosure
                      open={open}
                      label={row.label}
                      onToggle={() => setOpenId(open ? 0 : row.colorwayId)}
                    />
                  )}
                </td>
              </tr>
              {open && row.estimate && (
                <tr>
                  <td colSpan={MATRIX_COLS}>
                    <Breakdown estimate={row.estimate} />
                  </td>
                </tr>
              )}
            </tbody>
          );
        })}
        <tbody>
          <TotalRow>
            <td>{totalLabel}</td>
            <td>{meanPlan != null ? meanPlan.toFixed(2) : '—'}</td>
            <td>{meanActual != null ? meanActual.toFixed(2) : '—'}</td>
            <td className={meanDelta != null ? deltaTone(meanDelta) : undefined}>
              {meanDelta != null ? signed(meanDelta) : '—'}
            </td>
            <td className={meanDelta != null ? deltaTone(meanDelta) : undefined}>
              {meanDeltaPct != null ? `${signed(meanDeltaPct, 1)}%` : '—'}
            </td>
            <td colSpan={2} />
          </TotalRow>
        </tbody>
      </DataTable>

      <Text size='micro' variant='label'>
        {`Итог — простое среднее: выпуска по колорвеям у стиля нет, взвешивать нечем.${
          both.length > 0 && both.length < withPlan.length
            ? ` План и факт есть у ${both.length} из ${withPlan.length} колорвеев — по ним и посчитано.`
            : ''
        }`}
      </Text>
      <Text size='micro' variant='label'>
        {`Все суммы в ${cur || 'базовой валюте стиля'}, свёрнуты по курсам костинга. План ≠ факт ≠ проведённый snapshot COGS — три разные цифры, и они намеренно не сливаются.`}
      </Text>
    </div>
  );
}
