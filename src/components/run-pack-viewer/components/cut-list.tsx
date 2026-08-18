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
import { fusingViewerCaption, RpCutBlocker, RpCutRow, RpSize } from './manifest';
import { DESC_CELL, RUNPACK_GRID } from './table';

const SYMMETRY_PREFIX = 'TECH_CARD_PIECE_CUT_SYMMETRY_';

// РОЛЬ СЛОЯ по секции слота (T4): с решением владельца деталь со слоями даёт СТРОКУ НА КАЖДЫЙ слой
// (шелл + подклад = две строки одной детали), и без подписи две строки читаются как дубль. Манифест
// несёт серверное слово секции (bomSectionWord) — глубже секции наряд роль не знает (назначение по
// проводу кат-плана не едет), и этого достаточно: подпись различает слои, не пересказывая BOM.
const SECTION_LAYER_WORD: Record<string, string> = {
  fabric: 'fabric',
  lining: 'lining',
  interlining: 'interlining',
  insulation: 'insulation',
};
const sectionLayerWord = (section?: string): string =>
  SECTION_LAYER_WORD[(section ?? '').trim().toLowerCase()] ?? '';

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
        <b>stop — {blockers.length} piece × colourway not linked to an article</b>
      </Text>
      {blockers.map((b, i) => (
        <Text key={`${b.piece_id ?? 0}-${b.colorway_id ?? 0}-${i}`} component='p'>
          {(b.piece_name ?? '').trim() || `piece #${b.piece_id}`} ·{' '}
          {(b.colorway_name ?? '').trim() || `colourway #${b.colorway_id}`} — {b.garments ?? 0}{' '}
          garments:{' '}
          {(b.reason ?? '').trim() || 'reason not named'}
        </Text>
      ))}
      <Text size='micro' variant='label' component='p'>
        these pieces are not in the table below — they can't be cut until the technologist names an
        article. blockers are shown across the WHOLE run: no filter hides them.
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
            <th>piece</th>
            <th>colourway</th>
            <th>per garment</th>
            <th>what to cut from</th>
            {columns.map((s) => (
              <th key={s.id}>
                {(s.name ?? '').trim() || ((s.id ?? 0) > 0 ? `#${s.id}` : 'no size')}
              </th>
            ))}
            <th>to cut</th>
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
                // И СЛОТ (T4): деталь со слоями даёт несколько строк одного колорвея — без
                // bom_item_id ключи шелла и подклада совпали бы.
                key={`${r.piece_id ?? 0}-${r.colorway_id ?? 0}-${r.output_variant_id ?? 0}-${
                  r.bom_item_id ?? 0
                }-${r.piece_line_key || i}`}
              >
                <td className={DESC_CELL}>
                  <div className='font-medium'>
                    {(r.piece_name ?? '').trim() || `piece #${r.piece_id}`}
                  </div>
                  {/* Долевая дублируется в КАЖДОЙ строке колорвея намеренно (так же её дублирует
                      сервер): деталь без долевой в СВОЕЙ строке — это деталь, которую раскроят
                      неправильно, даже если та же долевая написана строкой выше у другого цвета. */}
                  <Text size='nano' variant='label' component='p' className='uppercase'>
                    grainline: {(r.grainline ?? '').trim() || 'not set'}
                    {arrow ? ` ${arrow}` : ''}
                  </Text>
                  {r.fused ? (
                    <Text size='nano' component='p' className='uppercase'>
                      fusing: {(r.fusing_material_name ?? '').trim() || 'article not named'}
                      {/* КАК ИМЕННО дублировать (0304) — по тому же доводу, что и долевая строкой
                          выше: по этому экрану режут, и строка режется отдельно. Манифест несёт
                          режим уже словом (fusingModeWord на сервере), поэтому здесь оно только
                          печатается — второй словарь развёл бы бумагу с телефоном. */}
                      {` · ${fusingViewerCaption(r.fusing_mode, r.fusing_width_mm)}`}
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
                    {(r.slot_name ?? '').trim() || 'slot not named'}
                  </div>
                  <div>{(r.material_name ?? '').trim() || 'article not assigned'}</div>
                  <Text size='nano' variant='label' component='p' className='uppercase'>
                    {[sectionLayerWord(r.section), r.pinned ? 'recipe pin' : 'slot default']
                      .filter(Boolean)
                      .join(' · ')}
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
                            {cell.garments ?? '?'} garments
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
                    panels
                  </Text>
                </td>
              </tr>
            );
          })}
          <TotalRow>
            {/* colSpan = описательные колонки (piece, colourway, per garment, what to cut from) +
                вся градация. Разъедется — итог встанет под чужой колонкой. */}
            <td className='uppercase' colSpan={4 + columns.length}>
              panels in total
            </td>
            <td>{total ?? '?'}</td>
          </TotalRow>
        </tbody>
      </DataTable>

      <Text size='micro' variant='label' component='p'>
        {CUT_SYMMETRY_PRINT_LEGEND}
      </Text>
      <Text size='micro' variant='label' component='p'>
        “recipe pin” — the article is assigned by the colourway recipe; “slot default” — the default
        article of the role in the BOM was taken.
      </Text>
      {caveats.map((c, i) => (
        <Text key={i} size='micro' variant='label' component='p'>
          · {c}
        </Text>
      ))}
    </div>
  );
}
