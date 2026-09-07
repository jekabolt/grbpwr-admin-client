import type {
  GetDesignBandResponse,
  common_DesignPicture,
  common_DesignRun,
  common_DesignRunParams,
  common_MediaFull,
  common_TechCardAnnotation,
} from 'api/proto-http/admin';
import {
  annotationCapsOut,
  annotationColorToWire,
  annotationKindToWire,
} from 'ui/components/annotation/wire';
import { inputToDecimal } from 'utils/decimal';

import { cardOutputRows } from '../bench-kinds';
import type { Gate } from '../render/model';
import { isPictureHidden } from '../visibility';

/**
 * ═══ THE PLAYGROUND — PICTURES, WORDS, ONE RUN. THE PURE HALF ═════════════════════════════════
 *
 * NOT A LINK OF THE CHAIN, and not even the aside's kind of screen: ON MODEL still repaints a
 * garment, this one asks the image model for ONE picture out of whatever a person laid on the
 * table. Its input is media (never a plate of the bench), its output is a picture of the card that
 * no downstream step reads, and nothing on it is a form field — the draft lives in a hook.
 *
 * ⚠ ONE PICTURE PER RUN, AND THAT IS THE OWNER'S OWN NUMBER, not a shape we chose to be tidy:
 * «выход плейграунда — РОВНО ОДНА картинка на прогон». The server agrees before the money moves
 * (`designRequestedOutputs`: `case Freeform, Cutout: return 1`), so the row says «1 picture» /
 * «1 cut-out» and never «3 variants».
 *
 * ⚠ THE PRESETS ARE THE SERVER'S DICTIONARY, IN THE SERVER'S ORDER (`freeform_presets`), and the
 * doctrine around that field is «absent ≠ empty»: a binary that predates it sends nothing and the
 * rail draws NO playground cell at all; a binary that knows it sends at least `[]`, the cell
 * exists, and the screen says in words that no route is wired. Everything below therefore reads
 * the list and never a constant of its own — a client-side list would draw a chip whose GENERATE
 * the server refuses for a missing key.
 */

/** 1..8 pictures on the table. The server's own ceiling (`MaxDesignFreeformItems`). */
export const PLAYGROUND_ITEMS_MAX = 8;
/** Areas per picture — `MaxDesignFreeformRegionsPerItem`. */
export const REGIONS_PER_ITEM_MAX = 4;
/** Runes per text — `MaxDesignFreeformTextRunes`. The area line on screen is shorter (below). */
export const TEXT_MAX = 1000;
/**
 * The AREA line is capped far below the wire's own ceiling, and that is a decision about reading,
 * not about the contract: an area is «this sleeve, in the olive twill of image 2», one line beside
 * a letter. Long prose belongs in the ask, where it has a box to live in.
 */
export const AREA_TEXT_MAX = 120;
export const ASK_MAX = 4000;
/** A, B, C… — the letter an area wears on screen and in the inventory. Never on the wire. */
export const AREA_LETTERS = 'ABCDEFGH';
/**
 * THE PROVIDER'S CEILING ON REFERENCES (`orimages.MaxInputReferences`), mirrored so the refusal is
 * FREE. The server counts the same three things and refuses `too_many_pictures` before reserving,
 * but a person who can see the count has no reason to buy the round trip.
 */
export const REFS_MAX = 16;

export type PlaygroundRole = '' | 'subject' | 'hardware' | 'cloth';

/**
 * THE WHOLE VOCABULARY OF ROLES, AS THE SERVER SPELLS IT (`entity.IsFreeformRole`), and it is a
 * VALUE rather than only a type because the wire hands back plain strings: a run recalled from the
 * history carries `item.role` as a `string`, and casting one to `PlaygroundRole` at the door is a
 * promise the compiler cannot keep. A word this build has never heard of is refused
 * (`unknown_role`) after the money moves through no fault of the person who pressed.
 */
export const PLAYGROUND_ROLES: readonly PlaygroundRole[] = ['', 'subject', 'hardware', 'cloth'];

export function isPlaygroundRole(word: string): word is PlaygroundRole {
  return (PLAYGROUND_ROLES as readonly string[]).includes(word);
}

/** One marked area of one picture: the polygon, and the words about it. */
export type PlaygroundRegion = {
  /** Fractions of the picture, 0..1 — the surface's own coordinates and the wire's. */
  points: { x: number; y: number }[];
  text: string;
};

export type PlaygroundItem = {
  media: common_MediaFull;
  role: PlaygroundRole;
  regions: PlaygroundRegion[];
};

