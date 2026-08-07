import {
  common_ProductionLayCheck,
  common_ProductionRunLay,
  common_ProductionRunLayQtyEntry,
  common_ProductionRunLaySection,
  googletype_Decimal,
} from 'api/proto-http/admin';
import { Button } from 'ui/components/button';
import { GroupLabel } from 'ui/components/group-label';
import { Pill } from 'ui/components/pill';
import { Row } from 'ui/components/row';
import Text from 'ui/components/text';
import {
  VERDICT_GLYPH,
  VERDICT_PILL,
  VERDICT_TEXT,
  VERDICT_WORD,
  layVerdict,
  worstVerdict,
} from './useLays';

export const LAY_MODE_LABEL: Record<string, string> = {
  PRODUCTION_LAY_MODE_FACE_UP: 'лицом вверх',
  PRODUCTION_LAY_MODE_FACE_TO_FACE: 'лицом к лицу',
  PRODUCTION_LAY_MODE_UNSPECIFIED: 'режим не задан',
};

// Сантиметры проводом, метры на экране: цех считает настил в метрах ткани, а хранится он в см,
// потому что маркер измеряется в см. '' (а не '0') на отсутствующем значении — «—» рисует
// вызывающий, чтобы пустое не читалось как ноль.
export function cmToM(d?: googletype_Decimal): string {
  const n = Number(d?.value);
  if (!d?.value || !Number.isFinite(n)) return '';
  return (n / 100).toFixed(2);
}

function cmValue(d?: googletype_Decimal): number | null {
  const n = Number(d?.value);
  return d?.value && Number.isFinite(n) ? n : null;
}

