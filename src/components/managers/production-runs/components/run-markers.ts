// МАРКЕРЫ ПАРТИИ НА СТРАНИЦЕ ПРОГОНА — чистые помощники, ни одного хука.
//
// Таблица под «step 3 · how to cut» строится из СОХРАНЁННЫХ раскладок прогона (run_markers) и
// отказов планировщика, поэтому верна и после перезагрузки, а не только после нажатия.
import type { common_ProductionRunLay, common_TechCardMarkerSummary } from 'api/proto-http/admin';
import { derivePlies } from 'components/managers/tech-card/components/nesting/batch-lay-proposal';
import type { BatchCell } from 'components/managers/tech-card/components/nesting/batch-marker-plan';
import { compositionOf, decNum } from 'components/managers/tech-card/components/nesting/marker-io';

/** Отказ или сбой по паре (материал, колорвей). colorwayId 0 = вся ткань, все колорвеи. */
export type RunMarkerIssue = { lineKey: string; colorwayId: number; word: string };

export type RunMarkerRow =
  | {
      kind: 'marker';
      key: string;
      material: string;
      colorway: string;
      widthCm: number | null;
      lengthCm: number | null;
      effPct: number | null;
      plies: number | null;
      sizes: { label: string; qty: number }[];
      source: 'auto' | 'manual' | 'draft';
    }
  | {
      kind: 'skipped' | 'failed';
      key: string;
      material: string;
      colorway: string;
      word: string;
    };

const num = (v: number | undefined | null) => Number(v ?? 0);
const finiteOrNull = (v: number) => (Number.isFinite(v) && v > 0 ? v : null);

/** Ручной маркер прогона на эту пару есть — автосборка его не трогает и пару не строит. */
export function isManualKept(
  runMarkers: readonly common_TechCardMarkerSummary[],
  colorwayId: number,
  lineKey: string,
): boolean {
  return runMarkers.some(
    (m) =>
      (m.source ?? '') === 'manual' &&
      num(m.colorwayId) === colorwayId &&
      (m.bomLineKey ?? '') === lineKey,
  );
}

/** Слои маркера: количество партии ÷ количество в составе, тем же derivePlies, что очередь. */
export function markerPlies(
  marker: common_TechCardMarkerSummary,
  cells: readonly BatchCell[],
): number | null {
  const cw = num(marker.colorwayId);
  const rows = compositionOf(marker).map((e) => ({
    sizeId: e.sizeId,
    sizeLabel: String(e.sizeId),
    tokens: [],
    units: e.quantity,
    batchQty: cells
      .filter((c) => c.colorwayId === cw && c.sizeId === e.sizeId)
      .reduce((n, c) => n + c.qty, 0),
  }));
  const d = derivePlies(rows);
  return d.ok ? d.plies : null;
}

/** Причина отказа планировщика → одно-два слова для строки SKIPPED. */
export function refusalWord(reason: string): string {
  const r = reason.toLowerCase();
  if (r.includes('no dxf')) return 'no pattern';
  if (r.includes('width is unknown')) return 'no width';
  if (r.includes("didn't download")) return 'no download';
  if (/owns \d+ bom lines/.test(r)) return 'many lines';
  if (r.includes('no closed piece contour')) return 'no contours';
  if (r.includes('no pieces of') || r.includes('no size grading')) return 'no sizes';
  if (r.includes('server ceiling') || r.includes('bigger than the server')) return 'too big';
  if (r.includes('already been captured')) return 'duplicates';
  return 'other';
}

/** Ткань глазами статической проверки — то, что известно без разбора выкроек. */
export type StaticScope = {
  lineKeys: string[];
  sheetCount: number;
  /** Ширина слота (артикул строки BOM), см; NaN = не заполнена. */
  slotCutCm: number;
};

/**
 * Отказы, видимые БЕЗ разбора DXF: нет выкроек, несколько строк BOM, нет ширины рулона. Ими
 * таблица говорит SKIPPED и после перезагрузки страницы.
 */
export function staticRunRefusals(args: {
  scopes: readonly StaticScope[];
  colorwayIds: readonly number[];
  pinCutCm: (colorwayId: number, lineKey: string) => number | undefined;
}): RunMarkerIssue[] {
  const out: RunMarkerIssue[] = [];
  for (const s of args.scopes) {
    if (s.lineKeys.length === 0) continue;
    if (s.sheetCount === 0) {
      for (const lineKey of s.lineKeys) out.push({ lineKey, colorwayId: 0, word: 'no pattern' });
      continue;
    }
    if (s.lineKeys.length > 1) {
      for (const lineKey of s.lineKeys) out.push({ lineKey, colorwayId: 0, word: 'many lines' });
      continue;
    }
    const lineKey = s.lineKeys[0];
    for (const cw of args.colorwayIds) {
      const pin = args.pinCutCm(cw, lineKey);
      const w = pin !== undefined ? pin : s.slotCutCm;
      if (!Number.isFinite(w) || w <= 0) out.push({ lineKey, colorwayId: cw, word: 'no width' });
    }
  }
  return out;
}

const issueFor = (list: readonly RunMarkerIssue[], lineKey: string, colorwayId: number) =>
  list.find((i) => i.lineKey === lineKey && (i.colorwayId === colorwayId || i.colorwayId === 0));

/**
 * Строки таблицы: сохранённые маркеры прогона, а для пар без маркера — сбой этой сессии, отказ
 * этой сессии либо статический отказ (в таком порядке). Пара без маркера и без причины строки не
 * получает: её просто ещё не строили.
 */
