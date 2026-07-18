import Text from 'ui/components/text';
import { useStyleCutList } from './useStyleReadViews';

const cell = 'border border-textInactiveColor bg-bgColor px-2 py-1 text-textBaseSize';
const th = `${cell} text-left uppercase`;
const thRight = `${cell} text-right uppercase`;
const td = cell;
const tdRight = `${cell} text-right`;

// Q6: read-only production cut-list — one row per cut-piece (деталь кроя), expanded with
// total_per_garment already folding the mirrored pair (pieces_per_garment × 2) and, per
// colourway, which fabric (and optional fusing) BOM line it's cut from. NOT costing-gated —
// this is pattern/production data, not money.
// #42: this table is a CALCULATED projection, not an editable list — there is nothing to "add"
// here. It is derived (GetStyleCutList) from the cut-pieces on the pieces tab × their mirror flag ×
// each colourway's fabric mapping. To change a row: edit the piece (pieces tab above) or its
// per-colourway fabric/fusing mapping (colorways tab) — this view just reflects the result.
const INTRO =
  'Calculated, not editable: pieces × mirror × each colourway’s fabric mapping. Add / edit pieces on the pieces tab above and their fabric per colourway on the colorways tab — this table just shows the result.';

export function CutListField({ techCardId }: { techCardId?: number }) {
  const { data, isLoading, isError } = useStyleCutList(techCardId, true);
  const pieces = data?.pieces ?? [];

  if (isLoading) {
    return <Text size='small'>loading…</Text>;
  }
  if (isError) {
    return (
      <Text variant='inactive' size='small'>
        cut list unavailable
      </Text>
    );
  }
  if (pieces.length === 0) {
    return (
      <Text variant='inactive' size='small'>
        {INTRO} No cut pieces yet — add one on the pieces tab above and it will appear here.
      </Text>
    );
  }

  return (
    <div className='flex flex-col gap-2'>
      <Text variant='inactive' size='small'>
        {INTRO}
      </Text>
      <div className='overflow-x-auto'>
        <table className='w-full min-w-max border-collapse'>
          <thead>
            <tr>
              <th className={th}>piece</th>
              <th className={th}>grainline</th>
              <th className={th}>fused</th>
              <th className={thRight}>pieces / garment</th>
              <th className={th}>mirrored</th>
              <th className={thRight}>total / garment</th>
              <th className={th}>fabric (by colourway)</th>
            </tr>
          </thead>
          <tbody>
            {pieces.map((p, i) => {
              const fabrics = p.fabrics ?? [];
              return (
                <tr key={p.pieceId || i}>
                  <td className={td}>{p.name || `#${p.pieceId}`}</td>
                  <td className={td}>{p.grainline || '—'}</td>
                  <td className={td}>{p.fused ? 'yes' : '—'}</td>
                  <td className={tdRight}>{p.piecesPerGarment ?? 0}</td>
                  <td className={td}>{p.mirrored ? '×2 pair' : '—'}</td>
                  <td className={tdRight}>{p.totalPerGarment ?? 0}</td>
                  <td className={td}>
                    {fabrics.length === 0 ? (
                      <Text variant='inactive' size='small'>
                        —
                      </Text>
                    ) : (
                      <div className='flex flex-col gap-1'>
                        {fabrics.map((f, fi) => (
                          <Text key={fi} size='small' className='block'>
                            colourway #{f.colorwayId}: {f.fabricName || `#${f.bomItemId}`}
                            {f.fusingName ? ` · fusing: ${f.fusingName}` : ''}
                          </Text>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
