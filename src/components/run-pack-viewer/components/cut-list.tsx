// КАТ-ЛИСТ ПАРТИИ — что, из чего и сколько выкроить.
//
// Считает СЕРВЕР (тот же расчёт печатается на бумаге), экран только показывает: вторая реализация
// «сколько выкроить» обязана была бы совпасть с первой и не совпала бы — ровно от такой пары этот
// наряд цех и избавляет.
//
// Словари симметрии и долевой берутся из tech-card/piece-codes: подпись «зеркальные пары» на экране
// технолога, на бумаге и здесь обязана быть одним и тем же словом. Ключ там — имя proto-энума, а
// манифест несёт серверное написание («mirrored»), отсюда сборка ключа префиксом — та же конвенция,
// что у вьюера выкроек с bomPurposeLabel.
import {
  CUT_SYMMETRY_PRINT_LEGEND,
  cutSymmetryBadge,
  grainlineArrow,
} from 'components/managers/tech-card/components/piece-codes';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell, TotalRow } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import Text from 'ui/components/text';
import { RpCutBlocker, RpCutRow, RpSize } from './manifest';
import { DESC_CELL, RUNPACK_GRID } from './table';

const SYMMETRY_PREFIX = 'TECH_CARD_PIECE_CUT_SYMMETRY_';

// Пустое значение НЕ превращается в ключ энума: «TECH_CARD_PIECE_CUT_SYMMETRY_» — непустая строка,
// и cutSymmetryBadge приняла бы её за размеченную симметрию, напечатав сырой префикс закройщику.
const symmetryKey = (word?: string): string => {
  const w = (word ?? '').trim();
  return w ? `${SYMMETRY_PREFIX}${w.toUpperCase()}` : '';
};

export function CutBlockers({ blockers }: { blockers: RpCutBlocker[] }) {
  if (blockers.length === 0) return null;
  return (
    <CalloutBox tone='error' className='space-y-1'>
      <Text component='p' className='uppercase'>
        <b>стоп — {blockers.length} дет. × колорвей не привязаны к артикулу</b>
      </Text>
      {blockers.map((b, i) => (
        <Text key={`${b.piece_id ?? 0}-${b.colorway_id ?? 0}-${i}`} component='p'>
          {(b.piece_name ?? '').trim() || `деталь #${b.piece_id}`} ·{' '}
          {(b.colorway_name ?? '').trim() || `колорвей #${b.colorway_id}`} — {b.garments ?? 0} изд.:{' '}
          {(b.reason ?? '').trim() || 'причина не названа'}
        </Text>
      ))}
      <Text size='micro' variant='label' component='p'>
        этих деталей нет в таблице ниже — их нельзя кроить, пока технолог не назовёт артикул.
        Блокеры показаны по ВСЕЙ партии: их не прячет ни один фильтр.
      </Text>
    </CalloutBox>
  );
}

