import type {
  common_DesignJoinItem,
  common_DesignJoinLayer,
  common_DesignJoins,
} from 'api/proto-http/admin';

/**
 * ═══ THE JOIN LIST — WHAT THE FLAT IS CHECKED AGAINST (flat route, 05.10, 0397) ═════════════════
 *
 * The card's construction on a FIXED landmark ruler (`entity.DesignJoinLandmarkHelp` on the server):
 * every edge, seam, band and closure as a path of ruler points, the absences («no back neckline»),
 * the layers of a garment with a sheer outer, the model's doubts. The model writes it from the
 * reference photos (`GenerateDesignJoins`), the designer corrects it (`SetDesignJoins`, CAS on rev),
 * and a flat run freezes it into its prompt.
 *
 * The server cleans whatever it is sent as it cleans the model's answer: unknown kinds and points
 * dropped, absences kept only when they are negations. This module never invents structure — a line
 * the designer types is parsed into a kind and ruler points, or it is refused before the write.
 */

export const JOIN_KINDS = [
  'edge',
  'seam',
  'binding',
  'band',
  'strap',
  'collar',
  'stand',
  'placket',
  'cuff',
  'waistband',
  'sleeve',
  'closure',
  'pocket',
  'opening',
] as const;

const KIND_SET = new Set<string>(JOIN_KINDS);

const CENTRE = [
  'CFN',
  'CBN',
  'CFN_LOW',
  'CBN_LOW',
  'BUST_C',
  'CHEST_C',
  'UB_C',
  'MB_C',
  'WF_C',
  'WB_C',
  'HEM_FC',
  'HEM_BC',
];
const SIDED = [
  'NP',
  'SP',
  'UA',
  'MB',
  'WL',
  'HEM',
  'CHEST',
  'BUSTSIDE',
  'SB',
  'YOKE',
  'FSH',
  'BSH',
  'ELB_OUT',
  'WRIST_OUT',
  'WRIST_IN',
  'SSLV_OUT',
  'SSLV_IN',
];
const RULER = new Set<string>([...CENTRE, ...SIDED.flatMap((p) => [`${p}_L`, `${p}_R`])]);

/** A ruler point: plain (`NP_L`) or between two (`NP_L..SP_L:0.3`, t in 0..1) — the server's rule. */
export function isLandmark(name: string): boolean {
  const s = name.trim();
  if (!s || s.length > 40) return false;
  const at = s.indexOf('..');
  if (at < 0) return RULER.has(s);
  const a = s.slice(0, at);
  const rest = s.slice(at + 2);
  const colon = rest.lastIndexOf(':');
  if (colon < 0) return false;
  const b = rest.slice(0, colon);
  const t = Number(rest.slice(colon + 1));
  return RULER.has(a) && RULER.has(b) && Number.isFinite(t) && t >= 0 && t <= 1;
}

export const NEGATION = /^(no|not|none|nothing|without|never|zero)\b/i;

export function pathOf(it: common_DesignJoinItem): string[] {
  return [it.from ?? '', ...(it.via ?? []), it.to ?? ''].filter(Boolean);
}

/** `binding · NP_R → CFN → NP_L · front` — the structure the prompt reads. */
export function joinStructure(it: common_DesignJoinItem): string {
  const kind = (it.kind ?? '').trim() || 'join';
  const width = it.width ? ` ${it.width}` : '';
  let where: string;
  if (kind === 'pocket') where = it.from ?? '';
  else if (kind === 'opening') where = (it.boundedBy ?? []).join(', ');
  else where = pathOf(it).join(' → ');
  const parts = [`${kind}${width}`];
  if (where) parts.push(where);
  if (it.view) parts.push(it.view);
  return parts.join(' · ');
}

/** What the row edits: the structure, then the note after ` — `. */
export function joinLine(it: common_DesignJoinItem): string {
  const note = (it.text ?? '').trim();
  return note ? `${joinStructure(it)} — ${note}` : joinStructure(it);
}

export type ParsedLine =
  | { kind: 'absence'; text: string }
  | { kind: 'item'; patch: Partial<common_DesignJoinItem> }
  | { kind: 'refused'; why: string };

/**
 * One typed line → an absence (it starts with a negation) or an item (`kind`, ruler points,
 * `front`/`back`, `narrow`/`wide`, then ` — note`). Anything else is refused with the reason.
 */