export type PlaygroundState = {
  items: PlaygroundItem[];
  /** The preset key AS THE SERVER SPELLS IT, or '' while none is chosen. */
  preset: string;
  ask: string;
};

export const EMPTY_PLAYGROUND: PlaygroundState = { items: [], preset: '', ask: '' };

/* ─────────────────────────── the presets, as the server offers them ─────────────────────────── */

export type Preset = {
  /** The wire value — `params.freeform.preset`, or the marker of the `cutout` KIND. */
  key: string;
  label: string;
  /** What this preset expects on the table, in words, under the chips. */
  needs: string;
  /**
   * THE CRAFT SENTENCE, MIRRORED — the paragraph the server appends to the prompt. It is NOT
   * editable here and never travels: this is the inventory's copy, so that a person can read what
   * the model will be told without buying a run to find out. If the server's wording moves, this
   * one is stale prose in one modal — not a changed request.
   */
  craft: string;
  /** Which door of `StartDesignRun` this preset takes. */
  kind: 'freeform' | 'cutout';
  /** Roles this preset asks the pictures to declare. Empty — the pictures are just pictures. */
  roles: readonly PlaygroundRole[];
};

/**
 * A preset the server offers that THIS bundle has never heard of is still drawn — with its own
 * key as its name and no promises about what it needs. Hiding it would make a wired route
 * unreachable from a client one version behind; inventing a sentence for it would be worse.
 */
const KNOWN: Record<string, Omit<Preset, 'key'>> = {
  free: {
    label: 'free',
    needs: 'one picture',
    craft:
      'follow the words above; the pictures and their marked areas are numbered as in the list. one picture comes back.',
    kind: 'freeform',
    roles: [],
  },
  add_hardware: {
    label: 'add hardware',
    needs: 'the render and a picture of the hardware · mark where it goes',
    craft:
      'put the hardware shown in the hardware picture onto the subject inside the marked area; match scale, perspective and light; keep the rest as close to the subject as you can.',
    kind: 'freeform',
    roles: ['subject', 'hardware'],
  },
  repaint_parts: {
    label: 'repaint the parts',
    needs: 'one photograph · mark the parts',
    craft:
      'repaint only the marked areas in the cloth or the colour described; keep cut, seams, folds and shadows. with no area marked this repaints the whole garment.',
    kind: 'freeform',
    roles: ['subject', 'cloth'],
  },
  cutout: {
    label: 'cut out the background',
    needs: 'one picture · no words',
    craft:
      'the background is removed and the subject comes back on transparency. this route takes no words.',
    kind: 'cutout',
    roles: [],
  },
};

export function presetsOf(band: GetDesignBandResponse): Preset[] {
  const offered = band.freeformPresets ?? [];
  return offered.map((raw) => {
    const key = (raw ?? '').trim();
    const known = KNOWN[key];
    if (known) return { key, ...known };
    return {
      key,
      label: key.replace(/_/g, ' ') || 'preset',
      needs: 'this build does not know what this preset expects — the server does',
      craft: '',
      // An unknown preset is a preset OF THE FREEFORM KIND: `cutout` is the one route that is a
      // kind of its own, and it is known by name above.
      kind: 'freeform' as const,
      roles: [],
    };
  });
}

/** Whether this server offers a playground at all. `undefined` — the field never arrived. */
export function playgroundOffered(band: GetDesignBandResponse): boolean {
  return band.freeformPresets !== undefined;
}

export function presetByKey(presets: readonly Preset[], key: string): Preset | null {
  return presets.find((p) => p.key === key) ?? null;
}

/* ─────────────────────────── the gate ─────────────────────────── */

export type PlaygroundDoor = 'pictures' | 'preset' | 'areas';

export type PlaygroundGate = { ok: true } | { ok: false; reason: string; door?: PlaygroundDoor };

/** The item a preset treats as the thing being changed. */
export function subjectItem(state: PlaygroundState): PlaygroundItem | null {
  return (
    state.items.find((i) => i.role === 'subject') ??
    state.items.find((i) => i.role !== 'hardware' && i.role !== 'cloth') ??
    null
  );
}

/* ─────────────────────────── what the press ACTUALLY buys ─────────────────────────── */

/**
 * ═══ THE ROLE THIS PICTURE TRAVELS UNDER, WHICH IS NOT ALWAYS THE ROLE ON THE ITEM ════════════
 *
 * A ROLE IS A CLAIM A PRESET ASKS FOR, AND A PRESET THAT DOES NOT ASK GETS NO ANSWER. The chips
 * are drawn from `preset.roles`, so switching from ADD HARDWARE to FREE takes the chips off the
 * screen — and the words «hardware» stayed on the item underneath and went out on the wire, where
 * `free` has no hardware to speak of. Measured shape: `{preset:"free", items:[{role:"hardware"}]}`
 * — a claim nobody on either side can act on, riding a paid call. Clearing the item on every
 * preset switch would be worse: pressing the wrong chip and pressing back would silently forget
 * which picture was the hardware.
 *
 * SO THE ITEM REMEMBERS AND THE WIRE FORGETS. One function, read by `wireParams`, by the gate and
 * by the inventory — the three readers that must agree about one paid run.
 */
