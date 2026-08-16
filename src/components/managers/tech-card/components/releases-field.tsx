import { useQuery } from '@tanstack/react-query';
import { adminService } from 'api/api';
import {
  common_TechCardBomItem,
  common_TechCardConstruction,
  common_TechCardMachineProfile,
  common_TechCardOperation,
  common_TechCardOperationMedia,
  common_TechCardPiece,
  common_TechCardPressProfile,
  common_TechCardReleaseMeta,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { formatTechCardDate } from 'components/managers/tech-cards/components/utils';
import { techCardBomSectionOptions, techCardStageOptions } from 'constants/filter';
import { cn } from 'lib/utility';
import { Fragment, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import { DataTable, EmptyCell } from 'ui/components/data-table';
import { GroupLabel } from 'ui/components/group-label';
import { Row, RowTotal } from 'ui/components/row';
import {
  isMachineStepType,
  isPressStepType,
  machineProfileName,
  machineTypeLabel,
  machineTypeLabelWithStitch,
  pressEquipmentLabel,
  pressProcessShort,
  pressProfileName,
} from './equipment-options';
import {
  densityText,
  machineProfileSummary,
  OPERATION_TYPE_LABELS,
  operationHeading,
  pressProfileSummary,
  seamClassOptions,
} from './operation-options';
import { SectionHeader } from 'ui/components/section-header';
import Text from 'ui/components/text';
import { decimalToInput } from 'utils/decimal';
import { AnnotationCanvas } from './annotation-canvas';
import { ReleaseBlocker, ReleaseBlockersModal } from './release-blockers-modal';
import {
  annotationColorFromWire,
  annotationKindFromWire,
  wireInt,
  type AnnotationForm,
} from './schema';

const bomSectionLabel = (v?: string) =>
  techCardBomSectionOptions.find((o) => o.value === v)?.label ?? v ?? '—';
const stageLabel = (v?: string) => techCardStageOptions.find((o) => o.value === v)?.label ?? '—';

/**
 * What the `create release` button needs from the owner of the form. Optional: without it this
 * component is the read-only history it has always been, and the caller keeps its own button.
 * With it, the button lives here and shares the header's blocker gate — it is never a dead grey
 * button, it opens the blockers modal instead.
 */
export type ReleaseGate = {
  /** Reasons the card can't be released, with the tab that fixes each. Empty = ready. */
  blockers: ReleaseBlocker[];
  /** Freeze the current spec — the caller's `submitWithApproval(RELEASED)`. */
  onRelease: () => void;
  onGoToTab: (tab: string) => void;
  saving?: boolean;
};

// The frozen BOM the factory reads — the whole point of a release snapshot, previously shown only
// as a line count.
function SnapshotBom({ items }: { items: common_TechCardBomItem[] }) {
  if (items.length === 0) {
    return (
      <>
        <GroupLabel>BOM (frozen)</GroupLabel>
        <Text size='micro' variant='label'>
          no BOM lines
        </Text>
      </>
    );
  }
  return (
    <>
      <GroupLabel>BOM (frozen) · {items.length}</GroupLabel>
      <DataTable>
        <thead>
          <tr>
            <th>section</th>
            <th>material</th>
            <th>composition</th>
            <th>spec</th>
            <th>supplier</th>
          </tr>
        </thead>
        <tbody>
          {items.map((b, i) => (
            <tr key={b.id ?? b.lineKey ?? i}>
              <td>{bomSectionLabel(b.section)}</td>
              <td>
                {b.name || <EmptyCell />}
                {b.color ? ` · ${b.color}` : ''}
              </td>
              <td>{b.composition || <EmptyCell />}</td>
              <td>
                {b.spec || <EmptyCell />}
                {b.unit ? ` (${b.unit})` : ''}
              </td>
              <td>
                {b.supplier || <EmptyCell />}
                {b.supplierRef ? ` · ${b.supplierRef}` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </>
  );
}

// A SNAPSHOT IS RENDERED THROUGH DICTIONARIES, NEVER RAW. The seam class used to print as
// `TECH_CARD_SEAM_CLASS_SS_PLAIN` and the density as a bare number — the wire tokens, straight out
// of the blob. The labels are the same ones the live editor and the printed sheet use, and an
// unrecognised token (a class that left the contract) falls back to the token itself rather than to
// a blank row: a frozen release must never lose a line somebody signed.
const seamClassLabel = (v?: string) =>
  !v || v === 'TECH_CARD_SEAM_CLASS_UNKNOWN'
    ? ''
    : (seamClassOptions.find((o) => o.value === v)?.label ?? v);

function SnapshotConstruction({ c }: { c?: common_TechCardConstruction }) {
  if (!c) return null;
  const rows = (
    [
      ['default seam class', seamClassLabel(c.defaultSeamClass)],
      ['default stitch density', densityText(decimalToInput(c.defaultStitchesPerCm))],
      // NO `overlock threads` / `pressing` ROWS. They left the contract with the equipment park
      // (0306) and a release snapshot written before that still holds them in the database — but
      // not here: the server parses the blob into the current TechCard with DiscardUnknown, so the
      // two fields are gone before the response is built. The rows were permanently blank and read
      // as «this release said nothing about pressing», which is the opposite of what they meant.
      ['hem finish', c.hemFinish],
      ['notes', c.notes],
    ] as Array<[string, string | undefined]>
  ).filter((r): r is [string, string] => !!r[1]?.trim());
  if (rows.length === 0) return null;
  return (
    <>
      <GroupLabel>construction (frozen)</GroupLabel>
      {rows.map(([k, v]) => (
        <Row key={k} label={k} value={v} />
      ))}
    </>
  );
}

// Decimals arrive from the snapshot as messages, while the one summary composer (shared with the
// card's own park tiles and with the printed sheet) speaks the form's strings — decimalToInput is
// that boundary and the only difference between the two callers.
const machineSummaryOf = (m: common_TechCardMachineProfile) =>
  machineProfileSummary({
    threadCount: m.threadCount,
    needleType: m.needleType,
    needleSizeNm: m.needleSizeNm,
    bedType: m.bedType,
    automation: m.automation,
    threadTension: m.threadTension,
    threadTensionNote: m.threadTensionNote,
    attachmentKind: m.attachmentKind,
    stitchesPerCm: decimalToInput(m.stitchesPerCm),
    stitchWidthMm: decimalToInput(m.stitchWidthMm),
  });

const pressSummaryOf = (p: common_TechCardPressProfile) =>
  pressProfileSummary({
    pressTemperatureC: p.pressTemperatureC,
    pressDwellSec: p.pressDwellSec,
    pressPressureNCm2: decimalToInput(p.pressPressureNCm2),
    pressSteam: p.pressSteam,
    pressCloth: p.pressCloth,
  });

// THE PARK THE RELEASE WAS SIGNED WITH — and it is not decoration on this pane either: since 0306 a
// step stores only what it OVERRIDES, so a frozen step reading «4 threads» nowhere is a step whose
// four threads are in one of these rows. A release frozen before the park simply carries none and
// the block does not render.
function SnapshotEquipment({ c }: { c?: common_TechCardConstruction }) {
  const machines = c?.equipmentDefaults?.machines ?? [];
  const presses = c?.equipmentDefaults?.presses ?? [];
  if (machines.length === 0 && presses.length === 0) return null;
  return (
    <>
      <GroupLabel>equipment park (frozen) · {machines.length + presses.length}</GroupLabel>
      {machines.map((m, i) => (
        <Row
          key={`machine-${i}`}
          label={
            <Text size='micro' component='span'>
              {machineProfileName(m)}
              <Text size='nano' variant='label' component='span'>
                {' — '}
                {machineSummaryOf(m) || 'no settings'}
              </Text>
            </Text>
          }
          value={
            <Text size='micro' variant='label' component='span'>
              {machineTypeLabel(m.machineType) || 'machine'}
            </Text>
          }
        />
      ))}
      {presses.map((p, i) => (
        <Row
          key={`press-${i}`}
          label={
            <Text size='micro' component='span'>
              {pressProfileName(p)}
              <Text size='nano' variant='label' component='span'>
                {' — '}
                {pressSummaryOf(p) || 'no settings'}
              </Text>
            </Text>
          }
          value={
            <Text size='micro' variant='label' component='span'>
              {[pressEquipmentLabel(p.pressEquipment), pressProcessShort(p.operationType)]
                .filter(Boolean)
                .join(' · ') || 'press'}
            </Text>
          }
        />
      ))}
    </>
  );
}

// Выноски картинки шага — с провода на форму примитива. Зеркалит конвертацию mapTechCardToForm
// (schema.ts): координаты остаются decimal-строкой без округлений. Не импортируется оттуда — этот
// файл читает вербатимный снапшот, а не форму карточки.
const mediaAnnotations = (m: common_TechCardOperationMedia): AnnotationForm[] =>
  (m.annotations ?? []).map((a) => ({
    kind: annotationKindFromWire(a.kind),
    points: (a.points ?? []).map((pt) => ({
      x: decimalToInput(pt.x) || '0',
      y: decimalToInput(pt.y) || '0',
    })),
    text: a.text ?? '',
    labelX: decimalToInput(a.labelX) || '0',
    labelY: decimalToInput(a.labelY) || '0',
    color: annotationColorFromWire(a.color),
    pieceLineKey: a.pieceLineKey ?? '',
  }));

function SnapshotOperations({
  ops,
  pieces,
  mediaUrlById,
}: {
  ops: common_TechCardOperation[];
  /** Детали ИЗ ЭТОГО ЖЕ СНАПШОТА: имя должно быть тем, что было подписано, а не сегодняшним. */
  pieces: common_TechCardPiece[];
  /** Адреса операционных снимков — из resolvedOperationMedia ЭТОГО ЖЕ СНАПШОТА, не живой карточки. */
  mediaUrlById: Map<number, string>;
}) {
  if (ops.length === 0) return null;
  // Вход шага — деталь ИЛИ узел, и читать надо union: релиз, подписанный до Ф1, поля 46 не несёт
  // и говорит о деталях старой проекцией. Ключ, не совпавший ни с одной деталью снапшота, есть
  // ссылка на узел — так его и печатаем.
  const partsOf = (o: common_TechCardOperation): string => {
    // ИСТОЧНИК КЛЮЧЕЙ РЕШАЕТ, ЧТО ОЗНАЧАЕТ НЕНАЙДЕННЫЙ КЛЮЧ. В union'е (поле 46) ключ, не
    // совпавший с деталью, есть ссылка на узел. В старой проекции `piece_line_keys` узлов НЕ
    // БЫВАЕТ вовсе — их тогда не существовало, — и печатать там «▣ FRONT» значит утверждать про
    // подписанный документ то, чего в нём быть не могло.
    const legacy = !o.inputKeys?.length;
    const keys = legacy ? (o.pieceLineKeys ?? []) : (o.inputKeys ?? []);
    return keys
      .map((k) => {
        if (!k) return '';
        const piece = pieces.find((pc) => pc.lineKey === k);
        // Деталь без имени — всё ещё деталь: показываем её ключ, а не выдаём за узел.
        if (piece) return piece.name?.trim() || k;
        return legacy ? k : `▣ ${k}`;
      })
      .filter(Boolean)
      .join(' + ');
  };
  // Выход. Пусто на релизе, подписанном ДО Ф1, значит «карточка не была размечена» — и это
  // правда, а не пробел: узлов тогда не существовало вовсе. Поэтому никакого фолбэка.
  const outputOf = (o: common_TechCardOperation): string => {
    const key = (o.outputUnitKey ?? '').trim();
    if (!key) return '';
    const name = (o.outputUnitName ?? '').trim();
    return name ? `▣ ${key} · ${name}` : `▣ ${key}`;
  };
  return (
    <>
      <GroupLabel>operations (frozen) · {ops.length}</GroupLabel>
      {ops.map((o, i) => {
        // WHAT THE STEP IS, IN THE VOCABULARY IT WAS WRITTEN IN. The heading beside it is a verb
        // phrase; this line says what the step ran on. A step frozen SINCE 0306 says it with the
        // second axis (the machine / the press and its process); one frozen BEFORE says it with the
        // type itself, and that token renders through OPERATION_TYPE_LABELS — the total map, which
        // keeps its nine deprecated members forever precisely because a snapshot is immutable
        // protojson holding those very names. Through a picker-sized list every step of every
        // pre-0306 release would have read as nothing at all.
        const typeLabel =
          o.operationType && o.operationType !== 'TECH_CARD_OPERATION_TYPE_UNKNOWN'
            ? OPERATION_TYPE_LABELS[o.operationType]
            : '';
        const spec = isMachineStepType(o.operationType)
          ? // Снапшот несёт и машинку, и число ниток — значит и подписанный релиз может назвать
            // стежок конкретно. Вывод здесь — презентация записанного, а не правка записанного.
            machineTypeLabelWithStitch(o.machineType, o.threadCount)
          : isPressStepType(o.operationType)
            ? [pressEquipmentLabel(o.pressEquipment), typeLabel].filter(Boolean).join(' · ')
            : typeLabel;
        // Фотографии шага — те же правила, что у печати: адрес есть только для картинки в
        // словаре снапшота, у остальных ничего не показываем (не заглушка).
        const stepMedia = (o.media ?? [])
          .map((m) => ({ m, url: mediaUrlById.get(wireInt(m.mediaId)) }))
          .filter((x): x is { m: common_TechCardOperationMedia; url: string } => !!x.url);
        return (
          <Fragment key={i}>
            <Row
              label={
                <Text size='micro' component='span'>
                  {o.operationNumber != null ? `#${o.operationNumber} ` : ''}
                  {/* Composed, exactly as in the live editor — a frozen release must read the same
                      way the card did, and there is no stored step title to fall back on any
                      more. */}
                  {operationHeading({
                    operationType: o.operationType,
                    // A snapshot written before 0306 carries a legacy type that names its own
                    // machine and no machine_type at all; one written after carries MACHINE plus
                    // the machine. operationHeading reads both, so a frozen release keeps the verb
                    // it was signed with.
                    machineType: o.machineType,
                    zone: o.zone,
                    pieceNames: [],
                    note: o.note,
                  })}
                  {spec && (
                    <Text size='nano' variant='label' component='span'>
                      {' — '}
                      {spec}
                    </Text>
                  )}
                  {/* ЧТО ШАГ БРАЛ И ЧТО СОБРАЛ. До Ф6 архив не показывал ни того, ни другого:
                      подписанная сборка была в снапшоте, но на экране её не было — то есть
                      единственное место, где релиз можно перечитать, о ней молчало. */}
                  {(() => {
                    const parts = partsOf(o);
                    const out = outputOf(o);
                    if (!parts && !out) return null;
                    return (
                      <Text size='nano' variant='label' component='span' className='block'>
                        {parts || '—'}
                        {out ? ` → ${out}` : ''}
                      </Text>
                    );
                  })()}
                </Text>
              }
              value={
                o.smv?.value ? (
                  <Text size='micro' variant='label' component='span'>
                    {`${o.smv.value} min`}
                  </Text>
                ) : undefined
              }
            />
            {/* СНИМКИ ШАГА, ТЕМ ЖЕ ХОЛСТОМ, ЧТО И ПРИ РЕДАКТИРОВАНИИ, но только для чтения:
                архив — не место для правки замороженной карточки. */}
            {stepMedia.map(({ m, url }, mi) => (
              <div key={mi} className='py-1'>
                <AnnotationCanvas
                  src={url}
                  alt={m.caption || undefined}
                  annotations={mediaAnnotations(m)}
                />
                {m.caption?.trim() && (
                  <Text size='nano' variant='label' className='mt-1'>
                    {m.caption.trim()}
                  </Text>
                )}
              </div>
            ))}
          </Fragment>
        );
      })}
    </>
  );
}

// The right pane: one frozen snapshot, read as GroupLabel + Row sections. Keyed by release id from
// the caller so switching selection remounts (and re-queries) cleanly.
function ReleaseSnapshot({
  id,
  meta,
  techCardId,
  canReadCosting,
  active,
}: {
  id: number;
  meta?: common_TechCardReleaseMeta;
  techCardId: number;
  canReadCosting: boolean;
  /** Вкладка открыта: скрытая не должна тянуть снимки. */
  active: boolean;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['techCardRelease', id],
    queryFn: () => adminService.GetTechCardRelease({ id }),
    // Вкладка спрятана, но смонтирована: без гейта ответ приходил бы на невидимый экран и
    // создавал <img> для каждого снимка каждого шага — десятки полноразмерных загрузок.
    enabled: active,
  });
  // Colourways aren't part of the frozen snapshot (they're live products, not versioned by
  // release) — show the style's CURRENT colourway count instead of a historical one.
  // techCardId === styleId (R1); this reuses the same cached read as the rest of the
  // constructor, so it's effectively free once the tech-card page has loaded.
  const { data: techCard } = useTechCard(techCardId || undefined);
  const colorwayCount = techCard?.colorways?.length ?? 0;

  // The list row we were handed already carries the header; use it until the detail lands so the
  // pane never flashes empty on selection.
  const head = data?.release ?? meta;
  const snap = data?.snapshot?.techCard;
  const err = data?.snapshotError;

  // Адреса операционных снимков — ИЗ СНАПШОТА, а не с живой карточки: снапшот вербатимный, и
  // resolvedOperationMedia — часть read-модели, замороженная вместе со всем остальным (лежит на
  // data.snapshot, соседом snap = data.snapshot.techCard). Релиз, подписанный до этой фичи, поля
  // не несёт вовсе — словарь тогда просто пуст, и это не дефект, а честная граница снапшота.
  const mediaUrlById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of data?.snapshot?.resolvedOperationMedia ?? []) {
      const id = wireInt(r.media?.id);
      const url = r.media?.media?.fullSize?.mediaUrl || r.media?.media?.thumbnail?.mediaUrl;
      if (id && url) m.set(id, url);
    }
    return m;
  }, [data?.snapshot?.resolvedOperationMedia]);

  return (
    <div className='border border-borderColor p-2'>
      <GroupLabel className='mt-0'>
        Rev.{head?.releaseNumber ?? '—'} · frozen {formatTechCardDate(head?.createdAt)} ·{' '}
        {head?.releasedBy || '—'}
      </GroupLabel>

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : err ? (
        /* hero-v2 degradation: an old blob that no longer parses → say so, don't crash */
        <CalloutBox tone='warning'>
          <Text size='micro'>
            This snapshot is incompatible with the current schema and can’t be shown ({err}). The
            release metadata above is still valid.
          </Text>
        </CalloutBox>
      ) : snap ? (
        <>
          <Row label='style' value={`${snap.styleNumber || '—'} · ${snap.name || '—'}`} />
          <Row label='stage' value={stageLabel(snap.stage)} />
          <Row label='BOM' value={`${(snap.bomItems ?? []).length} articles`} />
          <Row label='operations' value={(snap.operations ?? []).length} />
          <Row label='sizes' value={(snap.sizeIds ?? []).length} />
          <Row label='colourways (current)' value={colorwayCount} />
          {/* 🔒 costing: the planned unit cost is only ever rendered with costing:read. */}
          {canReadCosting && (head?.unitCost?.value || snap.costing?.unitCost?.value) ? (
            <RowTotal
              label='unit cost'
              value={
                head?.unitCost?.value
                  ? `${decimalToInput(head.unitCost)} ${head.currency || ''}`.trim()
                  : `${decimalToInput(snap.costing?.unitCost)} ${
                      snap.costing?.currency || ''
                    }`.trim()
              }
            />
          ) : null}

          <SnapshotBom items={snap.bomItems ?? []} />
          <SnapshotConstruction c={snap.construction} />
          <SnapshotEquipment c={snap.construction} />
          <SnapshotOperations
            ops={snap.operations ?? []}
            pieces={snap.pieces ?? []}
            mediaUrlById={mediaUrlById}
          />

          <Text size='micro' variant='label' className='mt-2'>
            Colourways aren’t part of the frozen snapshot (they’re live products) — the count
            reflects the style’s current {colorwayCount} colourway
            {colorwayCount === 1 ? '' : 's'}.
          </Text>
        </>
      ) : (
        <Text size='micro' variant='label'>
          no snapshot payload
        </Text>
      )}
    </div>
  );
}

// Immutable release snapshots (task 11): the frozen factory spec captured each time the card is
// saved in `released`. Read-only history; unit_cost is 🔒 costing.
//
// Two panes rather than a list that swaps itself for a detail screen: you keep your place in the
// list while you read, so comparing Rev.2 against Rev.1 is two clicks and no back button. The
// selection lives in the URL (?rev=N) so a specific snapshot is linkable.
export function ReleasesField({
  techCardId,
  gate,
  active = true,
}: {
  techCardId: number;
  gate?: ReleaseGate;
  /** Вкладка открыта. Вкладки смонтированы все сразу — без флага архив грузил бы снимки всегда. */
  active?: boolean;
}) {
  const { canReadCosting } = usePermissions();
  const [params, setParams] = useSearchParams();
  const [blockersOpen, setBlockersOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['techCardReleases', techCardId],
    queryFn: () => adminService.ListTechCardReleases({ techCardId }),
    enabled: active,
  });

  const releases = data?.releases ?? [];
  const revParam = params.get('rev');
  // ?rev= carries the human release NUMBER (Rev.2), not the row id — that is what the UI shows and
  // what someone pasting a link means. An unknown/absent value falls back to the newest release
  // rather than an empty pane.
  const selected = releases.find((r) => String(r.releaseNumber ?? '') === revParam) ?? releases[0];

  const select = (rev?: number) =>
    setParams(
      (prev) => {
        const p = new URLSearchParams(prev);
        if (rev != null) p.set('rev', String(rev));
        else p.delete('rev');
        return p;
      },
      { replace: true },
    );

  const blockers = gate?.blockers ?? [];
  const onCreate = () => {
    if (!gate) return;
    if (blockers.length > 0) {
      setBlockersOpen(true);
      return;
    }
    gate.onRelease();
  };

  return (
    <div className='flex flex-col border border-borderColor bg-bgColor p-3'>
      <SectionHeader
        title='frozen snapshots the factory reads'
        question='— each release freezes the whole spec; the factory may be building from Rev.2 while you edit Rev.3'
        action={
          gate ? (
            <Button
              type='button'
              variant='main'
              size='sm'
              disabled={gate.saving}
              loading={gate.saving}
              onClick={onCreate}
            >
              create release
            </Button>
          ) : undefined
        }
      />
      {gate && (
        <Text size='micro' variant='label' className='mb-1.5'>
          freezes the current spec as the next immutable Rev.N snapshot the factory reads
          {blockers.length > 0
            ? ` — ${blockers.length} thing${blockers.length > 1 ? 's' : ''} still in the way`
            : ''}
        </Text>
      )}

      {isLoading ? (
        <Text size='micro' variant='label'>
          loading…
        </Text>
      ) : releases.length === 0 ? (
        <Text size='micro' variant='label'>
          no releases yet — a frozen Rev.N snapshot is created automatically when the card is saved
          as “released”.
        </Text>
      ) : (
        <div className='grid grid-cols-1 gap-2.5 sm:grid-cols-[140px_1fr]'>
          <div className='border border-borderColor'>
            {releases.map((r) => {
              const active = r.id != null && r.id === selected?.id;
              return (
                <button
                  key={r.id}
                  type='button'
                  aria-current={active ? 'true' : undefined}
                  onClick={() => select(r.releaseNumber)}
                  className={cn(
                    'flex w-full flex-col gap-0.5 border-b border-hairline px-2 py-1.5 text-left last:border-b-0',
                    active ? 'bg-textColor text-bgColor' : 'hover:bg-bgZebra',
                  )}
                >
                  <Text size='micro' component='span' className='font-bold uppercase'>
                    Rev.{r.releaseNumber ?? '—'}
                  </Text>
                  <Text
                    size='nano'
                    component='span'
                    className={active ? undefined : 'text-labelColor'}
                  >
                    {formatTechCardDate(r.createdAt)}
                  </Text>
                </button>
              );
            })}
          </div>

          {selected?.id != null ? (
            <ReleaseSnapshot
              key={selected.id}
              id={selected.id}
              meta={selected}
              techCardId={techCardId}
              canReadCosting={canReadCosting}
              active={active}
            />
          ) : (
            <Text size='micro' variant='label'>
              pick a release to read its frozen spec
            </Text>
          )}
        </div>
      )}

      {gate && (
        <ReleaseBlockersModal
          blockers={blockers}
          open={blockersOpen}
          onOpenChange={setBlockersOpen}
          onGoToTab={gate.onGoToTab}
        />
      )}
    </div>
  );
}