export function CutList({
  rows,
  columns,
  rowTotal,
  total,
  caveats,
  empty,
}: {
  rows: RpCutRow[];
  columns: RpSize[];
  rowTotal: (row: RpCutRow) => number | undefined;
  total?: number;
  caveats: string[];
  /** Текст на месте таблицы, когда строк нет: пусто «почему», а не просто пусто. */
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className='space-y-2.5'>
        <Text component='p'>{empty}</Text>
        {caveats.map((c, i) => (
          <Text key={i} size='micro' variant='label' component='p'>
            · {c}
          </Text>
        ))}
      </div>
    );
  }

  return (
    <div className='space-y-2.5'>
      <DataTable variant='grid' className={RUNPACK_GRID}>
        <thead>
          <tr>
            <th>деталь</th>
            <th>колорвей</th>
            <th>на изд.</th>
            <th>из чего кроить</th>
            {columns.map((s) => (
              <th key={s.id}>{(s.name ?? '').trim() || ((s.id ?? 0) > 0 ? `#${s.id}` : 'б/р')}</th>
            ))}
            <th>выкроить</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const badge = cutSymmetryBadge(symmetryKey(r.cut_symmetry), r.pieces_per_garment);
            const arrow = grainlineArrow(r.grainline);
            const cells = new Map((r.by_size ?? []).map((c) => [c.size_id ?? 0, c]));
            return (
              <tr
                // Ключ несёт И колорвей, И цвет выхода: у aux-строк colorway_id = 0, и без
                // output_variant_id две строки одной детали в разных цветах становятся неразличимы.
                key={`${r.piece_id ?? 0}-${r.colorway_id ?? 0}-${r.output_variant_id ?? 0}-${
                  r.piece_line_key || i
                }`}
              >
                <td className={DESC_CELL}>
                  <div className='font-medium'>
                    {(r.piece_name ?? '').trim() || `деталь #${r.piece_id}`}
                  </div>
                  {/* Долевая дублируется в КАЖДОЙ строке колорвея намеренно (так же её дублирует
                      сервер): деталь без долевой в СВОЕЙ строке — это деталь, которую раскроят
                      неправильно, даже если та же долевая написана строкой выше у другого цвета. */}
                  <Text size='nano' variant='label' component='p' className='uppercase'>
                    долевая: {(r.grainline ?? '').trim() || 'не задана'}
                    {arrow ? ` ${arrow}` : ''}
                  </Text>
                  {r.fused ? (
                    <Text size='nano' component='p' className='uppercase'>
                      клеевая: {(r.fusing_material_name ?? '').trim() || 'артикул не назван'}
                    </Text>
                  ) : null}
                </td>
                <td className={DESC_CELL}>
                  {(r.colorway_name ?? '').trim() ||
                    (r.output_variant_name ?? '').trim() ||
                    `#${r.colorway_id ?? 0}`}
                </td>
                {/* Число + СЛОВАМИ, как оно кроится. cut_symmetry НИЧЕГО не умножает — она
                    объясняет, как связаны между собой эти n панелей, и только. */}
                <td>
                  <Text size='stat' component='p'>
                    {r.pieces_per_garment ?? '—'}
                  </Text>
                  {badge ? (
                    <div className='mt-0.5'>
                      <Pill tone={badge.tone}>{badge.label}</Pill>
                    </div>
                  ) : null}
                </td>
                <td className={DESC_CELL}>
                  <div className='font-medium'>
                    {(r.slot_name ?? '').trim() || 'слот не назван'}
                  </div>
                  <div>{(r.material_name ?? '').trim() || 'артикул не назначен'}</div>
                  <Text size='nano' variant='label' component='p' className='uppercase'>
                    {r.pinned ? 'пин рецепта' : 'дефолт слота'}
                  </Text>
                </td>
                {columns.map((s) => {
                  const cell = cells.get(s.id ?? 0);
                  return (
                    <td key={s.id}>
                      {/* «·» — клетки нет в плане, «?» — клетка есть, а количества сервер не назвал.
                          Ноль означал бы измеренное «кроить ноль панелей», то есть указание не
                          кроить, которого никто не давал. */}
                      {!cell ? (
                        <EmptyCell>·</EmptyCell>
                      ) : (
                        <>
                          <Text size='stat' component='p'>
                            {cell.pieces_to_cut ?? '?'}
                          </Text>
                          <Text size='nano' variant='label' component='p'>
                            {cell.garments ?? '?'} изд.
                          </Text>
                        </>
                      )}
                    </td>
                  );
                })}
                <td>
                  <Text size='stat' component='p'>
                    {rowTotal(r) ?? '?'}
                  </Text>
                  <Text size='nano' variant='label' component='p' className='uppercase'>
                    панелей
                  </Text>
                </td>
              </tr>
            );
          })}
          <TotalRow>
            {/* colSpan = описательные колонки (деталь, колорвей, на изд., из чего) + вся градация.
                Разъедется — итог встанет под чужой колонкой. */}
            <td className='uppercase' colSpan={4 + columns.length}>
              всего панелей
            </td>
            <td>{total ?? '?'}</td>
          </TotalRow>
        </tbody>
      </DataTable>

      <Text size='micro' variant='label' component='p'>
        {CUT_SYMMETRY_PRINT_LEGEND}
      </Text>
      <Text size='micro' variant='label' component='p'>
        «пин рецепта» — артикул назначен рецептом колорвея; «дефолт слота» — взят артикул по
        умолчанию у роли в BOM.
      </Text>
      {caveats.map((c, i) => (
        <Text key={i} size='micro' variant='label' component='p'>
          · {c}
        </Text>
      ))}
    </div>
  );
}
