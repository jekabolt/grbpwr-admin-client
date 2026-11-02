import type { PieceGeom, PieceMark, Pt2 } from 'lib/assembly-skeleton/types';

export type ButtonholeOperation = {
  operationType?: string;
  machineType?: string;
  work?: string;
  zone?: string;
  note?: string;
  cutLengthMm?: string | number | { value?: string };
  buttonholeOrientation?: string;
  placementCount?: number;
  fastening?: {
    cutLengthMm?: string | number | { value?: string };
    buttonholeOrientation?: string;
  };
  placementLayout?: { count?: number };
};

export type ButtonholePictureGlyph = {
  id: string;
  piece: string;
  kind: PlacementMarkKind;
  point: Pt2;
  direction: Pt2;
  lengthMm?: number;
  markBox: { w: number; h: number; cx: number; cy: number };
};

const decimal = (value: string | number | { value?: string } | undefined): number | null => {
  const raw = typeof value === 'object' && value ? value.value : value;
  const parsed = Number(String(raw ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export const buttonholeLengthMm = (op: ButtonholeOperation | undefined): number =>
  decimal(op?.cutLengthMm) ?? decimal(op?.fastening?.cutLengthMm) ?? 12;

export const buttonholeOrientation = (op: ButtonholeOperation | undefined): string =>
  op?.buttonholeOrientation ?? op?.fastening?.buttonholeOrientation ?? '';

export const isButtonholeOperation = (op: ButtonholeOperation | undefined): boolean =>
  [op?.operationType, op?.machineType, op?.work].some((value) =>
    String(value ?? '')
      .toUpperCase()
      .includes('BUTTONHOLE'),
  );

export const isButtonOperation = (op: ButtonholeOperation | undefined): boolean =>
  !isButtonholeOperation(op) &&
  [op?.operationType, op?.machineType, op?.work].some((value) =>
    String(value ?? '')
      .toUpperCase()
      .includes('BUTTON'),
  );

/** Principal axis of a piece contour. Its sign is stable, though callers only read it as a line. */
export function pieceLongAxis(ring: readonly Pt2[]): Pt2 {
  if (ring.length < 2) return [0, 1];
  const centre = ring.reduce<Pt2>(
    ([x, y], point) => [x + point[0] / ring.length, y + point[1] / ring.length],
    [0, 0],
  );
  let xx = 0;
  let xy = 0;
  let yy = 0;
  for (const [x, y] of ring) {
    const dx = x - centre[0];
    const dy = y - centre[1];
    xx += dx * dx;
    xy += dx * dy;
    yy += dy * dy;
  }
  const angle = Math.atan2(2 * xy, xx - yy) / 2;
  let axis: Pt2 = [Math.cos(angle), Math.sin(angle)];
  const dominant = Math.abs(axis[0]) >= Math.abs(axis[1]) ? axis[0] : axis[1];
  if (dominant < 0) axis = [-axis[0], -axis[1]];
  return axis;
}

/** VERTICAL follows the host's long axis; HORIZONTAL and an unset value cross it. */
export function buttonholeDirection(ring: readonly Pt2[], orientation: string | undefined): Pt2 {
  const axis = pieceLongAxis(ring);
  return String(orientation ?? '')
    .toUpperCase()
    .includes('VERTICAL')
    ? axis
    : [axis[1], -axis[0]];
}

/** A front or its placket by code or name. `P_L` counts as a whole code: FLP_L is a cuff placket. */
const FRONT_HOST = /PLCK|PLACKET|(?:^|[^A-Z0-9])P_[LR]|FRONT/i;

export const isFrontHost = (text: string): boolean => FRONT_HOST.test(text);

export type PlacementMarkKind = 'button' | 'buttonhole' | 'label';

export type PlacementMarkHost = {
  key: string;
  name?: string;
  code?: string;
  geom: PieceGeom;
};

export type PlacementMarkSelection = {
  host: PlacementMarkHost;
  kind: PlacementMarkKind;
  marks: readonly PieceMark[];
  exact: boolean;
};

export type PlacementMarkStep = {
  operation: ButtonholeOperation | undefined;
  hosts: readonly PlacementMarkHost[];
};

export const placementMarkKind = (
  op: ButtonholeOperation | undefined,
): PlacementMarkKind | null => {
  if (isButtonholeOperation(op)) return 'buttonhole';
  if (isButtonOperation(op)) return 'button';
  return String(op?.work ?? '').toLocaleLowerCase() === 'attach_label' ? 'label' : null;
};

const hostText = (host: PlacementMarkHost): string =>
  `${host.code ?? ''} ${host.name ?? ''} ${host.geom.pieceKey} ${host.geom.name}`.toLocaleUpperCase();

const zoneNamesHost = (zone: string | undefined, host: PlacementMarkHost): boolean => {
  const words = String(zone ?? '').toLocaleUpperCase();
  const text = hostText(host);
  if (!words || /(?:^|_)UNKNOWN$/.test(words)) return false;
  if (/COLLAR|NECKLINE|NECK/.test(words)) return /(NCK|CLR|COLLAR|NECK)/.test(text);
  if (/SLEEVE|ARMHOLE/.test(words)) return /(SLV|FLP|SLEEVE|ARMHOLE)/.test(text);
  if (/FRONT|OUTER|CLOSURE/.test(words)) return isFrontHost(text);
  if (/POCKET|LINING/.test(words)) return /(PCK|POCKET)/.test(text);
  if (/BACK/.test(words)) return /(?:^|[^A-Z0-9])BP(?:[^A-Z0-9]|$)|BACK/.test(text);
  const tokens = words
    .split(/[^A-Z0-9]+/)
    .filter(
      (word) => word.length > 2 && !['TECH', 'CARD', 'GARMENT', 'ZONE', 'OTHER'].includes(word),
    );
  return tokens.some((word) => text.includes(word));
};

const placementHostScore = (
  host: PlacementMarkHost,
  op: ButtonholeOperation,
  kind: PlacementMarkKind,
  marks: readonly PieceMark[],
): number => {
  const code = hostText(host);
  const terms = `${op.zone ?? ''} ${op.note ?? ''} ${op.work ?? ''}`.toLocaleLowerCase();
  let score = marks.length;
  // Whole-garment fastening rows name the neckline, but their repeated closure marks live on the
  // front/placket. The count-qualified zone rule runs before this material cue.
  if ((kind === 'button' || kind === 'buttonhole') && isFrontHost(code)) score += 200;
  if (/neck|collar/.test(terms) && /(NCK|CLR|COLLAR)/.test(code)) score += 100;
  if (/sleeve/.test(terms) && /(SLV|FLP|SLEEVE)/.test(code)) score += 100;
  if (/front/.test(terms) && isFrontHost(code)) score += 100;
  if (/lining/.test(terms) && /(PCK|POCKET)/.test(code)) score += 100;
  if (/outer/.test(terms) && isFrontHost(code)) score += 40;
  return score;
};

const exactMarks = (kind: PlacementMarkKind, marks: readonly PieceMark[]) =>
  marks.filter((mark) =>
    kind === 'buttonhole'
      ? mark.kind === 'buttonhole'
      : kind === 'button'
        ? mark.kind === 'drill'
        : mark.kind === 'placement',
  );

/** One pure host/mark selector shared by the editor and PDF placement walks. */
export function selectPlacementMarks(
  op: ButtonholeOperation | undefined,
  hosts: readonly PlacementMarkHost[],
  used: ReadonlySet<string> = new Set(),
): PlacementMarkSelection | null {
  const kind = placementMarkKind(op);
  if (!op || !kind) return null;
  const candidates = hosts.flatMap((host) => {
    const available = (host.geom.marks ?? []).filter((mark) => !used.has(mark.id));
    const exact = exactMarks(kind, available);
    const fallback =
      kind === 'label'
        ? []
        : available.filter((mark) => mark.kind === 'drill' || mark.kind === 'buttonhole');
    const marks = exact.length ? exact : fallback;
    return marks.length
      ? [
          {
            host,
            marks,
            exact: exact.length > 0,
            score: placementHostScore(host, op, kind, marks),
          },
        ]
      : [];
  });
  const exactCandidates = candidates.filter((candidate) => candidate.exact);
  const ranked = exactCandidates.length ? exactCandidates : candidates;
  const configuredCount = op.placementLayout?.count ?? op.placementCount;
  const countForZone = Math.max(1, configuredCount ?? 0);
  const zoneCandidates = ranked.filter(
    (candidate) =>
      candidate.exact &&
      candidate.marks.length >= countForZone &&
      zoneNamesHost(op.zone, candidate.host),
  );
  // Editor and PDF list the same hosts in different orders, so a tie must not depend on the order.
  // Two front strips close on each other: the less used one wins. Any other piece closes on itself
  // (a collar and its twin): the one already holding the partner wins.
  const usedOn = (host: PlacementMarkHost) =>
    (host.geom.marks ?? []).filter((mark) => used.has(mark.id)).length;
  const usedOrder = (left: PlacementMarkHost, right: PlacementMarkHost) =>
    (usedOn(left) - usedOn(right)) * (isFrontHost(hostText(left)) ? 1 : -1);
  const selected = [...(zoneCandidates.length ? zoneCandidates : ranked)].sort(
    (left, right) =>
      right.score - left.score ||
      usedOrder(left.host, right.host) ||
      left.host.geom.name.localeCompare(right.host.geom.name) ||
      left.host.key.localeCompare(right.host.key),
  )[0];
  if (!selected) return null;

  // A piece marked at both ends closes on itself: use the end away from its consumed partner.
  const partners = (selected.host.geom.marks ?? []).filter(
    (mark) =>
      used.has(mark.id) &&
      (kind === 'button'
        ? mark.kind === 'buttonhole'
        : kind === 'buttonhole' && mark.kind === 'drill'),
  );
  const awayFromPartner = (mark: PieceMark) =>
    Math.min(
      ...partners.map((partner) =>
        Math.hypot(mark.bbox.cx - partner.bbox.cx, mark.bbox.cy - partner.bbox.cy),
      ),
    );
  const ordered = partners.length
    ? [...selected.marks].sort((left, right) => awayFromPartner(right) - awayFromPartner(left))
    : selected.marks;
  const count = Math.max(0, configuredCount ?? ordered.length);
  return {
    host: selected.host,
    kind,
    marks: ordered.slice(0, count || ordered.length),
    exact: selected.exact,
  };
}

/** Sequential pure walk: each step sees exactly the marks consumed by earlier placement steps. */
export function walkPlacementMarks(
  steps: readonly PlacementMarkStep[],
): readonly (PlacementMarkSelection | null)[] {
  const used = new Set<string>();
  return steps.map((step) => {
    const selected = selectPlacementMarks(step.operation, step.hosts, used);
    selected?.marks.forEach((mark) => used.add(mark.id));
    return selected;
  });
}

export function placementPictureGlyphs(
  op: ButtonholeOperation | undefined,
  selected: PlacementMarkSelection | null,
): ButtonholePictureGlyph[] {
  if (!op || !selected) return [];
  const direction = buttonholeDirection(selected.host.geom.rs, buttonholeOrientation(op));
  return selected.marks.map((mark) => ({
    id: mark.id,
    piece: selected.host.key,
    kind: selected.kind,
    point: [mark.bbox.cx, mark.bbox.cy],
    direction,
    lengthMm: selected.kind === 'buttonhole' ? buttonholeLengthMm(op) : undefined,
    markBox: mark.bbox,
  }));
}

/** Editor entry point: replay all earlier placement steps, then draw only this step's selection. */
export function placementPictureGlyphsForStep(
  steps: readonly PlacementMarkStep[],
  index: number,
): ButtonholePictureGlyph[] {
  const current = steps[index];
  if (!current) return [];
  const selected = walkPlacementMarks(steps.slice(0, index + 1))[index];
  return placementPictureGlyphs(current.operation, selected);
}

/** Compatibility entry point for a single picture with no preceding placement operations. */
export function fasteningPictureGlyphs(
  op: ButtonholeOperation | undefined,
  pieceKeys: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): ButtonholePictureGlyph[] {
  const hosts = pieceKeys.flatMap((key) => {
    const geom = geoms.get(key);
    return geom ? [{ key, name: geom.name, geom }] : [];
  });
  return placementPictureGlyphs(op, selectPlacementMarks(op, hosts));
}

/** Exact classified buttonholes for the most likely closure host in this operation's picture. */
export function buttonholePictureGlyphs(
  op: ButtonholeOperation | undefined,
  pieceKeys: readonly string[],
  geoms: ReadonlyMap<string, PieceGeom>,
): ButtonholePictureGlyph[] {
  if (!isButtonholeOperation(op)) return [];
  return fasteningPictureGlyphs(op, pieceKeys, geoms);
}
