// ПЛАШКИ СТРОКИ РАСКЛАДКИ (11.11, прод-карта 6, строка INTERLINING): norm + set changed + patterns
// changed в колонке 160px шли в одну строку без переноса и вылезали влево на LENGTH / EFF, налезая
// друг на друга. Ячейка переносит плашки внутри своей колонки — сколько бы их ни было.
import { Close, Pill } from 'ui';

/** Ячейка плашек: перенос внутри колонки, а не вылет на соседние. */
export const MARKER_BADGES_CELL =
  'flex min-w-0 flex-wrap items-baseline justify-end gap-x-2 gap-y-1';

/** «interlining interlining» (назначение + область в имени строки BOM): одно слово один раз. */
export const markerGroupLabel = (bomItemName?: string): string =>
  (bomItemName ?? '').trim().replace(/\b(\S+)(\s+\1\b)+/gi, '$1');

export function MarkerBadges({
  isNorm,
  draft,
  draftProgress,
  refusal,
  changed,
  sheetMoved,
  conflict,
  onDelete,
}: {
  isNorm?: boolean;
  draft?: boolean;
  draftProgress?: string;
  refusal?: string;
  changed?: boolean;
  sheetMoved?: boolean;
  conflict?: string;
  onDelete?: (e: React.MouseEvent) => void;
}) {
  return (
    <span className={MARKER_BADGES_CELL}>
      {isNorm && (
        <Pill
          tone='ok'
          title='the norm: the marker costing and the readiness gate measure this fabric by. chosen automatically — the newest complete single-size marker of the fabric.'
        >
          norm
        </Pill>
      )}
      {draft && (
        <Pill tone='warn' title={refusal}>
          draft
          {draftProgress ?? ''}
        </Pill>
      )}
      {changed && (
        <Pill
          tone='attention'
          title='the piece set on the card changed since the capture — recheck'
        >
          set changed
        </Pill>
      )}
      {sheetMoved && <Pill tone='attention'>patterns changed</Pill>}
      {conflict && (
        <Pill tone='warn' title={conflict}>
          norm conflict
        </Pill>
      )}
      {onDelete && <Close size='sm' aria-label='delete marker' onClick={onDelete} />}
    </span>
  );
}