export function buildRunMarkerRows(args: {
  lines: readonly { lineKey: string; name: string }[];
  colorwayIds: readonly number[];
  colorwayLabel: (id: number) => string;
  runMarkers: readonly common_TechCardMarkerSummary[];
  cells: readonly BatchCell[];
  sizeLabel: (sizeId: number) => string;
  staticRefusals: readonly RunMarkerIssue[];
  sessionRefusals: readonly RunMarkerIssue[];
  failures: readonly RunMarkerIssue[];
}): RunMarkerRow[] {
  const lineIndex = new Map(args.lines.map((l, i) => [l.lineKey, i]));
  const cwIndex = new Map(args.colorwayIds.map((id, i) => [id, i]));
  const showColorway = args.colorwayIds.length > 1;
  const material = (lineKey: string, fallback?: string) =>
    args.lines.find((l) => l.lineKey === lineKey)?.name.trim() || fallback?.trim() || 'unnamed';
  const colorway = (id: number) => (showColorway && id > 0 ? args.colorwayLabel(id) : '');

  const rows: { line: number; cw: number; row: RunMarkerRow }[] = [];
  const hasMarker = new Set<string>();
  for (const m of args.runMarkers) {
    const lineKey = m.bomLineKey ?? '';
    const cw = num(m.colorwayId);
    hasMarker.add(`${lineKey}|${cw}`);
    rows.push({
      line: lineIndex.get(lineKey) ?? 1e6,
      cw: cwIndex.get(cw) ?? 1e6,
      row: {
        kind: 'marker',
        key: `m${num(m.id)}`,
        material: material(lineKey, m.bomItemName),
        colorway: colorway(cw),
        widthCm: finiteOrNull(decNum(m.fabricWidthCm)),
        lengthCm: finiteOrNull(decNum(m.usedLengthCm)),
        effPct: finiteOrNull(decNum(m.efficiencyPct)),
        plies: markerPlies(m, args.cells),
        sizes: compositionOf(m).map((e) => ({ label: args.sizeLabel(e.sizeId), qty: e.quantity })),
        source: m.isDraft ? 'draft' : m.source === 'manual' ? 'manual' : 'auto',
      },
    });
  }

  args.lines.forEach((l, li) => {
    args.colorwayIds.forEach((cw, ci) => {
      if (hasMarker.has(`${l.lineKey}|${cw}`)) return;
      const failed = issueFor(args.failures, l.lineKey, cw);
      const refused =
        issueFor(args.sessionRefusals, l.lineKey, cw) ??
        issueFor(args.staticRefusals, l.lineKey, cw);
      const issue = failed ?? refused;
      if (!issue) return;
      rows.push({
        line: li,
        cw: ci,
        row: {
          kind: failed ? 'failed' : 'skipped',
          key: `i${l.lineKey}|${cw}`,
          material: material(l.lineKey),
          colorway: colorway(cw),
          word: issue.word,
        },
      });
    });
  });

  return rows.sort((a, b) => a.line - b.line || a.cw - b.cw).map((r) => r.row);
}

/** Пары (материал, колорвей), которых ещё никто не построил и не отказал. */
export function pendingPairs(args: {
  lines: readonly { lineKey: string }[];
  colorwayIds: readonly number[];
  runMarkers: readonly common_TechCardMarkerSummary[];
  refusals: readonly RunMarkerIssue[];
}): number {
  let n = 0;
  for (const l of args.lines) {
    for (const cw of args.colorwayIds) {
      const built = args.runMarkers.some(
        (m) => (m.bomLineKey ?? '') === l.lineKey && num(m.colorwayId) === cw,
      );
      if (!built && !issueFor(args.refusals, l.lineKey, cw)) n += 1;
    }
  }
  return n;
}

export type LayCandidate = {
  colorwayId: number;
  bomLineKey: string;
  markerId: number;
  plies: number;
};

/**
 * Настилы, которые «build lays» создаст: пара (колорвей, слот) с готовым (не черновым) маркером
 * прогона, без настила, со слоями, выведенными без остатка. Ручной маркер пары предпочтительнее,
 * дальше — самый свежий (наибольший id).
 */
export function layCandidates(args: {
  runMarkers: readonly common_TechCardMarkerSummary[];
  lays: readonly common_ProductionRunLay[];
  cells: readonly BatchCell[];
}): LayCandidate[] {
  const laid = new Set(args.lays.map((l) => `${num(l.colorwayId)}|${l.bomLineKey ?? ''}`));
  const best = new Map<string, common_TechCardMarkerSummary>();
  for (const m of args.runMarkers) {
    const cw = num(m.colorwayId);
    const lineKey = m.bomLineKey ?? '';
    if (cw <= 0 || !lineKey || m.isDraft || num(m.id) <= 0) continue;
    const k = `${cw}|${lineKey}`;
    if (laid.has(k)) continue;
    const prev = best.get(k);
    const rank = (x: common_TechCardMarkerSummary) =>
      (x.source === 'manual' ? 1e12 : 0) + num(x.id);
    if (!prev || rank(m) > rank(prev)) best.set(k, m);
  }
  const out: LayCandidate[] = [];
  for (const m of best.values()) {
    const plies = markerPlies(m, args.cells);
    if (plies == null) continue;
    out.push({
      colorwayId: num(m.colorwayId),
      bomLineKey: m.bomLineKey ?? '',
      markerId: num(m.id),
      plies,
    });
  }
  return out;
}