export function effectiveRole(item: PlaygroundItem, preset: Preset | null): PlaygroundRole {
  const role = item.role;
  if (!role || !isPlaygroundRole(role)) return '';
  return preset?.roles.includes(role) ? role : '';
}

/**
 * ═══ THE ITEMS AS THEY LEAVE — ONE ANSWER FOR THE WIRE, THE GATE, THE COUNTS AND THE INVENTORY ═
 *
 * ⚠ A CUT-OUT CARRIES ONE PICTURE AND NOTHING ELSE. Its whole request is
 * `extra_input_media_ids: [id]` — no `freeform`, no areas, no words, no role — because the
 * segmentation route has no prompt at all. The table underneath may still hold areas a person
 * marked under another preset, and the inventory used to promise «a crop and a marked copy travel»
 * over a run that sends neither. This is the one place that decides it.
 */
export function effectiveItems(state: PlaygroundState, preset: Preset | null): PlaygroundItem[] {
  if (preset?.kind === 'cutout') {
    const one = state.items[0];
    return one ? [{ media: one.media, role: '', regions: [] }] : [];
  }
  return state.items.map((item) => ({ ...item, role: effectiveRole(item, preset) }));
}

/** items + one crop per area + one marked copy per picture that has areas — of what TRAVELS. */
export function refsCount(state: PlaygroundState, preset: Preset | null): number {
  const list = effectiveItems(state, preset);
  const items = list.length;
  const areas = list.reduce((n, i) => n + i.regions.length, 0);
  const marked = list.filter((i) => i.regions.length > 0).length;
  return items + areas + marked;
}

/** Whether a preset lets an area be marked at all — `cutout` sends none, so it draws none. */
export function presetTakesAreas(preset: Preset | null): boolean {
  return preset?.kind !== 'cutout';
}

/**
 * EVERY REFUSAL THIS SCREEN CAN MAKE WITHOUT BUYING ANYTHING, in the order the server makes them.
 * The words are the screen's; the conditions are `designRefuseUnworkableSources` and
 * `designRefuseFreeformOverflow`, mirrored so that nothing here refuses what the server allows.
 */
export function playgroundGate(state: PlaygroundState, preset: Preset | null): PlaygroundGate {
  if (!preset) {
    return {
      ok: false,
      reason: 'no preset is chosen · pick what this run should do',
      door: 'preset',
    };
  }
  if (preset.kind === 'cutout') {
    if (state.items.length !== 1) {
      return {
        ok: false,
        reason:
          state.items.length === 0
            ? 'nothing to cut out · add one picture'
            : `cutting the background takes exactly one picture · ${state.items.length} are on the table`,
        door: 'pictures',
      };
    }
    return { ok: true };
  }
  if (state.items.length === 0) {
    return { ok: false, reason: 'nothing to look at · add a picture', door: 'pictures' };
  }
  if (state.items.length > PLAYGROUND_ITEMS_MAX) {
    return {
      ok: false,
      reason: `at most ${PLAYGROUND_ITEMS_MAX} pictures in one run`,
      door: 'pictures',
    };
  }
  /* ⚠ THE SAME PICTURE TWICE IS A REFUSAL, NOT A TIDINESS RULE (`duplicate_picture`). The ceiling
     of four areas is declared PER PICTURE, and one media named in two entries walks around it; the
     snapshot then de-duplicates the references while the job builder does not, so the model would
     be handed two outlined copies both captioned «image 1». The strip cannot make this state — the
     table refuses a media it already holds — but a recalled run and a future gesture can, and this
     is the last gate before the money. */
  const list = effectiveItems(state, preset);
  const seen = new Set<number>();
  for (const item of list) {
    const id = item.media.id ?? 0;
    if (id <= 0) continue;
    if (seen.has(id)) {
      return {
        ok: false,
        reason: 'the same picture twice · one picture is one entry, with its areas on it',
        door: 'pictures',
      };
    }
    seen.add(id);
  }
  /* THE ROLE VOCABULARY IS CLOSED, AND THE WIRE HANDS BACK PLAIN STRINGS. A run recalled out of
     the history carries whatever word the server wrote that day; a word this build cannot spell is
     `unknown_role` AFTER the reservation, which is a refusal a person did nothing to earn. */
  const stranger = state.items.find((i) => !isPlaygroundRole(i.role));
  if (stranger) {
    return {
      ok: false,
      reason: `«${stranger.role}» is not a role this run can state · subject | hardware | cloth`,
      door: 'pictures',
    };
  }
  if (preset.roles.includes('hardware') && !list.some((i) => i.role === 'hardware')) {
    return {
      ok: false,
      reason: 'the preset needs a picture of the hardware · say which picture that is',
      door: 'pictures',
    };
  }
  if (preset.key === 'add_hardware') {
    /* ⚠ THE SERVER LOOKS FOR AN AREA ON ANY NON-HARDWARE PICTURE, NOT ON «THE SUBJECT». Its own
       words: «роль пустая законна („просто картинка“), и требовать её проставленной значило бы
       отказывать за неназванное имя там, где человек уже показал пальцем». This screen refused
       exactly there — two pictures, `hardware` on one, an area drawn on the other and no `subject`
       chip pressed: the server would have run it, the lock bar said «mark the area first» over an
       area a person could see they had marked. A gate that refuses what the door allows is worse
       than no gate: it is unfixable from the screen. */
    const marked = list.some((i) => i.role !== 'hardware' && i.regions.length > 0);
    if (!marked) {
      return {
        ok: false,
        reason: 'mark the area first · where does the hardware go',
        door: 'areas',
      };
    }
  }
  const refs = refsCount(state, preset);
  if (refs > REFS_MAX) {
    return {
      ok: false,
      reason: `too many pictures · ${refs} would travel (each picture, each area as a crop, and one marked copy per picture with areas) and the model takes ${REFS_MAX}`,
      door: 'pictures',
    };
  }
  return { ok: true };
}

