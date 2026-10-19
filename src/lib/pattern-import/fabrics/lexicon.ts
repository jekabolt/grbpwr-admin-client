// FABRIC WORDS — which cloth a printed text names, in the languages pattern sheets are printed in
// (EN DE RU FR ES IT NL PL SV DA NO FI). Evidence for `proposeFabrics`, never a decision on its own.
//
// `dictionary/synonyms.ts` reads a fabric word only to NAME a piece (lining → `LIN_<code>`); this
// file answers the other question — "what is this piece CUT FROM" — so it knows more cloths (rib
// knit, insulation, contrast, main) and more spellings (vuori, foder, entretela, прокладка). The two
// lists do not share an array on purpose: a word added here to find a cut layout must not start
// renaming pieces.
//
// Matching is on WORD STARTS of a normalised text (lower case, ё→е, punctuation → space), so Russian
// cases (`подкладки`, `подкладочной`) and German compounds (`Futterteile`, `Rippenstrickstoff`) hit
// with one stem. A trailing space in a stem = whole word only (`rib ` is not `ribbon`).
// Main-thread safe: strings only.

/** The cloth roles a pattern sheet distinguishes. Not BOM purposes: `rib` has none of its own. */
export type FabricKind =
  | 'main'
  | 'lining'
  | 'interfacing'
  | 'rib'
  | 'pocketing'
  | 'insulation'
  | 'contrast'
  | 'mesh';

/** Stems per kind. Order matters for overlaps: the FIRST kind whose stem starts a word wins. */
export const FABRIC_WORDS: readonly { kind: FabricKind; stems: readonly string[] }[] = [
  {
    // «Volumenvlies» is batting, «Vlieseline» interfacing: insulation is tested before interfacing.
    kind: 'insulation',
    stems: [
      'insulation',
      'batting',
      'wadding',
      'padding ',
      'volumenvlies',
      'volumevlies',
      'wattierung',
      'wattier',
      'утеплител',
      'синтепон',
      'шерстепон',
      'тинсулейт',
      'ouate',
      'molleton ',
      'guata',
      'imbottitur',
      'ocieplin',
      'vadd',
      'vanu',
    ],
  },
  {
    kind: 'interfacing',
    stems: [
      'interfacing',
      'interlining',
      'fusing',
      'fusible',
      'einlage',
      'vlieseline',
      'bügeleinlage',
      'дублерин',
      'дублирова',
      'флизелин',
      'прокладк',
      'клеевой ткан',
      'клеевая ткан',
      'клеевую ткан',
      'клеевого',
      'entoilage',
      'triplure',
      'thermocollant',
      'entretela',
      'rinforzo',
      'teletta',
      'tussenvoering',
      'flizelin',
      'mellanlägg',
      'mellanlagg',
      'indlæg',
      'indlaeg',
      'innlegg',
      'tukikangas',
      'liimakangas',
    ],
  },
  {
    kind: 'lining',
    stems: [
      'lining',
      'futter',
      'подклад',
      'doublure',
      'forro',
      'fodera',
      'foder ',
      'fór ',
      'vuori',
      'voering',
      'podszewk',
    ],
  },
  {
    kind: 'rib',
    stems: [
      'rib ',
      'ribs ',
      'ribbing',
      'rib knit',
      'ribknit',
      'rippenstrick',
      'rippstrick',
      'bündchenstoff',
      'bundchenstoff',
      // «Bündchen» alone is the rib band (Burda C: waistband and cuffs from rib knit); «Ärmelbündchen»
      // is a shirt cuff and does not start a word with it
      'bündchen ',
      'bundchen ',
      'bündchenware',
      'рибан',
      'кашкорс',
      'ластик',
      'tricot côtelé',
      'tricot cotele',
      'bord-côte',
      'bord côte',
      'canalé',
      'canale ',
      'maglina a coste',
      'boordstof',
      'boordsel',
      'ściągacz',
      'sciagacz',
      'ribbstick',
      'ribstrik',
      'resori',
    ],
  },
  {
    kind: 'pocketing',
    stems: ['pocketing', 'pocket lining', 'taschenfutter', 'карманной ткан', 'карманка'],
  },
  {
    kind: 'contrast',
    stems: [
      'contrast',
      'kontrast',
      'контраст',
      'отделочн',
      'garnitur',
      'besatzstoff',
      'tissu garniture',
      'tissu de garniture',
      'tela de guarnici',
      'tessuto di guarnizion',
      'garneerstof',
      'garneringstyg',
      'garniturestof',
    ],
  },
  { kind: 'mesh', stems: ['mesh', 'сетчат', 'netzstoff', 'filet '] },
  {
    kind: 'main',
    stems: [
      'main fabric',
      'shell fabric',
      'self fabric',
      'fashion fabric',
      'outer fabric',
      'oberstoff',
      'hauptstoff',
      'основной ткан',
      'основная ткан',
      'основную ткан',
      // a heading broken over two lines («…из основной» / «ткани:»)
      'из основной',
      'верха ',
      'tissu principal',
      'tela principal',
      'tessuto principale',
      'hoofdstof',
      'tkanina główna',
      'tkanina glowna',
      'huvudtyg',
      'hovedstof',
    ],
  },
];

/** Lower case, ё→е, everything but letters/digits → one space, padded so stems test word starts. */
export function normaliseFabricText(s: string): string {
  return ` ${s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()} `;
}

/** A stem in normalised spelling; a trailing space (= whole word) survives normalisation. */
const stemKey = (raw: string) => {
  const core = normaliseFabricText(raw).trim();
  return raw.endsWith(' ') ? `${core} ` : core;
};

/** Every fabric kind a text names, in order of first appearance, with the stem that hit. */
export function fabricKindsIn(text: string): { kind: FabricKind; stem: string; at: number }[] {
  const t = normaliseFabricText(text);
  const hits: { kind: FabricKind; stem: string; at: number }[] = [];
  const claimed: [number, number][] = [];
  for (const row of FABRIC_WORDS)
    for (const raw of row.stems) {
      const stem = stemKey(raw);
      let from = 0;
      for (;;) {
        const at = t.indexOf(` ${stem}`, from);
        if (at < 0) break;
        from = at + 1;
        const end = at + stem.length + 1;
        // a word already claimed by an earlier kind (Volumenvlies vs vlies) is not read twice
        if (claimed.some(([a, b]) => at < b && end > a)) continue;
        claimed.push([at, end]);
        if (!hits.some((h) => h.kind === row.kind))
          hits.push({ kind: row.kind, stem: raw.trim(), at });
      }
    }
  return hits.sort((a, b) => a.at - b.at);
}

/** The first fabric kind a text names, or null. */
export function fabricKindOf(text: string): FabricKind | null {
  return fabricKindsIn(text)[0]?.kind ?? null;
}

/**
 * Words that say a fabric is FUSED onto the piece rather than cut as a piece of its own
 * («дублировать», «laut Zeichnungen aufbügeln»). Interfacing named on a shell piece means the shell
 * piece is fused, not that the piece is cut only from interfacing.
 */
export const FUSE_VERBS: readonly string[] = [
  'дублир',
  'aufbügeln',
  'aufbugeln',
  'bügeln',
  'fuse ',
  'fused',
  'thermocoller',
  'entoiler',
  'termofijar',
  'opstrijken',
];

export const hasFuseVerb = (text: string) => {
  const t = normaliseFabricText(text);
  return FUSE_VERBS.some((s) => t.includes(` ${stemKey(s)}`));
};
