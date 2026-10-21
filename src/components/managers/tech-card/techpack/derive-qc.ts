import type { common_TechCard, common_TechCardSeamSide } from 'api/proto-http/admin';
import type { MeasurementRow } from './derive-measurements';
import { enumLabel, shortDate } from './derive-shared';

export type QcCheck = {
  key: string;
  what: string;
  op?: string;
  note?: string;
  missing?: boolean;
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

type QcInput = {
  techCard: common_TechCard;
  measurementRows?: readonly MeasurementRow[];
  sizeNames?: Readonly<Record<number, string>>;
};

const seamLength = (side: common_TechCardSeamSide | undefined): number =>
  (side?.parts ?? []).reduce((sum, part) => sum + (part.lenMm ?? 0), 0);

export function deriveQcSignoffPage(input: QcInput): QcSignoffModel {
  const { techCard } = input;
  const tc = techCard.techCard;
  const checks: QcCheck[] = [];

  for (const seam of techCard.seams ?? []) {
    const a = seamLength(seam.sideA);
    const b = seamLength(seam.sideB);
    if (!a || !b) continue;
    const delta = Math.abs(a - b);
    if (delta <= 5) continue;
    checks.push({
      key: seam.seamKey || `seam-${checks.length}`,
      what: 'seam delta',
      note: `Δ ${delta.toFixed(1)} mm`,
      missing: true,
    });
  }
  for (const [index, issue] of (tc?.issues ?? []).entries()) {
    if (issue.status !== 'TECH_CARD_ISSUE_STATUS_OPEN') continue;
    checks.push({
      key: `issue-${index}`,
      what: issue.description?.trim() || 'open issue',
      op: issue.operationNumber ? String(issue.operationNumber) : undefined,
      note: enumLabel(issue.severity, 'TECH_CARD_ISSUE_SEVERITY_'),
      missing: true,
    });
  }

  const missingMeasurements = (input.measurementRows ?? []).filter((row) => row.missing).length;
  if (missingMeasurements > 0) {
    checks.push({
      key: 'measurements',
      what: 'measurements',
      note: `${missingMeasurements} missing`,
      missing: true,
    });
  } else if ((input.measurementRows ?? []).length > 0) {
    checks.push({
      key: 'measurements',
      what: 'measurements',
      note: `${input.measurementRows!.length} points`,
    });
  }

  if (!(tc?.patterns ?? []).some((pattern) => pattern.url?.trim())) {
    checks.push({ key: 'patterns', what: 'pattern', missing: true });
  }
  if ((techCard.markers ?? []).length === 0) {
    checks.push({ key: 'markers', what: 'marker', missing: true });
  }
  if ((techCard.resolvedTechnicalMedia ?? []).length === 0) {
    checks.push({ key: 'technical', what: 'drawing', missing: true });
  }

  const digestBySection = new Map(
    (techCard.sectionDigests ?? []).map((digest) => [digest.section, digest.digest?.trim() || '']),
  );
  const signoffs: SignoffRow[] = (tc?.signoffs ?? []).map((signoff, index) => {
    const live = digestBySection.get(signoff.section);
    const signed = signoff.signedDigest?.trim();
    return {
      key: `${signoff.section || 'signoff'}-${index}`,
      role: enumLabel(signoff.section, 'TECH_CARD_SIGNOFF_SECTION_') || 'sign-off',
      state: enumLabel(signoff.state, 'TECH_CARD_SIGNOFF_STATE_') || 'pending',
      signedBy: signoff.signedBy?.trim() || undefined,
      signedAt: shortDate(signoff.signedAt) || undefined,
      note: signoff.note?.trim() || undefined,
      stale: !!signed && !!live && signed !== live,
    };
  });
  if (signoffs.length === 0) {
    checks.push({ key: 'signoff', what: 'sign-off', missing: true });
  }

  const revisions: RevisionRow[] = [...(techCard.revisions ?? [])]
    .reverse()
    .map((revision, index) => ({
      key: `${revision.createdAt || 'revision'}-${index}`,
      date: shortDate(revision.createdAt),
      action: (revision.action || 'updated').replaceAll('_', ' '),
      section: revision.section?.replaceAll('_', ' ') || undefined,
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