/** The product's `Gate` shape of the same answer — what the shared generate row reads. */
export function asRowGate(gate: PlaygroundGate): Gate {
  return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
}

/* ─────────────────────────── the wire ─────────────────────────── */

/**
 * A REGION IS A POLYGON, AND ITS OTHER FIELDS ARE DELIBERATELY EMPTY. The contract says so in as
 * many words: «`text`/`color`/`piece_*` of the annotation are IGNORED — the words live in `texts`».
 * Writing a colour here would be writing a fact nobody reads and one more thing to disagree about.
 *
 * ⚠ COORDINATES ARE ROUNDED TO FOUR DECIMALS ON PURPOSE. `google.type.Decimal` is a STRING on the
 * wire, and a raw float prints seventeen digits — a fraction of a pixel spelled at the cost of a
 * longer request, and the neighbouring lesson (`annotation-coordinate-precision-guard`) is that
 * unbounded decimal text is an attack surface, not precision. 1e-4 of a picture is a tenth of a
 * pixel on a 1000px frame.
 */
function regionToWire(region: PlaygroundRegion): common_TechCardAnnotation {
  return {
    kind: annotationKindToWire('polygon'),
    points: region.points.map((p) => ({
      x: inputToDecimal(p.x.toFixed(4)),
      y: inputToDecimal(p.y.toFixed(4)),
    })),
    text: '',
    labelX: undefined,
    labelY: undefined,
    color: annotationColorToWire(''),
    dashed: false,
    filled: false,
    ...annotationCapsOut(''),
    pieceLineKey: '',
    pieceLineKeys: [],
  };
}

/**
 * ═══ THE ONE WRITER OF THIS SCREEN'S RUN BODY ════════════════════════════════════════════════
 *
 * The gate, the inventory and the wire all read THIS function's result — the defect this rule
 * exists against cost a week on a neighbouring screen: the caption said one thing and the request
 * said another.
 *
 * ⚠ ONE LIST PER FACT. On `freeform` the pictures travel in `freeform.items[]` and
 * `extra_input_media_ids` leaves EMPTY; on `cutout` it is the other way round and `freeform` is
 * absent. A run naming a picture in both is refused (`one_list_per_fact`), so the shape below is
 * not a preference — it is the only body the door accepts.
 *
 * `colorwayId: 0` — the playground binds no colourway. A number above zero is refused
 * (`colorway_forbidden`) because this kind takes no colourway axis at all.
 */
