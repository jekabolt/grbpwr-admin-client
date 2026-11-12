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

/** Один маркер в строке таблицы: целый материал либо его часть A, B, … при разбивке по столу. */
export type RunMarkerPart = {
  key: string;
  widthCm: number | null;
  lengthCm: number | null;
  effPct: number | null;
  plies: number | null;
  sizes: { label: string; qty: number }[];
  source: 'auto' | 'manual' | 'draft';
  /** Длиннее выбранного стола — длина красным. */
  over: boolean;
};

export type RunMarkerRow =
  | ({
      kind: 'marker';
      material: string;
      colorway: string;
    } & RunMarkerPart)
  | {
      /** Материал разбит по столу: строка-группа и маркеры A, B, … под ней. */
      kind: 'split';
      key: string;
      material: string;
      colorway: string;
      widthCm: number | null;
      parts: (RunMarkerPart & { letter: string })[];
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
  /** Порядок градации размера (XS…XL); без него — по id. */
  sizeOrderOf?: (sizeId: number) => number;
  /** Длина выбранного стола, см: маркер длиннее — красным. */
  tableCm?: number;
}): RunMarkerRow[] {
  const lineIndex = new Map(args.lines.map((l, i) => [l.lineKey, i]));
  const cwIndex = new Map(args.colorwayIds.map((id, i) => [id, i]));
  const showColorway = args.colorwayIds.length > 1;
  const order = args.sizeOrderOf ?? ((id: number) => id);
  const material = (lineKey: string, fallback?: string) =>
    args.lines.find((l) => l.lineKey === lineKey)?.name.trim() || fallback?.trim() || 'unnamed';
  const colorway = (id: number) => (showColorway && id > 0 ? args.colorwayLabel(id) : '');

  const rows: { line: number; cw: number; row: RunMarkerRow }[] = [];
  const hasMarker = new Set<string>();
  const byPair = new Map<string, common_TechCardMarkerSummary[]>();
  for (const m of args.runMarkers) {
    const k = `${m.bomLineKey ?? ''}|${num(m.colorwayId)}`;
    hasMarker.add(k);
    byPair.set(k, [...(byPair.get(k) ?? []), m]);
  }
  const firstOrder = (m: common_TechCardMarkerSummary) =>
    Math.min(...compositionOf(m).map((e) => order(e.sizeId)), 1e9);
  const partOf = (m: common_TechCardMarkerSummary): RunMarkerPart => {
    const lengthCm = finiteOrNull(decNum(m.usedLengthCm));
    return {
      key: `m${num(m.id)}`,
      widthCm: finiteOrNull(decNum(m.fabricWidthCm)),
      lengthCm,
      effPct: finiteOrNull(decNum(m.efficiencyPct)),
      plies: markerPlies(m, args.cells),
      sizes: compositionOf(m)
        .sort((a, b) => order(a.sizeId) - order(b.sizeId))
        .map((e) => ({ label: args.sizeLabel(e.sizeId), qty: e.quantity })),
      source: m.isDraft ? 'draft' : m.source === 'manual' ? 'manual' : 'auto',
      over: lengthCm != null && args.tableCm != null && lengthCm > args.tableCm,
    };
  };
  for (const ms of byPair.values()) {
    const lineKey = ms[0].bomLineKey ?? '';
    const cw = num(ms[0].colorwayId);
    const pos = { line: lineIndex.get(lineKey) ?? 1e6, cw: cwIndex.get(cw) ?? 1e6 };
    const head = { material: material(lineKey, ms[0].bomItemName), colorway: colorway(cw) };
    if (ms.length === 1) {
      rows.push({ ...pos, row: { kind: 'marker', ...head, ...partOf(ms[0]) } });
      continue;
    }
    const parts = [...ms]
      .sort((a, b) => firstOrder(a) - firstOrder(b) || num(a.id) - num(b.id))
      .map((m, i) => ({ ...partOf(m), letter: markerLetter(i) }));
    rows.push({
      ...pos,
      row: {
        kind: 'split',
        key: `g${lineKey}|${cw}`,
        ...head,
        widthCm: parts[0].widthCm,
        parts,
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
 * Настилы, которые «build lays» создаст: пара (колорвей, слот) без настила, с готовыми (не
 * черновыми) маркерами прогона и слоями, выведенными без остатка. Ручной маркер пары — один и
 * предпочтительнее. Иначе — авто-маркеры пары, начиная с самого свежего, без пересечения по
 * размерам: при разбивке по столу A и B — отдельные настилы, а уцелевший старый маркер на те же
 * размеры второй раз не настилается.
 */
export function layCandidates(args: {
  runMarkers: readonly common_TechCardMarkerSummary[];
  lays: readonly common_ProductionRunLay[];
  cells: readonly BatchCell[];
}): LayCandidate[] {
  const laid = new Set(args.lays.map((l) => `${num(l.colorwayId)}|${l.bomLineKey ?? ''}`));
  const byPair = new Map<string, common_TechCardMarkerSummary[]>();
  for (const m of args.runMarkers) {
    const cw = num(m.colorwayId);
    const lineKey = m.bomLineKey ?? '';
    if (cw <= 0 || !lineKey || m.isDraft || num(m.id) <= 0) continue;
    const k = `${cw}|${lineKey}`;
    if (laid.has(k)) continue;
    byPair.set(k, [...(byPair.get(k) ?? []), m]);
  }
  const out: LayCandidate[] = [];
  for (const ms of byPair.values()) {
    const newest = [...ms].sort((a, b) => num(b.id) - num(a.id));
    const manual = newest.find((m) => m.source === 'manual');
    let picked: common_TechCardMarkerSummary[];
    if (manual) picked = [manual];
    else {
      picked = [];
      const used = new Set<number>();
      for (const m of newest) {
        const sizes = compositionOf(m).map((e) => e.sizeId);
        if (sizes.length === 0 || sizes.some((id) => used.has(id))) continue;
        sizes.forEach((id) => used.add(id));
        picked.push(m);
      }
      picked.sort((a, b) => num(a.id) - num(b.id));
    }
    for (const m of picked) {
      const plies = markerPlies(m, args.cells);
      if (plies == null) continue;
      out.push({
        colorwayId: num(m.colorwayId),
        bomLineKey: m.bomLineKey ?? '',
        markerId: num(m.id),
        plies,
      });
    }
  }
  return out;
}

/** «marker A», «marker B», … — буква части по порядку размеров. */
export function markerLetter(i: number): string {
  return i < 26 ? String.fromCharCode(65 + i) : `${i + 1}`;
}

// ═══ СТОЛ ════════════════════════════════════════════════════════════════════════════════════

export const TABLE_METERS = [4, 6, 8] as const;
export type TableMeters = (typeof TABLE_METERS)[number];
export const DEFAULT_TABLE_M: TableMeters = 6;

/** Выбор стола из localStorage: только 4 | 6 | 8, иначе 6 м. */
export function parseTablePick(raw: string | null | undefined): TableMeters {
  const n = Number(raw);
  return (TABLE_METERS as readonly number[]).includes(n) ? (n as TableMeters) : DEFAULT_TABLE_M;
}

export const tablePickKey = (runId: number) => `run-markers-table:${runId}`;

export function readTablePick(runId: number): TableMeters {
  try {
    return parseTablePick(window.localStorage.getItem(tablePickKey(runId)));
  } catch {
    return DEFAULT_TABLE_M;
  }
}

export function writeTablePick(runId: number, m: TableMeters): void {
  try {
    window.localStorage.setItem(tablePickKey(runId), String(m));
  } catch {
    // приватное окно / запрет хранилища — выбор живёт до перезагрузки
  }
}

/**
 * Доля каждого размера в длине ОДНОГО маркера: площадь его деталей × экземпляры, а
 * неградуированные детали (без размера) делятся по числу изделий размера. Нет площадей — по
 * изделиям.
 */
export function sizeLengthEstimates(args: {
  sizes: readonly { sizeId: number; units: number }[];
  pieces: readonly { sizeId: number; areaCm2: number; quantity: number }[];
  lengthCm: number;
}): { sizeId: number; estCm: number }[] {
  const unitsTotal = args.sizes.reduce((n, s) => n + s.units, 0) || 1;
  const sized = new Map<number, number>();
  let unsized = 0;
  for (const p of args.pieces) {
    const a = Math.max(0, p.areaCm2) * Math.max(0, p.quantity);
    if (p.sizeId > 0 && args.sizes.some((s) => s.sizeId === p.sizeId))
      sized.set(p.sizeId, (sized.get(p.sizeId) ?? 0) + a);
    else unsized += a;
  }
  let weights = args.sizes.map(
    (s) => (sized.get(s.sizeId) ?? 0) + (unsized * s.units) / unitsTotal,
  );
  let sum = weights.reduce((n, w) => n + w, 0);
  if (!(sum > 0)) {
    weights = args.sizes.map((s) => s.units);
    sum = unitsTotal;
  }
  return args.sizes.map((s, i) => ({
    sizeId: s.sizeId,
    estCm: (args.lengthCm * weights[i]) / sum,
  }));
}

/** Разбить ряд на k смежных групп с наименьшей самой длинной группой. */
function balancedPartition(est: readonly number[], k: number): number[][] {
  const n = est.length;
  const pre = [0];
  for (const e of est) pre.push(pre[pre.length - 1] + e);
  const sum = (i: number, j: number) => pre[j] - pre[i];
  // best[g][j] — минимум «самой длинной» для первых j размеров в g группах.
  const best = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(Infinity));
  const cut = Array.from({ length: k + 1 }, () => new Array<number>(n + 1).fill(0));
  best[0][0] = 0;
  for (let g = 1; g <= k; g++) {
    for (let j = g; j <= n; j++) {
      for (let i = g - 1; i < j; i++) {
        const v = Math.max(best[g - 1][i], sum(i, j));
        if (v < best[g][j]) {
          best[g][j] = v;
          cut[g][j] = i;
        }
      }
    }
  }
  const out: number[][] = [];
  let j = n;
  for (let g = k; g >= 1; g--) {
    const i = cut[g][j];
    out.unshift(Array.from({ length: j - i }, (_, x) => i + x));
    j = i;
  }
  return out;
}

/**
 * Размеры (в порядке градации) → группы маркеров A, B, … под стол. k = ceil(длина / стол);
 * размеры не рвутся, соседние держатся вместе, группы ровняются по оценке длины. Не влезло в k —
 * k + 1, и так до маркера на размер; группа длиннее стола и тогда остаётся (покажется красным).
 */
export function splitSizesByTable(
  est: readonly { sizeId: number; estCm: number }[],
  tableCm: number,
): number[][] {
  const n = est.length;
  const total = est.reduce((s, e) => s + e.estCm, 0);
  if (n <= 1 || !(tableCm > 0) || total <= tableCm) return [est.map((e) => e.sizeId)];
  const lens = est.map((e) => e.estCm);
  for (let k = Math.min(n, Math.ceil(total / tableCm)); k <= n; k++) {
    const groups = balancedPartition(lens, k);
    const longest = Math.max(...groups.map((g) => g.reduce((s, i) => s + lens[i], 0)));
    if (longest <= tableCm || k === n) return groups.map((g) => g.map((i) => est[i].sizeId));
  }
  return est.map((e) => [e.sizeId]);
}

/** Имя, которое даёт эта очередь: «1XS+2S · колорвей · ткань» (состав с числом впереди). */
const QUEUE_NAME = /^\d+[^\s+·]+(?:\+\d+[^\s+·]+)* · (.*)$/;

/**
 * Авто-маркеры пары, которые пересборка убирает: не сохранены этой сборкой, не стоят ни в одном
 * настиле и названы этой же очередью (копию карточной раскладки в прогон не трогаем).
 */
export function staleAutoMarkerIds(args: {
  runMarkers: readonly common_TechCardMarkerSummary[];
  colorwayId: number;
  lineKey: string;
  colorwayLabel: string;
  keepIds: ReadonlySet<number>;
  referencedMarkerIds: ReadonlySet<number>;
}): number[] {
  const out: number[] = [];
  for (const m of args.runMarkers) {
    const id = num(m.id);
    if (id <= 0 || args.keepIds.has(id) || args.referencedMarkerIds.has(id)) continue;
    if ((m.source ?? '') !== 'auto') continue;
    if (num(m.colorwayId) !== args.colorwayId || (m.bomLineKey ?? '') !== args.lineKey) continue;
    const hit = QUEUE_NAME.exec(m.name ?? '');
    if (!hit) continue;
    if (args.colorwayLabel && !hit[1].startsWith(args.colorwayLabel)) continue;
    out.push(id);
  }
  return out;
}
