import { common_Material, common_TechCard } from 'api/proto-http/admin';
import { materialCompositionText } from 'components/managers/materials/components/material-code';
import { useMaterials, useSaveMaterial } from 'components/managers/materials/components/useMaterials';
import { useSnackBarStore } from 'lib/stores/store';
import { useMemo } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { Pill } from 'ui/components/pill';
import { Section } from 'ui/components/section';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { kindLabel } from './bom-kind';
import { sectionShort } from './bom-line-picker';
import { bomPurposeLabel, UNSET_PURPOSE } from './bom-purpose-labels';
import { PantonePicker } from './pantone-picker';
import { TechCardFormData, wireInt } from './schema';

// C-8 · «# / COMPONENT / MATERIAL / FIBER / COLOR / PANTONE / EST USAGE / SUPPLIER» (owner's snapshot),
// «with a column to pick from our materials + a Pantone colour picker».
//
// THIS IS THE REAL BOM READ AS A SPEC SHEET — a second face of `bomItems[]`, not a draft beside it.
// The decision, and why: every column of the snapshot is already a fact of a BOM line or of the
// catalogue article the line links to. Component = the line's role (`name`); material = the linked
// `Material`; fiber = its composition entries; color / pantone / supplier = the article's own
// fields; est usage = what the colourway recipes say for the line. A separate «potential BOM» would
// have been a fifth place to name the main fabric (line, article, recipe, colourway — and it), and
// the one that never feeds costing, markers or the cut list.
//
// WHAT WRITES WHERE — the three things that are not read-only here:
//   · material — «link ›» opens THIS line's editor on the BOM tab (the existing deep link
//     `?tab=bom&bom=<line_key>`), where the swatch picker AND the snapshot of the article's fields
//     (supplier, composition, width, price) are written together. A picker here that set only
//     `materialId` would leave the price snapshot of the previous article on the line, and costing
//     would run on it. One writer, one click away.
//   · pantone — the only place a per-article Pantone lives today is the CATALOGUE (`Material.pantone`);
//     the BOM line has `color` but no pantone, and the per-colourway one needs a colourway. So the
//     picker writes the material card, through the same `UpdateMaterial` the materials manager
//     uses, and the cell says «catalogue». A line-level intent («this component, this colour, no
//     article chosen yet») has no home and is not stored anywhere silently — that field is named
//     in the wave report.
//   · nothing else. Adding a line is the BOM tab's two-step dialog (article, then role); it is not
//     duplicated here.

type Line = NonNullable<TechCardFormData['bomItems']>[number];

/** One usage value per line: the recipes agree → the number; they differ → «varies»; none → ''. */
function estUsage(
  techCard: common_TechCard | undefined,
  line: Line,
  lineKeyByBomId: Map<number, string>,
): { text: string; varies: boolean } {
  const key = line.lineKey?.trim();
  if (!key) return { text: '', varies: false };
  const values = new Set<string>();
  let perSize = false;
  for (const cw of techCard?.colorways ?? []) {
    for (const u of cw.usages ?? []) {
      const uKey = u.bomLineKey?.trim() || lineKeyByBomId.get(wireInt(u.bomItemId)) || '';
      if (uKey !== key) continue;
      const v = decimalToInput(u.consumption).trim() || decimalToInput(u.quantity).trim();
      if (v) values.add(v);
      else if ((u.sizeConsumptions ?? []).length > 0) perSize = true;
    }
  }
  if (values.size === 1) return { text: Array.from(values)[0], varies: false };
  if (values.size > 1) return { text: 'varies', varies: true };
  if (perSize) return { text: 'per size', varies: true };
  return { text: '', varies: false };
}

