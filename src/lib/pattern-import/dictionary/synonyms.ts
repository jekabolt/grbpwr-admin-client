// PIECE NAME SYNONYMS — printed piece names in the languages the corpus speaks (EN/DE/RU/FR/NL/PL,
// plus ES and DA from blazer/robe) → a base code of `codes.ts`, the F/B side the words imply and the
// fabric they name.
//
// This is EVIDENCE for the AI namer (`ai/combine.ts` text-synonym, Codex C10) and F5's text reader,
// never a namer of its own: it answers "does the printed text agree with this code?", not "what is
// this piece". F5 owns growing it.
//
// Matching is on word STARTS of a normalised text (lower case, ё→е, punctuation → space), so Russian
// cases (`спинки`, `рукава`) and German compounds (`Vorderteil`, `Taschenbeutel`) hit with one stem.
// A specific noun (sleeve, facing, waistband…) outranks the generic front/back reading: «Front
// Waistband» is WB_F, «Back Top» is BP. Main-thread safe: strings only.

export type PieceTextReading = {
  /** Base code the noun names; null = no piece noun found (sides alone may still be read). */
  code: string | null;
  /** F/B the text implies (front/back adjective or the front/back noun itself). */
  side: 'F' | 'B' | null;
  /** Fabric the text names, in the F9 purpose words: lining, interfacing, pocketing. */
  fabric: 'lining' | 'interfacing' | 'pocketing' | null;
  /** The stem that decided the code ('' when none). */
  matched: string;
};

/**
 * Specific piece nouns. When one label names two («Обтачка капюшона», «hood facing») the HEAD noun
 * wins: Russian puts it first (the rest is genitive), English and German put it last (the rest is an
 * attribute or a compound start). A trailing space in a stem = whole word only (`dos ` is not
 * «dos» inside a longer word, and Spanish «dos» = two is a known false friend we accept).
 */
const NOUNS: readonly { code: string; stems: readonly string[] }[] = [
  {
    code: 'CUF',
    stems: [
      'cuff',
      'manschett',
      'ärmelbündchen',
      'armelbundchen',
      'bündchen',
      'манжет',
      'poignet',
      'manchet',
      'mankiet',
      'puño',
      'puno ',
    ],
  },
  {
    code: 'HD',
    stems: [
      'hood',
      'kapuze',
      'капюшон',
      'capuche',
      'capuchon',
      'kaptur',
      'capucha',
      'hætte',
      'haette',
    ],
  },
  { code: 'LAP', stems: ['lapel', 'revers ', 'лацкан', 'klapa ', 'solapa'] },
  {
    code: 'CLR',
    stems: [
      'collar',
      'kragen',
      'воротн',
      'стойк',
      'kraag',
      'kołnierz',
      'kolnierz',
      'cuello',
      'krave',
    ],
  },
  {
    code: 'WB',
    stems: ['waistband', 'waist band', 'bund', 'пояс', 'tailleband', 'pretina', 'linning'],
  },
  {
    code: 'BLT',
    stems: [
      'belt',
      'tie ',
      'ties ',
      'gürtel',
      'gurtel',
      'riegel',
      'хлястик',
      'ceinture',
      'pasek',
      'cinturón',
      'cinturon',
      'bælte',
      'baelte',
    ],
  },
  { code: 'HB', stems: ['hem band', 'hemband', 'saumblende', 'saumband'] },
  { code: 'TAB', stems: ['tab ', 'tabs ', 'пата', 'паты', 'lasche', 'patte ', 'погон'] },
  {
    code: 'PCK',
    stems: [
      'pocket',
      'tasche',
      'карман',
      'мешковин',
      'клапан',
      'листочк',
      'poche',
      'zak ',
      'kieszeń',
      'kieszen',
      'bolsillo',
      'lomme',
      'klappe',
      'paspel',
      'welt ',
      'flap',
    ],
  },
  {
    code: 'FAC',
    stems: [
      'facing',
      'besatz',
      'обтачк',
      'подборт',
      'parementure',
      'belægning',
      'belaegning',
      'beleg',
      'odszycie',
      'vista ',
      'vuelta',
    ],
  },
  {
    code: 'YK',
    stems: [
      'yoke',
      'passe ',
      'кокетк',
      'empiècement',
      'empiecement',
      'karczek',
      'canesú',
      'canesu',
      'bærestykke',
      'baerestykke',
    ],
  },
  { code: 'PLK', stems: ['placket', 'leiste', 'планк', 'listwa', 'tapeta'] },
  { code: 'GST', stems: ['gusset', 'zwickel', 'ластовиц', 'gousset'] },
  { code: 'FL', stems: ['fly ', 'schlitz', 'гульфик', 'braguette', 'gulp ', 'bragueta'] },
  {
    code: 'SL',
    stems: [
      'sleeve',
      'ärmel',
      'armel',
      'рукав',
      'manche',
      'mouw',
      'rękaw',
      'rekaw',
      'manga',
      'ærme',
      'aerme',
    ],
  },
  { code: 'SK', stems: ['skirt', 'rock', 'юбк', 'jupe', 'rok ', 'falda', 'nederdel'] },
  {
    code: 'SP',
    stems: [
      'side panel',
      'side piece',
      'seitenteil',
      'боков',
      'бочок',
      'côté',
      'cote ',
      'zijpand',
      'costado',
    ],
  },
];

