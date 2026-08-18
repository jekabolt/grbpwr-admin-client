import {
  CheckProductionRunReadinessResponse,
  ProductionRunReadinessCoverage,
  ProductionRunReadinessFinding,
  ProductionRunReadinessSeverity,
  ProductionRunReadinessUnitCoverage,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { Link } from 'react-router-dom';
import { CalloutBox } from 'ui/components/callout-box';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import {
  SEV_BLOCKER,
  SEV_OK,
  SEV_UNKNOWN,
  SEV_WARNING,
  allFindings,
  findingHref,
  isBlocker,
  isOk,
  isWarning,
} from './run-readiness-keys';

// Словарь ключей, карта вкладок и предикаты степеней живут в run-readiness-keys.ts (чистый модуль,
// покрытый зондом). Здесь — только то, как это выглядит.
export {
  AUX_KEY,
  RUN_REQ_TAB,
  allFindings,
  findingHref,
  isAuxShortCircuit,
  isBlocker,
  isOk,
  isUnchecked,
  isWarning,
  pluralRu,
  tabForKey,
} from './run-readiness-keys';

// ГЕЙТ ГОТОВНОСТИ ПРОГОНА (Ф6) — как он читается на экране.
//
// Presentation only: every judgement here already arrived over the wire, and this file adds no
// rule of its own. It answers three questions the server deliberately does NOT answer:
//
//   1. WHERE a finding gets fixed (RUN_REQ_TAB — навигация этой админки, не факт о данных);
//   2. how the FOUR degrees look, and in particular how UNKNOWN looks like NEITHER a pass NOR a
//      problem;
//   3. how «режим отчёта» differs on screen from «блокирующий».
//
// Reused by the create modal and (later) by the run's detail page, which is why nothing here wraps
// itself in a surface: a modal is already its own surface and must not contain a Section, while the
// detail page's block is the caller's to draw.

type Finding = ProductionRunReadinessFinding;

// ЧЕТЫРЕ СТЕПЕНИ, и центральная здесь — UNKNOWN.
//
// UNKNOWN — «у сервера НЕТ ИНСТРУМЕНТА ответить», а не суждение о данных. Поэтому у него СВОЙ вид:
// не зелёный (это не «прошло»), не красный (это не поломка) и не синий (синий в этой системе значит
// «на полпути, нужен человек» — а тут человек ничего сделать не может, инструмент появится с фазой).
// Серый + «?» + слово «not checked» — три независимых сигнала, из которых ни один не читается как
// вердикт.
//
// UNSPECIFIED сюда же: степень, которую сервер не проставил, — это тоже отсутствие суждения. Пятой
// корзины не заводим, но и в OK не складываем. Счётчик «not checked» при этом ВСЕГДА берётся у
// сервера (unknown_count) и никогда не пересчитывается здесь — бакетование наше, число его.
const SEVERITY_UI: Record<string, { glyph: string; word: string; className: string }> = {
  [SEV_BLOCKER]: { glyph: '✕', word: 'blocker', className: 'text-error' },
  [SEV_WARNING]: { glyph: '!', word: 'warning', className: 'text-warning' },
  [SEV_UNKNOWN]: { glyph: '?', word: 'not checked', className: 'text-labelColor' },
  [SEV_OK]: { glyph: '✓', word: 'ok', className: 'text-success' },
};
const UNSPECIFIED_UI = SEVERITY_UI[SEV_UNKNOWN];

const uiOf = (s?: ProductionRunReadinessSeverity) => SEVERITY_UI[s ?? ''] ?? UNSPECIFIED_UI;

const blockerCount = (n: number) => `${n} ${n === 1 ? 'blocker' : 'blockers'}`;
const unchecked = (n: number) => `${n} ${n === 1 ? 'check was' : 'checks were'} not run`;

/**
 * Одна проверка. Строка, а не Row: у неё нет колонки значения — есть факт, его причина и адрес,
 * по которому он чинится.
 */
export function FindingRow({
  finding,
  techCardId,
}: {
  finding: Finding;
  techCardId: number;
}) {
  const ui = uiOf(finding.severity);
  const href = findingHref(finding, techCardId);
  // `detail` пуст только у OK — это правило сервера, и оно значит, что пустая причина не дыра.
  const detail = finding.detail?.trim();
  return (
    <div className='flex flex-wrap items-baseline gap-x-2 gap-y-0.5 border-b border-hairline py-1'>
      <span aria-hidden className={`shrink-0 ${ui.className}`}>
        {ui.glyph}
      </span>
      <span className='sr-only'>{ui.word}</span>
      <Text component='span' className='min-w-0'>
        {finding.label || finding.key || 'unnamed check'}
      </Text>
      {detail ? (
        <Text size='micro' variant='label' component='span' className='min-w-0'>
          — {detail}
        </Text>
      ) : null}
      {href ? (
        // НОВАЯ ВКЛАДКА, и это не украшение: уйти по ссылке из модалки создания значит выбросить
        // набранную сетку количеств, а вернуться в неё неоткуда. Тот же размен, что в lines-grid.
        <Link
          to={href}
          target='_blank'
          rel='noreferrer'
          className='ml-auto shrink-0 text-micro uppercase tracking-label underline'
        >
          fix ↗
        </Link>
      ) : null}
    </div>
  );
}

/** Группа строк под своим заголовком; пустая группа не рисуется. */
export function FindingGroup({
  title,
  findings,
  techCardId,
  action,
}: {
  title: string;
  findings: Finding[];
  techCardId: number;
  action?: React.ReactNode;
}) {
  if (findings.length === 0) return null;
  return (
    <div>
      <GroupLabel flush action={action}>
        {title}
      </GroupLabel>
      {findings.map((f, i) => (
        <FindingRow key={`${f.key ?? 'row'}-${i}`} finding={f} techCardId={techCardId} />
      ))}
    </div>
  );
}

/**
 * ВЕРДИКТ одной строкой + режим гейта.
 *
 * Три свойства, каждое проектное:
 *
 *  1. «Не проверено» — ВСЕГДА отдельное предложение. `ready=true` при `unknownCount=3` читается как
 *     «ничего сломанного не найдено, и три вещи не проверялись», а не как «всё хорошо» и не как
 *     «три проблемы». Число берётся у сервера.
 *  2. Строка про РЕЖИМ печатается ВСЕГДА, а не только когда что-то не так: «гейт в режиме отчёта»
 *     рядом с зелёным вердиктом — это то, из чего оператор узнаёт, что режим бывает другой, и из-за
 *     чего его включение однажды не станет сюрпризом.
 *  3. `wouldBlock` печатается КАК ПРИСЛАН. Сервер отдаёт его отдельным полем именно потому, что
 *     «!ready && blockingEnabled» — это предложение, в котором клиенту ошибиться нельзя.
 */
export function ReadinessVerdict({
  data,
  stale,
}: {
  data: CheckProductionRunReadinessResponse;
  /** Ответ относится к предыдущему составу запроса — идёт пересчёт. */
  stale?: boolean;
}) {
  const rows = allFindings(data);
  const blockers = rows.filter(isBlocker).length;
  const warnings = rows.filter(isWarning).length;
  // ЧИСЛО НЕПРОВЕРЕННОГО — серверное. Пересчитать его здесь значило бы завести второе определение
  // того же факта, и оно разошлось бы в первый же день, когда сервер научится новой проверке.
  const unknown = data.unknownCount ?? 0;
  const ready = !!data.ready;
  const blocking = !!data.blockingEnabled;
  const wouldBlock = !!data.wouldBlock;

  return (
    <div className='flex flex-col gap-1'>
      <div className='flex flex-wrap items-center gap-2'>
        <Pill tone={ready ? 'ok' : 'warn'}>{ready ? 'ready to start' : 'there are blockers'}</Pill>
        {blockers > 0 ? (
          <Pill tone='warn'>
            {blockers} {blockers === 1 ? 'blocker' : 'blockers'}
          </Pill>
        ) : null}
        {warnings > 0 ? (
          <Pill tone='attention'>
            {warnings} {warnings === 1 ? 'warning' : 'warnings'}
          </Pill>
        ) : null}
        {/* Отдельная плашка, СЕРАЯ и со своим словом: не «ещё N проблем» и не часть «готово». */}
        {unknown > 0 ? <Pill tone='mut'>{unknown} not checked</Pill> : null}
        {stale ? <Pill tone='attention'>recomputing…</Pill> : null}
      </div>
      <Text size='micro' variant='label'>
        {ready
          ? unknown > 0
            ? `nothing broken was found. ${unchecked(unknown)} — the server has no tool for them, and that is not “passed”.`
            : 'nothing broken was found, and every gate check was able to answer.'
          : unknown > 0
            ? `${blockerCount(blockers)}. separately: ${unchecked(unknown)} at all — they block nothing and confirm nothing.`
            : `${blockerCount(blockers)}.`}
      </Text>
      {/* РЕЖИМ. Печатается ВСЕГДА — и когда всё зелено, и когда нет.
          В режиме отчёта wouldBlock по определению false (would_block = blocking_enabled && !ready),
          поэтому «что начнёт отбиваться» выводится из `ready`, а не из него: иначе строка про
          будущее молчала бы ровно там, ради чего она заведена. */}
      <Text size='micro' variant='label'>
        {blocking
          ? wouldBlock
            ? 'the gate BLOCKS creation: this request will be refused by the server.'
            : 'the gate blocks creation — the server will let this request through.'
          : ready
            ? 'the gate is in report mode: creation is not refused. when the mode is turned on, this request will still pass.'
            : 'the gate is in report mode: creation is not refused. when the mode is turned on, this request will be refused.'}
      </Text>
    </div>
  );
}

/**
 * ПОКРЫТИЕ ПО НОРМЕ. Заголовок буквально «оценка по норме», а не «план настилов»: настилы строятся
 * после создания, на детальной странице, и путать эти два числа стоит закупки не того метража.
 */
export function CoverageTable({
  coverage,
  unitCoverage,
  colorwayName,
  sizeName,
}: {
  coverage: ProductionRunReadinessCoverage[];
  unitCoverage: ProductionRunReadinessUnitCoverage[];
  colorwayName: (id: number) => string;
  sizeName: (id: number) => string;
}) {
  if (coverage.length === 0 && unitCoverage.length === 0) {
    return (
      <Text size='micro' variant='label'>
        coverage will appear once the grid has quantities
      </Text>
    );
  }
  const cell = 'border border-hairline px-2 py-1 text-textBaseSize';
  const short = (d?: googletype_Decimal) => decimalToInput(d) || '—';
  const bySource = coverage.some((c) => c.source === 'PRODUCTION_RUN_COVERAGE_SOURCE_LAYS');
  return (
    <div className='flex flex-col gap-2'>
      <div className='overflow-x-auto'>
        <table className='w-full border-collapse'>
          <thead>
            <tr>
              <th className={`${cell} text-left uppercase`}>colourway</th>
              <th className={`${cell} text-left uppercase`}>slot / article</th>
              <th className={`${cell} text-right uppercase`}>needed</th>
              <th className={`${cell} text-right uppercase`}>on hand</th>
              <th className={`${cell} text-right uppercase`}>shortage</th>
            </tr>
          </thead>
          <tbody>
            {coverage.map((c, i) => {
              const short_ = decimalToInput(c.shortage);
              const lacking = !!short_ && Number(short_) > 0;
              return (
                <tr key={`${c.colorwayId}-${c.bomItemId}-${i}`}>
                  <td className={cell}>{colorwayName(c.colorwayId ?? 0)}</td>
                  <td className={cell}>
                    {[c.slotName, c.materialName].filter(Boolean).join(' · ') || '—'}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>
                    {short(c.required)} {c.unit ?? ''}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{short(c.onHand)}</td>
                  <td
                    className={`${cell} text-right tabular-nums ${lacking ? 'text-error' : ''}`}
                  >
                    {lacking ? `short by ${short_}` : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {unitCoverage.length > 0 && (
        <div className='overflow-x-auto'>
          <table className='w-full border-collapse'>
            <thead>
              <tr>
                <th className={`${cell} text-left uppercase`}>colourway · size</th>
                <th className={`${cell} text-right uppercase`}>plan</th>
                <th className={`${cell} text-right uppercase`}>recipe complete</th>
                <th className={`${cell} text-right uppercase`}>stock covers</th>
              </tr>
            </thead>
            <tbody>
              {unitCoverage.map((u, i) => (
                <tr key={`${u.colorwayId}-${u.sizeId}-${i}`}>
                  <td className={cell}>
                    {colorwayName(u.colorwayId ?? 0)} · {sizeName(u.sizeId ?? 0)}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{u.plannedQty ?? 0}</td>
                  <td
                    className={`${cell} text-right tabular-nums ${
                      (u.provisionedQty ?? 0) < (u.plannedQty ?? 0) ? 'text-error' : ''
                    }`}
                  >
                    {u.provisionedQty ?? 0}
                  </td>
                  <td className={`${cell} text-right tabular-nums`}>{u.unitsFromStock ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Text size='micro' variant='label'>
        {bySource
          ? 'the requirement is computed from the lays.'
          : 'the requirement = quantities × recipe norm (source = NORM), not a lay plan: lays are built after creation, on the run page.'}{' '}
        “recipe complete” — garments in which EVERY required slot has both an article and a norm for
        this size; 22 fronts and 20 linings are 20 garments. “stock covers” — an estimate against
        today's on hand, without reserves.
      </Text>
      <Text size='micro' variant='label'>
        the length here is an estimate FROM THE BOM: the actual cutting percentage is entered later,
        on the run page, so the same run will show a different number a minute after it is created.
      </Text>
    </div>
  );
}

/** Незаменимые оговорки материал-плана — проброшены дословно, они уже написаны для человека. */
export function ReadinessCaveats({ caveats }: { caveats: string[] }) {
  if (caveats.length === 0) return null;
  return (
    <CalloutBox tone='note'>
      <Text size='micro' variant='label' component='span'>
        calculation caveats:
      </Text>
      <ul className='list-disc pl-4'>
        {caveats.map((c, i) => (
          <li key={i}>
            <Text size='micro' component='span'>
              {c}
            </Text>
          </li>
        ))}
      </ul>
    </CalloutBox>
  );
}