export function ConstructionBomTable({
  techCard,
  canWrite,
  onGoTab,
}: {
  techCard?: common_TechCard;
  /** Write permission on tech cards — the materials catalogue sits under the same section. */
  canWrite: boolean;
  onGoTab?: (tab: string, extra?: Record<string, string>) => void;
}) {
  const { control } = useFormContext<TechCardFormData>();
  const lines = (useWatch({ control, name: 'bomItems' }) ?? []) as Line[];
  // The catalogue query the BOM tab and the construction workspace already hold — a cache hit.
  const { data } = useMaterials('', true);
  const materialById = useMemo(() => {
    const m = new Map<number, common_Material>();
    for (const mat of data?.materials ?? []) {
      const id = wireInt(mat.id);
      if (id > 0) m.set(id, mat);
    }
    return m;
  }, [data?.materials]);
  // Legacy usages carry only the resolved bom_item_id; id → line_key from the same read payload.
  const lineKeyByBomId = useMemo(() => {
    const m = new Map<number, string>();
    for (const l of techCard?.techCard?.bomItems ?? []) {
      const id = wireInt(l.id);
      const key = l.lineKey?.trim();
      if (id > 0 && key) m.set(id, key);
    }
    return m;
  }, [techCard?.techCard?.bomItems]);

  const save = useSaveMaterial();
  const { showMessage } = useSnackBarStore();
  const pickPantone = (m: common_Material, code: string) => {
    save.mutate(
      { ...m, pantone: code },
      {
        onSuccess: () =>
          showMessage(
            code
              ? `${m.name || 'material'} · pantone ${code} — saved to the material card`
              : `${m.name || 'material'} · pantone cleared on the material card`,
            'success',
          ),
        onError: (e) =>
          showMessage(
            `pantone was not saved to ${m.name || 'the material'}: ${(e as Error)?.message || 'the catalogue refused'}`,
            'error',
          ),
      },
    );
  };

  const goToLine = (line: Line) =>
    onGoTab?.('bom', line.lineKey?.trim() ? { bom: line.lineKey.trim() } : {});

  return (
    <Section
      title='bill of materials'
      question='— the BOM lines of this card, read as a spec sheet'
      action={
        onGoTab ? (
          <Button type='button' variant='secondary' size='sm' data-c19-bom-add='' onClick={() => onGoTab('bom')}>
            + add on BOM
          </Button>
        ) : undefined
      }
    >
      <div data-c19-bom=''>
        {lines.length === 0 ? (
          <Text size='micro' variant='label' data-c19-bom-empty=''>
            no BOM lines yet — add articles on the BOM tab; they appear here as a spec sheet
          </Text>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <th className='w-8'>#</th>
                <th data-align='left'>component</th>
                <th data-align='left'>material</th>
                <th data-align='left'>fiber</th>
                <th data-align='left'>color</th>
                <th data-align='left'>pantone</th>
                <th>est usage</th>
                <th data-align='left'>supplier</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line, i) => {
                const materialId = wireInt(line.materialId);
                const m = materialId > 0 ? materialById.get(materialId) : undefined;
                const linked = materialId > 0;
                const purpose =
                  line.purpose && line.purpose !== UNSET_PURPOSE ? bomPurposeLabel(line.purpose) : '';
                const kind = kindLabel(line.kind) ?? '';
                const fiber = m ? materialCompositionText(m) : (line.composition ?? '').trim();
                const color = m?.color?.trim() || line.color?.trim() || '';
                const pantone = m?.pantone?.trim() || '';
                const usage = estUsage(techCard, line, lineKeyByBomId);
                const unit = (line.unit || m?.unit || '').trim();
                const supplier = [m?.supplier?.trim() || line.supplier?.trim(), m?.supplierRef?.trim() || line.supplierRef?.trim()]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <tr key={line.lineKey || i} data-c19-bom-row={i} data-c19-bom-linked={linked ? '1' : '0'}>
                    <td className='tabular-nums'>{i + 1}</td>
                    <td data-align='left' className='min-w-[140px]'>
                      <Text component='span' className='font-bold' data-c19-bom-component={i}>
                        {line.name?.trim() || 'unnamed'}
                      </Text>
                      <Text size='micro' variant='label' component='p'>
                        {[sectionShort(line.section), purpose, kind].filter(Boolean).join(' · ')}
                      </Text>
                    </td>
                    <td data-align='left' className='min-w-[180px]' data-c19-bom-material={i}>
                      {m ? (
                        <Text component='span'>
                          {[m.code?.trim(), m.name?.trim() || `#${materialId}`].filter(Boolean).join(' · ')}
                        </Text>
                      ) : linked ? (
                        <Text component='span'>#{materialId}</Text>
                      ) : (
                        <Pill tone='warn'>! not linked</Pill>
                      )}
                      {onGoTab && (
                        <div className='mt-0.5'>
                          <Button
                            type='button'
                            variant='secondary'
                            size='xs'
                            data-c19-bom-link={i}
                            onClick={() => goToLine(line)}
                          >
                            {linked ? 'change ›' : 'link a material ›'}
                          </Button>
                        </div>
                      )}
                    </td>
                    <td data-align='left' className='min-w-[140px]' data-c19-bom-fiber={i}>
                      {fiber || <EmptyCell />}
                    </td>
                    <td data-align='left' data-c19-bom-color={i}>
                      {color || <EmptyCell />}
                    </td>
                    <td data-align='left' className='min-w-[140px]' data-c19-bom-pantone={i}>
                      {m && canWrite ? (
                        <PantonePicker
                          name={`bom-${i}`}
                          value={pantone}
                          disabled={save.isPending}
                          onPick={(code) => pickPantone(m, code)}
                        />
                      ) : pantone ? (
                        <Text component='span' className='uppercase'>
                          {pantone}
                        </Text>
                      ) : (
                        <EmptyCell />
                      )}
                      <Text size='micro' variant='label' component='p'>
                        {m ? 'catalogue' : linked ? 'catalogue · loading' : 'link a material first'}
                      </Text>
                    </td>
                    <td className='tabular-nums' data-c19-bom-usage={i}>
                      {usage.text ? (
                        <Text
                          component='span'
                          variant={usage.varies ? 'label' : 'default'}
                          className={usage.varies ? 'lowercase' : undefined}
                        >
                          {usage.text}
                          {!usage.varies && unit ? ` ${unit}` : ''}
                        </Text>
                      ) : (
                        <EmptyCell />
                      )}
                    </td>
                    <td data-align='left' className='min-w-[120px]' data-c19-bom-supplier={i}>
                      {supplier || <EmptyCell />}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
        )}
        <Text size='micro' variant='label' className='mt-1.5'>
          fiber, colour, pantone and supplier are the linked article's catalogue facts — picking a
          pantone here updates the material card; est usage is the colourway recipes' norm where
          every colourway agrees
        </Text>
      </div>
    </Section>
  );
}