export function parseJoinLine(line: string): ParsedLine {
  const raw = line.trim();
  if (!raw) return { kind: 'refused', why: 'empty' };
  if (NEGATION.test(raw)) return { kind: 'absence', text: raw };
  const dash = raw.search(/\s[—–]\s|\s--\s/);
  const head = dash < 0 ? raw : raw.slice(0, dash);
  const note =
    dash < 0
      ? ''
      : raw
          .slice(dash)
          .replace(/^\s*(—|–|--)\s*/, '')
          .trim();
  const tokens = head
    .split(/[\s·,→]+|->/)
    .map((t) => t.trim())
    .filter(Boolean);
  let kind = '';
  let view = '';
  let width = '';
  const points: string[] = [];
  const words: string[] = [];
  for (const t of tokens) {
    const low = t.toLowerCase();
    const up = t.toUpperCase();
    if (!kind && KIND_SET.has(low)) kind = low;
    else if (low === 'front' || low === 'back') view = low;
    else if (low === 'narrow' || low === 'wide') width = low;
    else if (isLandmark(up)) points.push(up);
    else words.push(t);
  }
  if (!kind) return { kind: 'refused', why: `start with a kind: ${JOIN_KINDS.join(', ')}` };
  if (kind === 'opening')
    return { kind: 'refused', why: 'an opening is written by the model — edit its note instead' };
  if (kind === 'pocket' ? points.length < 1 : points.length < 2)
    return {
      kind: 'refused',
      why: kind === 'pocket' ? 'name the ruler point of the pocket' : 'name two ruler points',
    };
  const text = [words.join(' '), note].filter(Boolean).join(' — ');
  const patch: Partial<common_DesignJoinItem> =
    kind === 'pocket'
      ? { kind, from: points[0], to: '', via: [], view, text }
      : {
          kind,
          from: points[0],
          to: points[points.length - 1],
          via: points.slice(1, -1),
          view,
          width,
          text,
        };
  return { kind: 'item', patch };
}

export const VISIBILITY = ['visible', 'through', 'hidden'] as const;
export type Visibility = (typeof VISIBILITY)[number];
export const VISIBILITY_GLYPH: Record<Visibility, string> = {
  visible: '—',
  through: '╌',
  hidden: '○',
};

export function visibilityOf(it: common_DesignJoinItem): Visibility {
  const v = (it.visibility ?? '').trim();
  return v === 'through' || v === 'hidden' ? v : 'visible';
}

/** The layers of the list in depth order; a list without them is one layer 0. */
export function layersOf(j: common_DesignJoins | undefined): common_DesignJoinLayer[] {
  return [...(j?.layers ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
}

/* ─── edits: each is a function of the list, so a stale write re-applies it to the fresh one ─── */

export type JoinsEdit = (j: common_DesignJoins) => common_DesignJoins;

export const EMPTY_JOINS: common_DesignJoins = {
  rev: 0,
  items: [],
  absences: [],
  consistency: undefined,
  model: '',
  edited: false,
  createdAt: undefined,
  editedAt: undefined,
  layers: [],
  uncertain: [],
};

const items = (j: common_DesignJoins) => j.items ?? [];

export const editItem =
  (id: string, patch: Partial<common_DesignJoinItem>): JoinsEdit =>
  (j) => ({ ...j, items: items(j).map((it) => (it.id === id ? { ...it, ...patch } : it)) });

export const dropItem =
  (id: string): JoinsEdit =>
  (j) => ({ ...j, items: items(j).filter((it) => it.id !== id) });

export const addItem =
  (patch: Partial<common_DesignJoinItem>, layer = 0): JoinsEdit =>
  (j) => ({
    ...j,
    items: [
      ...items(j),
      {
        kind: '',
        from: '',
        to: '',
        view: '',
        side: '',
        text: '',
        id: '',
        via: [],
        width: '',
        closed: false,
        type: '',
        count: 0,
        boundedBy: [],
        continuesInto: [],
        layer,
        visibility: 'visible',
        caughtInto: [],
        freeEdge: false,
        sharp: [],
        ...patch,
      },
    ],
  });

/** Absences and doubts are addressed by their text: the server dedupes absences by it. */
/** Absences compare without case and spacing: «No sleeves» and «no  sleeves» are one absence. */
export const absenceKey = (a: string) => a.trim().replace(/\s+/g, ' ').toLowerCase();

/** The absences once each, first spelling kept, in order. */
export function uniqueAbsences(list: readonly string[] | undefined): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const a of list ?? []) {
    const k = absenceKey(a);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(a.trim());
  }
  return out;
}

export const editAbsence =
  (was: string, next: string): JoinsEdit =>
  (j) => ({
    ...j,
    absences: uniqueAbsences(
      (j.absences ?? []).map((a) => (absenceKey(a) === absenceKey(was) ? next : a)),
    ),
  });

export const dropAbsence =
  (was: string): JoinsEdit =>
  (j) => ({
    ...j,
    absences: uniqueAbsences((j.absences ?? []).filter((a) => absenceKey(a) !== absenceKey(was))),
  });

export const addAbsence =
  (text: string): JoinsEdit =>
  (j) => ({ ...j, absences: uniqueAbsences([...(j.absences ?? []), text]) });

export const dropUncertain =
  (was: string): JoinsEdit =>
  (j) => ({ ...j, uncertain: (j.uncertain ?? []).filter((u) => u !== was) });

export const editLayer =
  (index: number, patch: Partial<common_DesignJoinLayer>): JoinsEdit =>
  (j) => ({
    ...j,
    layers: (j.layers ?? []).map((l) => ((l.index ?? 0) === index ? { ...l, ...patch } : l)),
  });

export const keepPhotos =
  (ids: number[]): JoinsEdit =>
  (j) => ({
    ...j,
    consistency: {
      consistent: j.consistency?.consistent ?? false,
      note: j.consistency?.note ?? '',
      groups: j.consistency?.groups ?? [],
      keepMediaIds: ids,
    },
  });