// Один настил в режиме ЧТЕНИЯ. Состояния не держит вовсе: раскрытие дифа количеств — нативный
// <details>, а не useState, поэтому карточка остаётся чистой функцией от настила. Всё, что она
// умеет менять, она просит сделать родителя (onEdit / onDelete / onReaffirm).
//
// И это НЕ белый блок: карточка живёт внутри секции «шаг 3», а блок в блоке запрещён. Структура —
// GroupLabel + Row, то есть ruled weights, ровно как велит DESIGN.md.
export function LayCard({
  lay,
  index,
  colorwayLabel,
  sizeLabel,
  canEdit,
  onEdit,
  onDelete,
  onReaffirm,
  reaffirming,
  onPlotter,
  plottingKey,
}: {
  lay: common_ProductionRunLay;
  index: number;
  colorwayLabel: (colorwayId: number) => string;
  sizeLabel: (sizeId: number) => string;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onReaffirm: () => void;
  reaffirming: boolean;
  /** Выпустить плоттерный файл секции. Отсутствует ⇒ кнопки нет (просмотр без права выпускать). */
  onPlotter?: (section: common_ProductionRunLaySection, key: string) => void;
  /** Ключ секции, которая сейчас готовится. Блокирует ТУ ЖЕ кнопку, а не все сразу. */
  plottingKey?: string;
}) {
  const checks = lay.checks ?? [];
  const sections = lay.sections ?? [];
  const verdict = worstVerdict(checks);
  const stale = lay.quantitiesStale === true;

  const totalPlies = lay.totalPlies ?? 0;
  const cloth = cmToM(lay.clothLengthCm);
  const endLoss = cmToM(lay.endLossTotalCm);
  const planned = cmToM(lay.plannedLengthCm);

  const title = [
    colorwayLabel(lay.colorwayId ?? 0),
    lay.bomItemName || 'слот не назван',
    lay.materialName || '',
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className='flex flex-col'>
      <GroupLabel
        flush={index === 0}
        action={
          <div className='flex flex-wrap items-center gap-1.5'>
            {/* Бейдж устаревания ЗАМЕЩАЕТ статусный пилл, а не встаёт рядом — тот же приём, что у
                подписей тех-карты (signoffs-field.tsx:126-137). «Годен» рядом с «количества
                изменились» были бы двумя ответами на один вопрос, и оператор поверил бы первому.
                Тон attention: в словаре тонов (ui/components/pill.tsx:5-13) именно он и значит
                «changed, stale». */}
            {stale ? (
              <Pill tone='attention'>количества изменились</Pill>
            ) : (
              <Pill tone={VERDICT_PILL[verdict]}>{VERDICT_WORD[verdict]}</Pill>
            )}
            {canEdit ? (
              <>
                <Button type='button' variant='secondary' size='xs' onClick={onEdit}>
                  править
                </Button>
                <Button
                  type='button'
                  variant='secondary'
                  size='xs'
                  aria-label={`удалить настил ${lay.name || title}`}
                  onClick={onDelete}
                >
                  ✕
                </Button>
              </>
            ) : null}
          </div>
        }
      >
        {title}
        {lay.name ? ` — ${lay.name}` : ''}
      </GroupLabel>

      {/* Незаданные концевые потери печатаются как «—», а НЕ как «0 см»: ноль здесь означал бы
          «потерь нет», то есть занижение потребности, выданное за измерение. */}
      <Row
        label={`${LAY_MODE_LABEL[lay.mode ?? ''] ?? 'режим не задан'} · концевые потери ${
          cmValue(lay.endLossCm) ?? '—'
        } см на конец слоя`}
        value={`${sections.length} секц. · ${totalPlies} сл.`}
      />
      <Row
        label='ткань + концевые = план настила'
        value={
          planned
            ? `${cloth || '—'} + ${endLoss || '—'} = ${planned} м`
            : '— пересчитается на сервере'
        }
      />
      <StackHeightRow lay={lay} checks={checks} />

      {/* ПЛОТТЕР — НА СЕКЦИЮ, А НЕ НА НАСТИЛ. Три секции это три РАЗНЫЕ раскладки, которые режут по
          очереди своими проходами; один файл «на настил» пришлось бы либо склеить из трёх (такой
          геометрии не существует), либо молча выбрать одну — и раскройщик получил бы файл, режущий
          не то, что он настелил. */}
      {sections.map((s, i) => (
        <Row
          key={s.sectionKey || `${s.markerId}-${i}`}
          tone='label'
          label={`${i + 1}. ${s.markerName || `раскладка #${s.markerId ?? 0}`}`}
          value={
            <span className='inline-flex items-center gap-2'>
              <span className='tabular-nums'>
                {s.plies ?? 0} сл · {cmValue(s.sectionLengthCm) ?? '—'} см
              </span>
              {onPlotter && (s.markerId ?? 0) > 0 && (
                <Button
                  type='button'
                  variant='underline'
                  size='xs'
                  disabled={plottingKey === (s.sectionKey || `${s.markerId}-${i}`)}
                  title='DXF для раскройного плоттера: контуры, кромка и ШАПКА (прогон, цвет, артикул, слои, состав, длина). БЕЗ линии шва и надсечек — их восстанавливают по выкройкам, а на странице прогона выкроек нет'
                  onClick={() => onPlotter(s, s.sectionKey || `${s.markerId}-${i}`)}
                >
                  {plottingKey === (s.sectionKey || `${s.markerId}-${i}`) ? 'готовим…' : 'плоттер'}
                </Button>
              )}
            </span>
          }
        />
      ))}

      <div className='mt-1 flex flex-col'>
        {checks.length === 0 ? (
          <Text size='micro' variant='label'>
            ? проверки годности не приехали — вердикта по этому настилу нет
          </Text>
        ) : (
          checks.map((c, i) => <CheckLine key={c.key || i} check={c} />)
        )}
      </div>

      {stale ? (
        <StaleDisclosure
          lay={lay}
          sizeLabel={sizeLabel}
          canEdit={canEdit}
          onEdit={onEdit}
          onReaffirm={onReaffirm}
          reaffirming={reaffirming}
        />
      ) : null}
    </div>
  );
}

// Высота стопки — трёхзначна, как и всё остальное (§11).
//
// Сервер НЕ отдаёт stack_height_cm вовсе, когда толщина ткани на артикуле не задана: «нет толщины
// — нет проверки, не догадка». Поэтому отсутствие числа рисуется словами «не считается» вместе с
// причиной из чека, и ни при каких условиях не как «0 см» — «0 см из 15» означало бы «влезает».
function StackHeightRow({
  lay,
  checks,
}: {
  lay: common_ProductionRunLay;
  checks: common_ProductionLayCheck[];
}) {
  const check = checks.find((c) => c.key === 'lay_stack_height');
  const verdict = check ? layVerdict(check.status) : 'unknown';
  const height = cmValue(lay.stackHeightCm);

  if (height == null || verdict === 'unknown') {
    return (
      <Row
        tone='label'
        label='высота стопки'
        value={`${VERDICT_GLYPH.unknown} не считается`}
        className={VERDICT_TEXT.unknown}
      />
    );
  }
  return (
    <Row
      label='высота стопки'
      value={`${VERDICT_GLYPH[verdict]} ${height} см`}
      className={VERDICT_TEXT[verdict]}
    />
  );
}

function CheckLine({ check }: { check: common_ProductionLayCheck }) {
  const verdict = layVerdict(check.status);
  return (
    <Text size='micro' className={VERDICT_TEXT[verdict]}>
      {VERDICT_GLYPH[verdict]}{' '}
      {/* «не проверено» произносится ВСЛУХ перед названием проверки: молчаливый серый глиф
          прочитался бы как приглушённое «ок». */}
      {verdict === 'unknown' ? 'не проверено: ' : ''}
      {check.label || check.key}
      {check.detail ? ` — ${check.detail}` : ''}
    </Text>
  );
}

// Диф снимка количеств. Раскрытие — <details>, чтобы карточка осталась без состояния.
//
// Два действия, и оба явные:
//   «пересобрать»          — открывает редактор: слои/секции меняет человек, снимок обновится
//                            вместе с секциями;
//   «количества проверены» — reaffirm_quantities без правки секций. Нужен, когда количество ушло
//                            ВНИЗ или изменилось в размере, которого настил не режет: перекрой
//                            законен, и требовать пересборки настила ради этого — вранье в другую
//                            сторону.
function StaleDisclosure({
  lay,
  sizeLabel,
  canEdit,
  onEdit,
  onReaffirm,
  reaffirming,
}: {
  lay: common_ProductionRunLay;
  sizeLabel: (sizeId: number) => string;
  canEdit: boolean;
  onEdit: () => void;
  onReaffirm: () => void;
  reaffirming: boolean;
}) {
  const diff = qtyDiff(lay.qtySnapshot ?? [], lay.qtyCurrent ?? []);
  return (
    <details className='mt-1'>
      <summary className='cursor-pointer text-micro uppercase tracking-label text-warning'>
        строки прогона изменились после того, как настил был построен
      </summary>
      <div className='mt-1 flex flex-col gap-1'>
        <Text size='small' className='tabular-nums'>
          {diff.length === 0
            ? 'снимок и текущие строки не разошлись ни в одном размере'
            : diff
                .map(
                  (d) =>
                    `${sizeLabel(d.sizeId)}: ${d.before == null ? '—' : d.before} → ${
                      d.after == null ? '—' : d.after
                    }`,
                )
                .join(' · ')}
        </Text>
        {canEdit ? (
          <div className='flex flex-wrap items-center gap-1.5'>
            <Button type='button' variant='secondary' size='xs' onClick={onEdit}>
              пересобрать
            </Button>
            <Button
              type='button'
              variant='secondary'
              size='xs'
              disabled={reaffirming}
              onClick={onReaffirm}
            >
              {reaffirming ? 'подтверждаю…' : 'количества проверены'}
            </Button>
          </div>
        ) : null}
      </div>
    </details>
  );
}

type QtyDelta = { sizeId: number; before: number | null; after: number | null };

// Объединение размеров обеих сторон: размер, ПОЯВИВШИЙСЯ в прогоне после построения настила,
// обязан быть виден («L: — → 4»), иначе диф покажет только то, что настил и так кроит.
export function qtyDiff(
  snapshot: common_ProductionRunLayQtyEntry[],
  current: common_ProductionRunLayQtyEntry[],
): QtyDelta[] {
  const before = new Map(snapshot.map((e) => [e.sizeId ?? 0, e.qty ?? 0]));
  const after = new Map(current.map((e) => [e.sizeId ?? 0, e.qty ?? 0]));
  const sizes = [...new Set([...before.keys(), ...after.keys()])].sort((a, b) => a - b);
  return sizes.map((sizeId) => ({
    sizeId,
    before: before.has(sizeId) ? before.get(sizeId)! : null,
    after: after.has(sizeId) ? after.get(sizeId)! : null,
  }));
}
