import type { common_TechCard, common_TechCardBomItem } from 'api/proto-http/admin';
import { fmtDelta } from './derive-assembly';
import type { MeasurementRow } from './derive-measurements';
import { bomRefs, clean, decimalNumber, enumLabel, shortDate, type BomRef } from './derive-shared';
import type { Gap, GapSink } from './gaps';
import { englishT, own, type PdfT } from './i18n';

export type QcCheck = {
  key: string;
  what: string;
  op?: string;
  note?: string;
  missing?: boolean;
  gap?: Gap;
};

export type SignoffRow = {
  key: string;
  role: string;
  state: string;
  signedBy?: string;
  signedAt?: string;
  note?: string;
  stale: boolean;
};

export type RevisionRow = {
  key: string;
  date: string;
  action: string;
  section?: string;
  author?: string;
  note?: string;
};

export type QcSignoffModel = {
  checks: QcCheck[];
  signoffs: SignoffRow[];
  revisions: RevisionRow[];
  sampleSize: string;
  missing: string[];
};

/** A join the assembly stops on: its op and the signed length difference, mm. */
export type QcSeamDelta = { op: number; delta: number };

type QcInput = {
  techCard: common_TechCard;
  measurementRows?: readonly MeasurementRow[];
  sizeNames?: Readonly<Record<number, string>>;
  /** From the assembly model, so the checklist and the assembly page name the same joins. */
  seamDeltas?: readonly QcSeamDelta[];
  /** The label placement the labels page prints; empty = missing. */
  labelPlacement?: string;
  t?: PdfT;
};

const BUTTON = 'TECH_CARD_BOM_KIND_BUTTON';
const THREAD = 'TECH_CARD_BOM_SECTION_THREAD';
const TRIMS = new Set([
  'TECH_CARD_BOM_SECTION_HARDWARE',
  'TECH_CARD_BOM_SECTION_TRIM',
  'TECH_CARD_BOM_SECTION_DECORATION',
]);

const opList = (ops: Iterable<number>): string =>
  Array.from(new Set(ops))
    .sort((a, b) => a - b)
    .join(' · ');

const itemName = (item: common_TechCardBomItem, t: PdfT): string => {
  const authored = clean(item.name);
  if (authored) return own(authored);
  const generated = enumLabel(item.kind) || enumLabel(item.section);
  return generated ? t('common.generated', { text: generated }) : t('common.material');
};

/** «button 11 mm» → «11 mm» next to the word «buttons». */
const sizeOf = (item: common_TechCardBomItem, t: PdfT): string =>
  itemName(item, t).replace(/^buttons?\s+/i, '');