/** The body-piece NOUNS: used only when no specific noun is on the label. */
const BODY: readonly { code: 'FP' | 'BP'; stems: readonly string[] }[] = [
  {
    code: 'FP',
    stems: [
      'front piece',
      'vorderteil',
      'forstykke',
      'перед',
      'полочк',
      'devant',
      'voorpand',
      'przód',
      'przod',
      'delantero',
    ],
  },
  {
    code: 'BP',
    stems: [
      'back piece',
      'rückenteil',
      'ruckenteil',
      'bagstykke',
      'спинк',
      'dos ',
      'achterpand',
      'tył',
      'tyl ',
      'espalda',
    ],
  },
];

const LINING_CODE = ['lining', 'futter', 'подкладк', 'doublure', 'voering', 'podszewka', 'forro'];

/** Side adjectives. A specific noun takes the side as a modifier; no noun → FP / BP. */
const FRONT = [
  'front',
  'vord',
  'vorder',
  'перед',
  'полочк',
  'devant',
  'voor',
  'przedn',
  'przód',
  'przod',
  'delanter',
  'forstykke',
];
const BACK = [
  'back',
  'rück',
  'ruck',
  'hinter',
  'задн',
  'спинк',
  'dos ',
  'achter',
  'tył',
  'tyl ',
  'espalda',
  'bagstykke',
];

/** Fabric words, lining first: «Taschenbeutel Futter» is a pocket bag CUT IN LINING. */
const FABRIC: readonly {
  fabric: NonNullable<PieceTextReading['fabric']>;
  stems: readonly string[];
}[] = [
  { fabric: 'lining', stems: LINING_CODE },
  {
    fabric: 'interfacing',
    stems: [
      'einlage',
      'vlieseline',
      'дублерин',
      'флизелин',
      'interfacing',
      'interlining',
      'fusing',
      'entoilage',
      'flizelina',
    ],
  },
  { fabric: 'pocketing', stems: ['taschenbeutel', 'мешковин', 'pocket bag', 'pocketing'] },
];

/** Lower case, ё→е, everything but letters/digits → one space, padded so stems can test word starts. */
export function normaliseText(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

/** Position of a stem at a word start, -1 when absent. */
const at = (t: string, stem: string) => t.indexOf(` ${stem}`);
const hasStem = (t: string, stem: string) => at(t, stem) >= 0;
const CYRILLIC = /[\u0400-\u04FF]/;

function sideOf(t: string): PieceTextReading['side'] {
  const front = FRONT.some((s) => hasStem(t, s));
  const back = BACK.some((s) => hasStem(t, s));
  // «front and back» on one label is no side at all, not a guess.
  return front && !back ? 'F' : back && !front ? 'B' : null;
}

/**
 * Read one printed text. A label is often bilingual («Riegel / ПОГОН,ХЛЯСТИК», «Vorderteil
 * (Futter)»): the first segment that names a piece decides, the fabric is read from the whole label.
 */
export function readPieceText(text: string): PieceTextReading {
  const whole = normaliseText(text);
  const fabric = FABRIC.find((f) => f.stems.some((s) => hasStem(whole, s)))?.fabric ?? null;
  for (const seg of text.split(/[/,;()[\]|]+/)) {
    const t = normaliseText(seg);
    if (t.trim() === '') continue;
    const hits: { code: string; pos: number; len: number; stem: string }[] = [];
    for (const row of NOUNS)
      for (const st of row.stems) {
        const pos = at(t, st);
        if (pos >= 0) hits.push({ code: row.code, pos, len: st.length, stem: st.trim() });
      }
    if (hits.length) {
      const head = CYRILLIC.test(seg)
        ? Math.min(...hits.map((h) => h.pos))
        : Math.max(...hits.map((h) => h.pos));
      const best = hits.filter((h) => h.pos === head).sort((a, b) => b.len - a.len)[0];
      return { code: best.code, side: sideOf(t), fabric, matched: best.stem };
    }
    for (const row of BODY) {
      const st = row.stems.find((s) => hasStem(t, s));
      if (st) return { code: row.code, side: null, fabric, matched: st.trim() };
    }
    const side = sideOf(t);
    if (side)
      return {
        code: side === 'F' ? 'FP' : 'BP',
        side: null,
        fabric,
        matched: side === 'F' ? 'front' : 'back',
      };
  }
  // Lining as a CODE only when nothing else is named on the label.
  const lin = LINING_CODE.find((s) => hasStem(whole, s));
  if (lin) return { code: 'LIN', side: null, fabric, matched: lin };
  return { code: null, side: null, fabric, matched: '' };
}

/** Does this text agree with an identity's code words + mods? null = the text names no piece. */
export function textAgrees(
  text: string,
  codeWords: readonly string[],
  mods: readonly string[],
): boolean | null {
  const r = readPieceText(text);
  if (!r.code) return null;
  if (!codeWords.includes(r.code)) return false;
  const side = mods.find((m) => m === 'F' || m === 'B');
  if (r.side && side && r.side !== side) return false;
  return true;
}