export function wireParams(state: PlaygroundState, preset: Preset): common_DesignRunParams {
  const common = {
    views: [] as string[],
    layout: '',
    colour: undefined,
    threed: undefined,
    fixTarget: '',
    fixTargets: [] as string[],
    fixSlotIds: [] as number[],
    autoSplit: false,
    detailSlotIds: [] as number[],
    pattern: undefined,
    useFlatSlots: false,
    colorwayId: 0,
    flatSlotIds: [] as number[],
  };
  if (preset.kind === 'cutout') {
    const id = effectiveItems(state, preset)[0]?.media.id ?? 0;
    return {
      ...common,
      extraInputMediaIds: id > 0 ? [id] : [],
      freeform: undefined,
    };
  }
  return {
    ...common,
    extraInputMediaIds: [],
    freeform: {
      preset: preset.key,
      // `effectiveItems` — THE ONE ANSWER, not a second reading of the draft. A role the chosen
      // preset never asked for does not travel (see there), and the inventory counts THIS list.
      items: effectiveItems(state, preset).map((item) => ({
        mediaId: item.media.id ?? 0,
        regions: item.regions.map(regionToWire),
        // texts PAIR WITH regions BY INDEX, and this screen writes exactly as many as there are
        // areas: the contract allows one trailing text «about the whole picture», and this screen
        // does not draw one — the whole-picture words are THE ASK, one box for the whole run.
        texts: item.regions.map((r) => r.text.trim().slice(0, TEXT_MAX)),
        role: item.role,
      })),
    },
  };
}

/* ─────────────────────────── what came back ─────────────────────────── */

/**
 * EVERY PLAYGROUND OUTPUT OF THE CARD, not of this page of the feed (H-9). The kind is read from
 * the RUN, as everywhere in this band: `DesignPicture.kind` is an open string and a freeform output
 * carries its own new word, but only `run_kind` survives the run falling off the page.
 */
export function playgroundOutputs(
  band: GetDesignBandResponse,
): { picture: common_DesignPicture; run: common_DesignRun }[] {
  const whole = cardOutputRows(band, 'playground');
  if (whole) return whole;

  const out: { picture: common_DesignPicture; run: common_DesignRun }[] = [];
  for (const run of playgroundRuns(band)) {
    for (const picture of run.pictures ?? []) {
      if (isPictureHidden(picture)) continue;
      if ((picture.id ?? 0) <= 0) continue;
      out.push({ picture, run });
    }
  }
  return out;
}

/** The playground runs of this page of the feed — live ones, failed ones, their money. */
export function playgroundRuns(band: GetDesignBandResponse): common_DesignRun[] {
  return (band.runs ?? []).filter((run) => {
    const kind = (run.kind ?? '').trim().toLowerCase();
    return kind === 'freeform' || kind === 'cutout';
  });
}

/** A picture that came out of the cut-out route — it is the one that wants a neutral ground. */
export function isCutoutPicture(run: common_DesignRun): boolean {
  return (run.kind ?? '').trim().toLowerCase() === 'cutout';
}

/* ─────────────────────────── the strip, grown by a gesture ─────────────────────────── */

/**
 * ONE PLACE WHERE THE TABLE GROWS, so the cap and the duplicates are one answer. A media already on
 * the table is not added twice: the server refuses a call carrying one media id twice, and the
 * table IS `freeform.items[]`. Over the cap the extras are DROPPED — the caller says so out loud.
 */
export function addItems(
  current: readonly PlaygroundItem[],
  incoming: readonly common_MediaFull[],
  defaultRole: PlaygroundRole = '',
): PlaygroundItem[] {
  const out = [...current];
  const seen = new Set(out.map((i) => i.media.id ?? 0));
  for (const media of incoming) {
    const id = media.id ?? 0;
    if (id <= 0 || seen.has(id)) continue;
    if (out.length >= PLAYGROUND_ITEMS_MAX) break;
    seen.add(id);
    out.push({ media, role: defaultRole, regions: [] });
  }
  return out;
}

/** The ids on the table, in its order — what the picker draws as taken. */
export function itemMediaIds(items: readonly PlaygroundItem[]): number[] {
  return items.map((i) => i.media.id ?? 0).filter((id) => id > 0);
}

/** `image 1 · A` — the token a chip drops into the ask, and the name of an area everywhere else. */
export function areaToken(itemIndex: number, regionIndex: number): string {
  return `image ${itemIndex + 1} · ${AREA_LETTERS[regionIndex] ?? String(regionIndex + 1)}`;
}

export function areaLetter(regionIndex: number): string {
  return AREA_LETTERS[regionIndex] ?? String(regionIndex + 1);
}

/**
 * THE SHAPE OF WHAT IS ABOUT TO BE BOUGHT, in the words the generate row prints. One picture, and
 * the noun says which route made it — a cut-out is not «a picture» to the person waiting for it.
 */
export function runShape(preset: Preset | null): string {
  return preset?.kind === 'cutout' ? '1 cut-out' : '1 picture';
}