export function deriveQcSignoffPage(input: QcInput, sink?: GapSink): QcSignoffModel {
  const { techCard } = input;
  const tc = techCard.techCard;
  const t = input.t ?? englishT;
  const checks: QcCheck[] = [];
  const add = (
    code: string,
    label: string,
    field: string,
    refs: string[] = [],
    op?: number,
    bomLine?: string,
  ): Gap => {
    const gap: Gap = {
      code,
      refs: [
        ...refs,
        op ? `op:${op}` : '',
        bomLine ? `bom:${bomLine}` : '',
        `field:${field}`,
      ].filter(Boolean),
      label,
      section: '09',
      target: { tab: 'signoff', op, bomLine, field },
    };
    return sink?.add(gap) ?? gap;
  };
  const ops = (tc?.operations ?? []).filter((op) => op.operationNumber);
  const opsUsing = (ref: BomRef) =>
    ops
      .filter((op) => (op.bomLineKeys ?? []).some((key) => clean(key) === ref.key))
      .map((op) => op.operationNumber ?? 0);
  const opsOf = (machine: string, work: string) =>
    ops
      .filter((op) => op.machineType === machine || clean(op.work) === work)
      .map((op) => op.operationNumber ?? 0);

  for (const seam of input.seamDeltas ?? []) {
    checks.push({
      key: `seam-${seam.op}`,
      what: t('qc.seamResolved'),
      op: String(seam.op),
      note: `Δ ${fmtDelta(seam.delta)} mm`,
    });
  }
  for (const [index, issue] of (tc?.issues ?? []).entries()) {
    if (issue.status !== 'TECH_CARD_ISSUE_STATUS_OPEN') continue;
    const description = own(issue.description?.trim());
    checks.push({
      key: `issue-${index}`,
      what: description || t('qc.openIssue'),
      op: issue.operationNumber ? String(issue.operationNumber) : undefined,
      note: t('common.generated', {
        text: enumLabel(issue.severity, 'TECH_CARD_ISSUE_SEVERITY_'),
      }),
      missing: true,
      gap: add(
        'pdf_open_issue',
        description || t('gaps.openIssue'),
        'issue',
        [`field:issue ${index + 1}`],
        issue.operationNumber,
      ),
    });
  }

  const holes = opsOf('TECH_CARD_MACHINE_TYPE_BUTTONHOLE', 'buttonhole');
  if (holes.length)
    checks.push({ key: 'buttonholes', what: t('qc.buttonholes'), op: opList(holes) });

  // a trim no operation consumes is not sewn on: red, like every other missing fact
  const refs = bomRefs(techCard);
  const unlinked: BomRef[] = [];
  const buttons = refs.filter((ref) => ref.item.kind === BUTTON);
  if (buttons.length) {
    const qty = buttons.map((ref) => decimalNumber(ref.item.qtyPerGarment) ?? 0);
    const total = qty.reduce((sum, value) => sum + value, 0);
    checks.push({
      key: 'buttons',
      what: total ? `${t('qc.buttons')} · ${total}` : t('qc.buttons'),
      op: opList([
        ...opsOf('TECH_CARD_MACHINE_TYPE_BUTTON_ATTACH', 'button_attach'),
        ...buttons.flatMap(opsUsing),
      ]),
      note: buttons
        .map((ref, i) => (qty[i] ? `${qty[i]} × ${sizeOf(ref.item, t)}` : sizeOf(ref.item, t)))
        .join(' · '),
    });
    unlinked.push(...buttons.filter((ref) => opsUsing(ref).length === 0));
  }
  for (const ref of refs.filter((r) => r.item.section === THREAD)) {
    const used = opsUsing(ref);
    if (!used.length) {
      unlinked.push(ref);
      continue;
    }
    checks.push({
      key: `thread-${ref.key}`,
      what: t('qc.thread', { name: own(clean(ref.item.color) || itemName(ref.item, t)) }),
      op: opList(used),
      note: t('common.operationsShort', { count: used.length }),
    });
  }
  for (const ref of refs.filter((r) => TRIMS.has(r.item.section ?? '') && r.item.kind !== BUTTON)) {
    const used = opsUsing(ref);
    if (!used.length) {
      unlinked.push(ref);
      continue;
    }
    const qty = decimalNumber(ref.item.qtyPerGarment);
    checks.push({
      key: `trim-${ref.key}`,
      what: qty ? `${itemName(ref.item, t)} · ${qty}` : itemName(ref.item, t),
      op: opList(used),
    });
  }
  for (const ref of unlinked) {
    const qty = decimalNumber(ref.item.qtyPerGarment);
    checks.push({
      key: `unlinked-${ref.key}`,
      what: itemName(ref.item, t),
      note: qty ? t('qc.piecesNoOperation', { count: qty }) : t('qc.noOperation'),
      missing: true,
      gap: add(
        'pdf_trim_operation_missing',
        itemName(ref.item, t),
        'operation',
        [],
        undefined,
        ref.key,
      ),
    });
  }

  const placement = clean(input.labelPlacement);
  checks.push(
    placement
      ? { key: 'label', what: t('qc.label', { placement: own(placement) }) }
      : {
          key: 'label',
          what: t('qc.labelPlacement'),
          missing: true,
          gap: add('pdf_label_placement_missing', t('qc.labelPlacement'), 'label placement'),
        },
  );

  const rows = input.measurementRows ?? [];
  const missingMeasurements = rows.filter((row) => row.missing).length;
  if (!rows.length || missingMeasurements) {
    checks.push({
      key: 'measurements',
      what: t('common.measurements'),
      note: rows.length ? t('qc.missingCount', { count: missingMeasurements }) : undefined,
      missing: true,
      gap: add('pdf_measurements_missing', t('gaps.measurements'), 'measurements'),
    });
  } else {
    checks.push({
      key: 'measurements',
      what: t('measurements.title'),
      note: t('common.points', { count: rows.length }),
    });
  }

  if (!(tc?.patterns ?? []).some((pattern) => pattern.url?.trim())) {
    checks.push({
      key: 'patterns',
      what: t('common.pattern'),
      missing: true,
      gap: add('pdf_patterns_missing', t('gaps.pattern'), 'patterns'),
    });
  }
  if ((techCard.markers ?? []).length === 0) {
    checks.push({
      key: 'markers',
      what: t('common.marker'),
      missing: true,
      gap: add('pdf_marker_missing', t('gaps.marker'), 'marker'),
    });
  }
  if ((techCard.resolvedTechnicalMedia ?? []).length === 0) {
    checks.push({
      key: 'technical',
      what: t('common.drawing'),
      missing: true,
      gap: add('pdf_drawing_missing', t('gaps.drawing'), 'drawing'),
    });
  }

  const digestBySection = new Map(
    (techCard.sectionDigests ?? []).map((digest) => [digest.section, digest.digest?.trim() || '']),
  );
  const signoffs: SignoffRow[] = (tc?.signoffs ?? []).map((signoff, index) => {
    const live = digestBySection.get(signoff.section);
    const signed = signoff.signedDigest?.trim();
    const role = enumLabel(signoff.section, 'TECH_CARD_SIGNOFF_SECTION_');
    const state = enumLabel(signoff.state, 'TECH_CARD_SIGNOFF_STATE_');
    return {
      key: `${signoff.section || 'signoff'}-${index}`,
      role:
        String(signoff.section) === 'TECH_CARD_SIGNOFF_SECTION_TECHNICAL'
          ? t('qc.technical')
          : role
            ? t('common.generated', { text: role })
            : t('qc.signoff'),
      state:
        signoff.state === 'TECH_CARD_SIGNOFF_STATE_APPROVED'
          ? t('qc.approved')
          : signoff.state === 'TECH_CARD_SIGNOFF_STATE_REJECTED'
            ? t('qc.rejected')
            : state
              ? t('common.generated', { text: state })
              : t('qc.pending'),
      signedBy: signoff.signedBy?.trim() || undefined,
      signedAt: shortDate(signoff.signedAt) || undefined,
      note: signoff.note?.trim() || undefined,
      stale: !!signed && !!live && signed !== live,
    };
  });

  const revisions: RevisionRow[] = [...(techCard.revisions ?? [])]
    .reverse()
    .map((revision, index) => ({
      key: `${revision.createdAt || 'revision'}-${index}`,
      date: shortDate(revision.createdAt),
      action: revision.action
        ? t('common.generated', { text: revision.action.replaceAll('_', ' ') })
        : t('qc.updated'),
      section: revision.section
        ? t('common.generated', { text: revision.section.replaceAll('_', ' ') })
        : undefined,
      author: revision.author?.trim() || undefined,
      note: revision.changeNote?.trim() || undefined,
    }));

  const sampleSizeId = tc?.baseSampleSizeId ?? 0;
  return {
    checks,
    signoffs,
    revisions,
    sampleSize: sampleSizeId ? input.sizeNames?.[sampleSizeId] || `#${sampleSizeId}` : '',
    missing: checks.filter((check) => check.missing).map((check) => check.what),
  };
}
