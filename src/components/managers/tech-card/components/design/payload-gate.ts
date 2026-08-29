import type { common_TechCardMediaKind } from 'api/proto-http/admin';

/**
 * THE capability gate on the tech-card payload. STUB: the pure half is here, the wiring into
 * `mapFormToTechCardInsert` / `doSubmit` is deliberately not.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A NICETY.
 *
 * The admin gateway is built with `DiscardUnknown: false`. An unknown field is not ignored, it is
 * an ERROR — the whole request is rejected with 400. So a browser holding a cached bundle that
 * knows about `mood_note`, `client_ref` and `kind='side_l'`, talking to a binary that has been
 * rolled back, does not lose the design band: it loses SAVING. Every UpdateTechCard on every card
 * returns 400, and the admins cannot save a single tech card until they hard-reload. That is the
 * whole document, not one strip of it, and it is why this gate governs the payload of an EXISTING
 * RPC and not merely the calls to new ones.
 *
 * THE COST OF THE GATE, NAMED OUT LOUD — and it is smaller than the plan feared, because the
 * contract closed the hole. A callout arriving with `number != 0` and no `client_ref` INHERITS the
 * stored ref of that number, exactly the way callout geometry is already carried by number. So a
 * gated save does NOT wipe the refs of existing callouts. What it does cost is the one case that
 * needs the field: a NEW callout (`number == 0`) cannot mint a number while the gate is shut. That
 * is the correct behaviour against a server that would 400 on the field anyway — but it is a real
 * consequence, so the report counts it instead of letting it happen in silence.
 *
 * Pure: no state, no queries, no React. The flag comes from `serverSpeaksDesign()` in
 * `./capability`, which is where the transport-level question is answered.
 */

/**
 * The three values migration 0346 adds to the media-kind dictionary, each mapped to the legacy
 * value a pre-design binary can store.
 *
 * A FOLD, NOT A DROP. Dropping the media item would take the picture off the card; folding keeps
 * the picture and loses only the precision of its label, which is the lesser of the two losses and
 * the reversible one — the value is re-set by hand once the server speaks design again.
 *
 * The two targets are chosen for what they cannot be confused with: a side flat folds to DETAIL
 * rather than FRONT, so it never gets read as the front silhouette by the mixed-composition check;
 * an accepted render folds to PREVIEW, which is the legacy word for exactly that.
 *
 * ⚠ The fold targets are a judgement call, not a contract fact — confirm with the owner before
 * this gate is wired to a live save.
 */
export const DESIGN_ONLY_MEDIA_KINDS: Readonly<
  Partial<Record<common_TechCardMediaKind, common_TechCardMediaKind>>
> = {
  TECH_CARD_MEDIA_KIND_SIDE_L: 'TECH_CARD_MEDIA_KIND_DETAIL',
  TECH_CARD_MEDIA_KIND_SIDE_R: 'TECH_CARD_MEDIA_KIND_DETAIL',
  TECH_CARD_MEDIA_KIND_RENDER: 'TECH_CARD_MEDIA_KIND_PREVIEW',
};

/**
 * `kind` is an OPEN string in the form schema on purpose — a closed zod enum would make the
 * dictionary impossible to extend before a client rollout — so the lookup takes a plain string and
 * the map is what states the closed part.
 */
export function isDesignOnlyMediaKind(kind?: string | null): boolean {
  return !!kind && Object.prototype.hasOwnProperty.call(DESIGN_ONLY_MEDIA_KINDS, kind);
}

/** Legacy value for a design-only kind; the kind itself when it is already legacy. */
export function foldMediaKind(kind?: string | null): string {
  if (!kind) return '';
  return DESIGN_ONLY_MEDIA_KINDS[kind as common_TechCardMediaKind] ?? kind;
}

// STRUCTURAL views of the save payload, not mirrors of the generated types — deliberately so. The
// gate runs over the object `mapFormToTechCardInsert` already builds, whatever else it carries, and
// naming the full generated type here would make the gate refuse a payload that merely grew a
// field. What the three types below state is the ONLY thing the gate is allowed to touch.
export type GateableMediaItem = { kind?: string | null };

export type GateableCallout = { clientRef?: string | null };

export type GateableTechCardPayload = {
  moodNote?: string | null;
  moodboardMedia?: GateableMediaItem[];
  technicalMedia?: GateableMediaItem[];
  callouts?: GateableCallout[];
};

export type FoldedMediaKind = {
  list: 'moodboardMedia' | 'technicalMedia';
  index: number;
  from: string;
  to: string;
};

/**
 * What the gate took out. Carried back to the caller instead of being logged, because two of the
 * three losses are worth a sentence on screen: the operator wrote a mood note that is not going to
 * be saved, and a side view is going to come back labelled as a detail.
 */
export type DesignPayloadGateReport = {
  /** True when a non-empty mood note was withheld — an empty one costs nothing to withhold. */
  moodNoteWithheld: boolean;
  /**
   * How many callout refs were withheld. NOT «how many will be lost»: a callout that already has a
   * number keeps its stored ref by the server's carry rule. The count matters for the rows that
   * have no number yet — those are the ones that will not mint one this save.
   */
  clientRefsDropped: number;
  mediaKindsFolded: FoldedMediaKind[];
};

export function emptyGateReport(): DesignPayloadGateReport {
  return { moodNoteWithheld: false, clientRefsDropped: 0, mediaKindsFolded: [] };
}

export function gateChangedSomething(report: DesignPayloadGateReport): boolean {
  return (
    report.moodNoteWithheld || report.clientRefsDropped > 0 || report.mediaKindsFolded.length > 0
  );
}

/**
 * Build the payload the wire is allowed to see.
 *
 * `serverSpeaksDesign = true` is the identity: the payload passes through untouched, same object,
 * so a capable server sees exactly what the form built.
 *
 * `false` returns a COPY with the design-only fields removed — the key is deleted, not set to
 * `undefined` or `null`, because `null` is a value the gateway would still have to recognise and
 * a deleted key is the only spelling of «this bundle did not say anything about that field».
 * The originals are never mutated: the caller still holds the full payload for the form reset.
 */
export function gateTechCardPayload<T extends GateableTechCardPayload>(
  payload: T,
  options: { serverSpeaksDesign: boolean },
): { payload: T; report: DesignPayloadGateReport } {
  if (options.serverSpeaksDesign) return { payload, report: emptyGateReport() };

  const report = emptyGateReport();
  const next: T = { ...payload };
  const narrowed = next as GateableTechCardPayload;

  if ('moodNote' in narrowed) {
    report.moodNoteWithheld = !!(narrowed.moodNote ?? '').trim();
    delete narrowed.moodNote;
  }

  if (Array.isArray(narrowed.callouts)) {
    narrowed.callouts = narrowed.callouts.map((callout) => {
      if (!('clientRef' in callout)) return callout;
      const copy = { ...callout };
      if ((copy.clientRef ?? '').trim()) report.clientRefsDropped += 1;
      delete copy.clientRef;
      return copy;
    });
  }

  for (const list of ['moodboardMedia', 'technicalMedia'] as const) {
    const items = narrowed[list];
    if (!Array.isArray(items)) continue;
    narrowed[list] = items.map((item, index) => {
      const from = item.kind ?? '';
      if (!isDesignOnlyMediaKind(from)) return item;
      const to = foldMediaKind(from);
      report.mediaKindsFolded.push({ list, index, from, to });
      return { ...item, kind: to };
    });
  }

  return { payload: next, report };
}
