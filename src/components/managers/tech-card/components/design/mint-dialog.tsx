import { useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type {
  DesignExpectedPlate,
  GetDesignBandResponse,
  common_DesignBenchSlot,
  common_DesignSheetPlate,
  common_DesignSheetVersion,
} from 'api/proto-http/admin';
import { usePermissions } from 'components/managers/accounts/utils/permissions';
import {
  techCardKeys,
  useTechCard,
} from 'components/managers/tech-cards/components/useTechCardQuery';
import { useSnackBarStore } from 'lib/stores/store';
import { createContext, useContext, useMemo, useRef, useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from 'ui/components/button';
import { CalloutBox } from 'ui/components/callout-box';
import CheckboxCommon from 'ui/components/checkbox';
import { ConfirmationModal } from 'ui/components/confirmation-modal';
import { GroupLabel } from 'ui/components/group-label';
import Text from 'ui/components/text';
import { revealField } from 'utils/field-errors';

import { mapFormToTechCardInsert, type TechCardFormData } from '../schema';
import { serverSpeaksDesign } from './capability';
import { clockStamp } from './handles';
import { gateTechCardPayload } from './payload-gate';
import { plateStaleReason, provenanceLabel, readProvenance } from './provenance';
import { designKeys, newClientRequestId, useDesignWrites } from './use-design-band';

/**
 * THE MINT — and the first thing to know about it is that it is not an action beside «Save». It IS
 * a save: `MintDesignSheetVersion` performs the ordinary document write in the SAME serializable
 * transaction that gives birth to the version, «so the state «re-pinned, but no version» does not
 * exist» (the RPC's own contract comment). Two calls — save, then mint — would leave exactly that
 * state on the floor every time the second one failed.
 *
 * WHICH IS WHY THIS FILE DOES NOT PRESS «Save» AND DOES NOT BUILD ITS OWN PAYLOAD. It calls
 * `mapFormToTechCardInsert` — the one the tech card's own submit calls — and it settles the form
 * afterwards through the page's own `withServerAssignedValues`, handed down by
 * `DesignSaveHostProvider`. A second spelling of either would be a second opinion about what a
 * saved tech card is, and the two would disagree the first week somebody adds a field.
 *
 * WHAT A VERSION FREEZES, AND WHAT IT DOES NOT. It freezes THE COMPOSITION OF PLATES — which
 * pictures were on the sheet, with the hash of the bytes each one pinned. IT DOES NOT FREEZE THE
 * CALLOUTS: the paper prints the callouts the card holds NOW. That is the prototype's own division
 * (`70-actions.js:216-222` snapshots the plates; `:276` draws the shapes from live state at export),
 * and it is the division this build follows. A second, frozen copy of the callouts is exactly how
 * one signature comes to cover two different factory truths — the shop floor reading v3's frozen
 * note while the card's own callout says something else, with nothing on either piece of paper
 * admitting the other exists. The migration that would hold them (0342) is present on beta and is
 * deliberately left INERT: nothing here writes it and nothing here reads it.
 *
 * THE HOST IS MANDATORY AND ITS ABSENCE IS LOUD. Minting without settling the form is not a
 * degraded mint, it is a destructive one: `withServerAssignedValues` exists because a sign-off's
 * `signedDigest` left blank in form state MEANS «approve this now», and every later save in the
 * page session would silently re-bless the section. So a missing host refuses the mint in words
 * rather than minting without the settle.
 */

/** The two sides a sheet cannot be minted without. Read from ONE place; the mint checks it too. */
export const SHEET_MINIMUM = ['front', 'back'] as const;

export const VIEW_LABELS: Record<string, string> = {
  front: 'FRONT',
  back: 'BACK',
  side_l: 'SIDE L',
  side_r: 'SIDE R',
};

/** The four silhouette sides, in reading order. `detail` is not one of them — it is a slot maker. */
export const SILHOUETTE_VIEWS = ['front', 'back', 'side_l', 'side_r'] as const;

/**
 * THE DOOR ADDRESS OF A BENCH SLOT.
 *
 * `revealField` (`utils/field-errors`) is a DOM query over `[data-field]`, not a form lookup — it
 * walks to «the rendered thing at this address» and pulses it, and the tech card's whole
 * refusal-leads-to-the-place behaviour is built on it. The bench is server state and owns no form
 * path, so the band states its own addresses here, once, and the bench organ stamps them. Inheriting
 * the mechanism costs one attribute; rebuilding it costs a second scroll-and-pulse that drifts.
 */
export function benchDoor(slot: { viewKey?: string; id?: number }): string {
  const view = (slot.viewKey ?? '').trim();
  if (view && view !== 'detail') return `design.bench.${view}`;
  return `design.bench.slot.${slot.id ?? 0}`;
}

/** Walk to a door; say where it was when the door is not on screen (a closed tab, a legacy card). */
export function openDoor(path: string, where: string, say: (m: string, t: 'error') => void): void {
  if (revealField(path)) return;
  say(`${where} — it is not on this tab`, 'error');
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The composition: what the bench holds, and what a version froze.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type BenchSlots = {
  /** view_key → slot, for the four silhouettes only. */
  byView: Map<string, common_DesignBenchSlot>;
  /** Detail slots, in the order the band listed them. */
  details: common_DesignBenchSlot[];
  /** Every slot, silhouette and detail alike — what `expected_plates` is built from. */
  all: common_DesignBenchSlot[];
};

export function readBench(band: GetDesignBandResponse): BenchSlots {
  const byView = new Map<string, common_DesignBenchSlot>();
  const details: common_DesignBenchSlot[] = [];
  const all = band.bench ?? [];
  for (const slot of all) {
    const view = (slot.viewKey ?? '').trim();
    if (view && view !== 'detail') byView.set(view, slot);
    else details.push(slot);
  }
  return { byView, details, all };
}

/** A slot holds a plate when it points at a picture AND the band resolved that picture for us. */
export function slotIsFilled(slot?: common_DesignBenchSlot): boolean {
  return !!slot && (slot.pictureId ?? 0) > 0 && !!slot.picture;
}

/** Which of the two required sides are still empty. The mint's `sheet_min_unmet`, read early. */
export function sheetMinimumMissing(bench: BenchSlots): string[] {
  return SHEET_MINIMUM.filter((v) => !slotIsFilled(bench.byView.get(v)));
}

export function benchMinimumMet(bench: BenchSlots): boolean {
  return sheetMinimumMissing(bench).length === 0;
}

/** Every media id standing on the bench right now — the set a callout must be pinned inside. */
export function benchMediaIds(bench: BenchSlots): Set<number> {
  const ids = new Set<number>();
  for (const slot of bench.all) {
    const id = slot.picture?.media?.id ?? 0;
    if (id > 0) ids.add(id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// Г6 — ONE source of «what would change», and it counts DETAILS as well as sides.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type DiffRow = {
  key: string;
  name: string;
  /** Media id the version froze, or null when the version had nothing in this place. */
  from: number | null;
  /** Media id standing on the bench now, or null when the bench has emptied the place. */
  to: number | null;
  changed: boolean;
  /**
   * Same media, different bytes-or-drawing: the plate froze a hash / layer revision that the live
   * picture has since moved past. It counts as changed — the paper would print something else.
   */
  stale: boolean;
};

function plateKey(plate: common_DesignSheetPlate): string {
  const view = (plate.viewKey ?? '').trim();
  if (view && view !== 'detail') return `view:${view}`;
  return `slot:${plate.slotId ?? 0}`;
}

function slotKey(slot: common_DesignBenchSlot): string {
  const view = (slot.viewKey ?? '').trim();
  if (view && view !== 'detail') return `view:${view}`;
  return `slot:${slot.id ?? 0}`;
}

/**
 * The rows the divergence plate counts and the mint's «what would change» lists — the SAME rows,
 * from one function, because Г6 is precisely the bug where the plate counted sides and the modal
 * forgot the details, so «unchanged» and «3 changed» could both be on screen at once.
 *
 * Compared BY MEDIA ID, which is the only identity the two sides share: a version freezes plates
 * (`media` + `content_hash`), the bench holds pictures. «Same media» is also the honest question —
 * it is what decides whether the paper would look different.
 */
export function benchDiffRows(
  version: common_DesignSheetVersion | undefined,
  bench: BenchSlots,
): DiffRow[] {
  if (!version) return [];
  const plates = new Map<string, common_DesignSheetPlate>();
  for (const plate of version.plates ?? []) plates.set(plateKey(plate), plate);

  const rows: DiffRow[] = [];
  const push = (
    key: string,
    name: string,
    plate?: common_DesignSheetPlate,
    slot?: common_DesignBenchSlot,
  ) => {
    const from = plate?.media?.id ?? null;
    const to = slot?.picture?.media?.id ?? null;
    // A plate that froze the same media may still be stale — someone advanced the drawing behind it
    // or replaced the bytes. `plateStaleReason` returns null when the answer is UNKNOWABLE (an empty
    // hash on either side), so a media that predates 0336 does not light this up.
    const stale =
      from !== null &&
      from === to &&
      !!plate &&
      plateStaleReason(readProvenance(plate), {
        layerRev: slot?.picture?.layerRev,
        contentHash: slot?.picture?.media?.contentHash,
      }) !== null;
    rows.push({ key, name, from, to, changed: from !== to || stale, stale });
  };

  for (const view of SILHOUETTE_VIEWS) {
    const key = `view:${view}`;
    const plate = plates.get(key);
    const slot = bench.byView.get(view);
    plates.delete(key);
    if (!plate && !slotIsFilled(slot)) continue;
    push(key, VIEW_LABELS[view] ?? view.toUpperCase(), plate, slot);
  }

  for (const slot of bench.details) {
    const key = slotKey(slot);
    const plate = plates.get(key);
    plates.delete(key);
    const name = (slot.detailName ?? '').trim() || (plate?.detailName ?? '').trim() || 'detail';
    if (!plate && !slotIsFilled(slot)) continue;
    push(key, name, plate, slot);
  }

  // Whatever the version froze that the bench no longer has a slot for: the slot was deleted, or the
  // plate is a detail the bench never grew back. The version outlives its slots on purpose — the
  // plate keeps a COPY of the name so the paper can still be explained a year later.
  for (const [key, plate] of plates) {
    const name = (plate.detailName ?? '').trim() || VIEW_LABELS[plate.viewKey ?? ''] || 'detail';
    push(key, name, plate, undefined);
  }

  return rows;
}

/** The names that changed, or null when the document still matches the version. */
export function benchDiverged(
  version: common_DesignSheetVersion | undefined,
  bench: BenchSlots,
): string[] | null {
  const changed = benchDiffRows(version, bench).filter((r) => r.changed);
  return changed.length ? changed.map((r) => r.name) : null;
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The mint's own analysis — what would freeze, and what stands in the way.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type MintGate = {
  kind: 'lock' | 'consent';
  id: 'sheet_min_unmet' | 'uploaded_fit' | 'mixed_consent' | 'unrepinned_callouts';
  text: string;
  /** For a lock: where the person has to go to clear it. */
  door?: { path: string; where: string };
};

export type UnrepinnedCallout = { index: number; number: number; text: string };

export type MintAnalysis = {
  /** The slots that would freeze, silhouettes first, then details — filled ones only. */
  plates: { key: string; name: string; slot: common_DesignBenchSlot }[];
  missing: string[];
  /** Plates brought by hand: they carry no fit of their own, so the mint has to ask. */
  uploadedCount: number;
  /** The composition mixes provenance classes, or carries a plate born of a mixed set. */
  mixed: boolean;
  mixedNote: string;
  unrepinned: UnrepinnedCallout[];
};

/**
 * The slice of a form callout the band reads. Deliberately a STRUCTURAL subset of `CalloutForm`
 * rather than the schema type itself: every organ here only ever reads these seven fields, and
 * naming the whole zod type would make this module refuse a callout that merely grew one.
 *
 * `posX` / `posY` are STRINGS on purpose — they are decimals on the wire and the form keeps them as
 * typed, so the reader parses rather than assuming a number arrived.
 */
export type CalloutLike = {
  number?: number;
  mediaId?: number;
  description?: string;
  part?: string;
  dimensions?: string;
  posX?: string;
  posY?: string;
};

export function analyseMint(bench: BenchSlots, callouts: CalloutLike[]): MintAnalysis {
  const plates: MintAnalysis['plates'] = [];
  for (const view of SILHOUETTE_VIEWS) {
    const slot = bench.byView.get(view);
    if (slotIsFilled(slot))
      plates.push({ key: `view:${view}`, name: VIEW_LABELS[view], slot: slot! });
  }
  for (const slot of bench.details) {
    if (!slotIsFilled(slot)) continue;
    plates.push({ key: slotKey(slot), name: (slot.detailName ?? '').trim() || 'detail', slot });
  }

  let uploadedCount = 0;
  const classes = new Set<string>();
  let carriesMixedInput = false;
  for (const { slot } of plates) {
    const provenance = readProvenance(slot.picture ?? {});
    if (provenance.batchId !== null) uploadedCount += 1;
    if (provenance.mixedInput) carriesMixedInput = true;
    classes.add(provenance.sourceClass);
  }
  const mixed = classes.size > 1 || carriesMixedInput;
  const mixedNote = carriesMixedInput
    ? 'one of the plates was produced from a mixed set and carries the flag'
    : [...classes].join(' + ');

  // A callout is orphaned when the picture it is pinned to is not in the composition. Geometry NEVER
  // migrates between two different pictures — a marker at (0.4, 0.6) on a new plate points somewhere
  // else on the garment — so the mint cannot carry it over and must not pretend to.
  const ids = benchMediaIds(bench);
  const unrepinned: UnrepinnedCallout[] = [];
  callouts.forEach((c, index) => {
    const mediaId = c.mediaId ?? 0;
    // An unanchored callout (media 0) is a note about the card, not a mark on a plate — it freezes
    // with the version wherever the version's plates are, and nothing has to be re-pinned.
    if (mediaId <= 0) return;
    if (ids.has(mediaId)) return;
    unrepinned.push({
      index,
      number: c.number ?? 0,
      text: (c.description ?? '').trim() || (c.part ?? '').trim() || 'no text',
    });
  });

  return {
    plates,
    missing: sheetMinimumMissing(bench),
    uploadedCount,
    mixed,
    mixedNote,
    unrepinned,
  };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The save host — the page's own machinery, handed down.
// ─────────────────────────────────────────────────────────────────────────────────────────────

export type DesignSaveSettle = (
  sent: TechCardFormData,
) => Promise<{ values: TechCardFormData; audit: unknown }>;

export type DesignSaveHost = {
  /**
   * The page's own `withServerAssignedValues`, verbatim. THE ONE MEMBER THAT CANNOT BE DERIVED, and
   * the reason this context exists at all: it is a closure over the page's form, its query client
   * and its staging queue, and a second copy of it would be a second opinion about what a saved
   * tech card is.
   */
  settle: DesignSaveSettle;
  /**
   * The page's live lock version, INCLUDING its «keep mine & overwrite» override
   * (`lockOverride.current ?? techCard?.lockVersion ?? 0`). Optional because the loaded card
   * carries the ordinary value; pass it so the recovery path overwrites the way it promises to.
   */
  expectedLockVersion?: number;
  /**
   * `usePermissions().canWriteCosting`. Optional — this file asks the same hook — but passing the
   * page's own answer keeps the two from disagreeing if the page ever narrows it further.
   */
  canWriteCosting?: boolean;
};

const DesignSaveHostContext = createContext<DesignSaveHost | null>(null);

/**
 * Wrap the tech-card form with this so the mint can save the way the page saves.
 *
 * In `index.tsx`, inside `<Form {...form}>`:
 *
 *   <DesignSaveHostProvider
 *     settle={withServerAssignedValues}
 *     expectedLockVersion={lockOverride.current ?? techCard?.lockVersion ?? 0}
 *     canWriteCosting={canWriteCosting}
 *   >
 *     … tabs …
 *   </DesignSaveHostProvider>
 */
export function DesignSaveHostProvider({
  canWriteCosting,
  expectedLockVersion,
  settle,
  children,
}: DesignSaveHost & { children: React.ReactNode }) {
  const value = useMemo<DesignSaveHost>(
    () => ({ canWriteCosting, expectedLockVersion, settle }),
    [canWriteCosting, expectedLockVersion, settle],
  );
  return <DesignSaveHostContext.Provider value={value}>{children}</DesignSaveHostContext.Provider>;
}

export function useDesignSaveHost(): DesignSaveHost | null {
  return useContext(DesignSaveHostContext);
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// The server's refusals, said in words a person can act on.
// ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The server's codes are the vocabulary — the same words this dialog uses for the gates it can
 * check itself, so a refusal that slips through a race names the reason the screen would have named
 * instead of opening a second dictionary.
 */
export function mintRefusalText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const raw = (error instanceof Error ? error.message : '') || '';
  const has = (code: string) => raw.includes(code);

  // THE VERSION WRITER MAY SIMPLY NOT BE THERE YET. grpc-gateway answers an unregistered path with
  // 501 and a proxy in front of it may turn that into 404 — the same pair `useDesignBand` reads as
  // «this binary does not speak design». Said plainly here, because «the mint did not go through»
  // over an absent handler sends somebody hunting for a bug in their own composition.
  if (status === 404 || status === 501 || has('Unimplemented'))
    return 'this server has no version writer yet — the mint is not deployed. Nothing was saved. Everything on this tab still works; only minting is unavailable.';

  if (status === 409) {
    if (has('bench_moved'))
      return 'the bench moved while this dialog was open — somebody put a different plate in a slot. Nothing was minted; the bench below has been re-read.';
    if (has('lock_version_mismatch'))
      return 'somebody saved this tech card first. Nothing was minted — reload the card, re-apply your edits, and mint again.';
    return 'somebody changed this first — nothing was minted.';
  }
  if (has('unrepinned_callouts')) {
    const numbers = raw.match(/\d+/g);
    return numbers?.length
      ? `callouts ${numbers.join(', ')} sit on pictures that are not in this composition. Re-pin or delete them on the sheet, then mint.`
      : 'some callouts sit on pictures that are not in this composition. Re-pin or delete them on the sheet, then mint.';
  }
  if (has('sheet_min_unmet'))
    return 'the sheet needs FRONT and BACK in their slots. Fill them on the bench, then mint.';
  if (has('fit_mismatch'))
    return 'a plate was drawn at a fit the card no longer states. One of the two is wrong and the sheet must not guess — carry the fit to the card first.';
  if (has('mixed_needs_consent'))
    return 'the composition mixes provenances — tick the consent box and mint again.';
  if (has('uploaded_fit_unconfirmed'))
    return 'the uploaded plates carry no fit of their own — confirm the card’s fit for them and mint again.';
  return raw || 'the mint did not go through';
}

// ─────────────────────────────────────────────────────────────────────────────────────────────

/** The act a version is born of. The contract knows four; this wave performs three. */
export type MintOrigin = 'callout' | 'print' | 'release';

const ORIGIN_NOTE: Record<MintOrigin, string> = {
  callout: 'the first callout wants a fixed address',
  print: 'printing wants a version',
  release: 'the release wants a version',
};

export function MintDialog({
  open,
  onOpenChange,
  techCardId,
  band,
  origin,
  disabled,
  onMinted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  techCardId: number;
  band: GetDesignBandResponse;
  /**
   * WHICH ACT is minting. Not decoration: `minted_via` is the version's own record of why it
   * exists, and the contract is explicit that «a version is a by-product of an act, never a
   * ceremony of its own» — which is why there is no bare «mint» origin here.
   */
  origin: MintOrigin;
  disabled?: boolean;
  /** Called with the new version number, so the caller can journal its own act on top of it. */
  onMinted?: (versionNumber: number) => void;
}) {
  const form = useFormContext<TechCardFormData>();
  const host = useDesignSaveHost();
  const speaks = serverSpeaksDesign();
  const permissions = usePermissions();
  const queryClient = useQueryClient();
  const { showMessage } = useSnackBarStore();
  const writes = useDesignWrites(techCardId);
  // THE SAME CACHE ENTRY THE PAGE READS AND RE-PRIMES after every save — one read, one object, no
  // second fetch. `techCard.techCard` is what the write mapper echoes untouched fields from; without
  // it a full-replace payload built from the form alone wipes every field the form does not model.
  const { data: card } = useTechCard(techCardId);

  const callouts = useWatch({ control: form.control, name: 'callouts' }) as
    | CalloutLike[]
    | undefined;

  const bench = useMemo(() => readBench(band), [band]);
  const analysis = useMemo(() => analyseMint(bench, callouts ?? []), [bench, callouts]);

  const [mixedConsent, setMixedConsent] = useState(false);
  const [uploadedFit, setUploadedFit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  /**
   * ONE id PER INTENT, and it must survive a retry. `client_request_id` is the server's idempotency
   * key: minting it inside the call would hand a fresh id to every retry and the server would
   * honestly create a second version. It is re-minted when the dialog opens, not when it renders.
   */
  const requestId = useRef<string>('');
  const armedFor = useRef<boolean>(false);
  if (open && !armedFor.current) {
    requestId.current = newClientRequestId();
    armedFor.current = true;
  }
  if (!open && armedFor.current) armedFor.current = false;

  const next = (band.latestVersion?.versionNumber ?? 0) + 1;
  const fit = (useWatch({ control: form.control, name: 'fit' }) as string | undefined) ?? '';

  // A LOCK IS SOMETHING THAT CANNOT BE CONSENTED AWAY. Since a version freezes the plates and not
  // the callouts, a callout pinned to a picture outside the composition is not a corruption to be
  // prevented — it is a mark that will not appear on the paper, which is a thing to be TOLD rather
  // than blocked. The server may still refuse it (`unrepinned_callouts`); that refusal is caught
  // and read out below instead of being pre-empted by a client-side rule that outranks it.
  const locked = analysis.missing.length > 0 || !host;
  const consentsMet =
    (!analysis.mixed || mixedConsent) && (analysis.uploadedCount === 0 || uploadedFit);
  const ready = !locked && consentsMet && !disabled;

  const blockedReason = !host
    ? 'the mint is not wired to this card’s save path'
    : analysis.missing.length
      ? `fill the empty ${analysis.missing.map((v) => VIEW_LABELS[v]).join(' and ')} slot first`
      : !consentsMet
        ? 'tick the boxes above'
        : '';

  async function doMint() {
    if (!ready || !host) return;
    setBusy(true);
    setRefusal(null);
    try {
      const values = form.getValues();
      // THE SAME BUILDER THE PAGE'S OWN SUBMIT CALLS — see the file header. `original` is what keeps
      // a full-replace write from wiping every field the form does not model; `canWriteCosting`
      // keeps a non-costing editor from blanking the costing block.
      const insert = mapFormToTechCardInsert(
        values,
        card?.techCard,
        host.canWriteCosting ?? permissions.canWriteCosting,
      );
      // And the same capability gate the ordinary save is (to be) built with. Identity when the
      // server speaks design, which it does whenever this dialog is reachable — carried anyway so
      // the two payload paths cannot diverge on a rolled-back binary.
      const { payload } = gateTechCardPayload(insert, { serverSpeaksDesign: speaks });

      // `kind` names WHICH BENCH the address belongs to; the bench became two-axis (view × kind)
      // in 0349, so a bare view no longer identifies one slot. The sheet is a FLAT sheet by
      // definition — the server's composeMintPlates filters to flats — so naming anything else
      // here would ask to freeze a plate the mint will refuse.
      const expectedPlates: DesignExpectedPlate[] = bench.all.map((slot) => ({
        slot:
          (slot.id ?? 0) > 0
            ? { slotId: slot.id, kind: 'flat' }
            : { viewKey: slot.viewKey, kind: 'flat' },
        slotRev: slot.slotRev ?? 0,
      }));

      const res = await adminService.MintDesignSheetVersion({
        techCardId,
        clientRequestId: requestId.current,
        techCard: payload,
        expectedLockVersion: host.expectedLockVersion ?? card?.lockVersion ?? 0,
        expectedPlates,
        mixedConsent: analysis.mixed ? mixedConsent : false,
        uploadedFitConfirmed: analysis.uploadedCount > 0 ? uploadedFit : false,
        mintedVia: origin,
      });

      const minted = res.version?.versionNumber ?? next;

      // THE SETTLE, and it is the page's own. The document was written by the same code path as
      // UpdateTechCard, so everything the server assigns — sign-off digests above all — has to come
      // back into the form. Leaving the form on what was SENT re-approves sections on every later
      // save of the session.
      const settled = await host.settle(values);
      form.reset(settled.values);

      queryClient.invalidateQueries({ queryKey: designKeys.band(techCardId) });
      queryClient.invalidateQueries({ queryKey: techCardKeys.detail(techCardId) });

      showMessage(`sheet v${minted} minted`, 'success');
      onMinted?.(minted);
      onOpenChange(false);
    } catch (error) {
      const text = mintRefusalText(error);
      setRefusal(text);
      // A lost bench race must not leave a stale bench on screen for the retry to mint from.
      if ((error as { status?: number } | null)?.status === 409) writes.invalidate();
    } finally {
      setBusy(false);
    }
  }

  return (
    <ConfirmationModal
      open={open}
      onOpenChange={onOpenChange}
      onConfirm={doMint}
      closeOnConfirm={false}
      title={`mint sheet v${next}`}
      confirmLabel={busy ? 'minting…' : `mint v${next}`}
      cancelLabel={locked ? 'close' : 'cancel'}
      confirmDisabled={!ready || busy}
      footerHint={ready ? ORIGIN_NOTE[origin] : blockedReason}
      width='lg'
    >
      <div className='space-y-stack'>
        {!host && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              <b>the mint is not wired to this card’s save path.</b> A version is written by the
              same transaction that saves the document, so it cannot be minted without the page’s
              own settle step — minting without it would leave every sign-off on this card
              re-approving itself on the next save. Mount the tab inside{' '}
              <code>DesignSaveHostProvider</code>.
            </Text>
          </CalloutBox>
        )}

        {refusal && (
          <CalloutBox tone='error'>
            <Text size='micro' component='p'>
              {refusal}
            </Text>
          </CalloutBox>
        )}

        <div>
          <GroupLabel flush>
            composition
            <span className='ml-2 font-normal normal-case text-labelColor'>
              a frozen snapshot of the slots — later slot clicks will not touch it
            </span>
          </GroupLabel>
          {analysis.plates.length === 0 ? (
            <Text size='micro' variant='label' component='p'>
              nothing stands on the bench
            </Text>
          ) : (
            <div className='grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4'>
              {analysis.plates.map((plate) => {
                const provenance = readProvenance(plate.slot.picture ?? {});
                const url = plate.slot.picture?.media?.media?.thumbnail?.mediaUrl ?? '';
                return (
                  <div key={plate.key} className='min-w-0 border border-borderColor p-1'>
                    <Text
                      size='nano'
                      variant='uppercase'
                      tracking='label'
                      component='p'
                      className='truncate'
                    >
                      {plate.name}
                    </Text>
                    {/* мат под снимком белый (R-12); пустоту называет СЛОВО, как в band-feed —
                        белая ячейка без него читалась бы как «белая картинка» */}
                    <div className='mt-1 aspect-[4/5] w-full bg-bgColor'>
                      {url ? (
                        <img
                          src={url}
                          alt={plate.name}
                          className='h-full w-full object-contain'
                          loading='lazy'
                        />
                      ) : (
                        <span className='flex h-full w-full items-center justify-center'>
                          <Text size='nano' variant='label' component='span'>
                            no image
                          </Text>
                        </span>
                      )}
                    </div>
                    <Text
                      size='nano'
                      variant='label'
                      component='p'
                      className='mt-1 truncate'
                      title={provenanceLabel(provenance)}
                    >
                      {provenanceLabel(provenance)}
                    </Text>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {(analysis.missing.length > 0 || analysis.uploadedCount > 0 || analysis.mixed) && (
          <div>
            <GroupLabel>before it freezes</GroupLabel>
            <div className='space-y-1'>
              {/* A LOCK IS NOT A CHECKBOX. The sheet minimum cannot be consented away, so its row
                  carries a door instead of a box — Г10: the mint used to name STUDIO and offer no
                  way to get there. */}
              {analysis.missing.map((view) => (
                <div key={view} className='flex items-start gap-2 border-b border-hairline py-1'>
                  <span className='select-none text-error'>✕</span>
                  <Text size='micro' component='p' className='min-w-0 flex-1'>
                    the sheet needs {VIEW_LABELS[view]} — the slot is empty.
                  </Text>
                  <Button
                    variant='secondary'
                    size='xs'
                    disabled={disabled}
                    onClick={() =>
                      openDoor(
                        benchDoor({ viewKey: view }),
                        `the ${VIEW_LABELS[view]} slot is on the bench`,
                        showMessage,
                      )
                    }
                  >
                    go to the slot
                  </Button>
                </div>
              ))}

              {analysis.uploadedCount > 0 && (
                <label className='flex items-start gap-2 border-b border-hairline py-1'>
                  <CheckboxCommon
                    name='mint-uploaded-fit'
                    checked={uploadedFit}
                    disabled={disabled}
                    onChange={setUploadedFit}
                    className='mt-0.5'
                  />
                  <Text size='micro' component='span' className='min-w-0 flex-1'>
                    uploaded plates: drawn at fit? — confirm the card’s «{fit || 'unstated'}» for{' '}
                    {analysis.uploadedCount} hand plate
                    {analysis.uploadedCount === 1 ? '' : 's'}. A hand-brought file states no fit of
                    its own, so nobody but you can answer this.
                  </Text>
                </label>
              )}

              {analysis.mixed && (
                <label className='flex items-start gap-2 border-b border-hairline py-1'>
                  <CheckboxCommon
                    name='mint-mixed-consent'
                    checked={mixedConsent}
                    disabled={disabled}
                    onChange={setMixedConsent}
                    className='mt-0.5'
                  />
                  <Text size='micro' component='span' className='min-w-0 flex-1'>
                    I accept the mixed composition ({analysis.mixedNote}).
                  </Text>
                </label>
              )}
            </div>
          </div>
        )}

        {analysis.unrepinned.length > 0 && (
          <div>
            <GroupLabel>
              off the sheet
              <span className='ml-2 font-normal normal-case text-labelColor'>
                {analysis.unrepinned.length} callout
                {analysis.unrepinned.length === 1 ? '' : 's'} pinned outside this composition
              </span>
            </GroupLabel>
            <CalloutBox tone='warning' className='mb-1'>
              <Text size='micro' component='p'>
                These callouts are pinned to pictures this composition does not contain, so{' '}
                <b>they will not appear on the paper</b> — the plate they mark is not on the sheet.
                Geometry never migrates between two different pictures (a marker at the same
                coordinates on another plate points at another part of the garment), so nothing here
                carries them over. Re-pin or delete each one, or mint knowing they stay off the
                print.
              </Text>
            </CalloutBox>
            {analysis.unrepinned.map((c) => (
              <div key={c.index} className='flex items-center gap-2 border-b border-hairline py-1'>
                <Text size='nano' variant='uppercase' component='span' className='w-6 shrink-0'>
                  {c.number || '—'}
                </Text>
                <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
                  «{c.text}»
                </Text>
                <Button
                  variant='secondary'
                  size='xs'
                  disabled={disabled}
                  onClick={() =>
                    openDoor(
                      `callouts.${c.index}.description`,
                      `callout ${c.number || c.index + 1} is on the sheet`,
                      showMessage,
                    )
                  }
                >
                  go to it
                </Button>
              </div>
            ))}
          </div>
        )}

        {band.latestVersion && (
          <div>
            <GroupLabel>
              what would change
              <span className='ml-2 font-normal normal-case text-labelColor'>
                v{band.latestVersion.versionNumber} → the bench
              </span>
            </GroupLabel>
            <DiffRows version={band.latestVersion} bench={bench} />
          </div>
        )}

        <Text size='micro' variant='label' component='p'>
          Minting saves the tech card in the same transaction — there is no second step and no
          separate «Save». What freezes is the COMPOSITION above: which pictures are on the sheet.
          The callouts are not frozen — paper always prints the ones the card holds at the moment it
          is printed, so correcting a note never needs a new version.
        </Text>
      </div>
    </ConfirmationModal>
  );
}

/** The Г6 rows, drawn. Shared by the mint and by the divergence plate on the tab. */
export function DiffRows({
  version,
  bench,
}: {
  version: common_DesignSheetVersion | undefined;
  bench: BenchSlots;
}) {
  const rows = useMemo(() => benchDiffRows(version, bench), [version, bench]);
  if (rows.length === 0) {
    return (
      <Text size='micro' variant='label' component='p'>
        —
      </Text>
    );
  }
  return (
    <div>
      {rows.map((row) => (
        <div key={row.key} className='flex items-center gap-2 border-b border-hairline py-1'>
          <Text size='micro' component='span' className='min-w-0 flex-1 truncate'>
            {row.name}
          </Text>
          <Text
            size='nano'
            variant={row.changed ? 'default' : 'label'}
            tracking='label'
            component='span'
            className='shrink-0 uppercase'
          >
            {!row.changed
              ? 'unchanged'
              : row.stale
                ? 'same picture, newer bytes'
                : row.from === null
                  ? 'added'
                  : row.to === null
                    ? 'emptied'
                    : 'replaced'}
          </Text>
        </div>
      ))}
    </div>
  );
}

/** `v3 · minted · T. · 14:41` — one line, so the journal and the sheet header spell it alike. */
export function issueLine(issue: {
  versionNumber?: number;
  action?: string;
  actor?: string;
  createdAt?: string;
}): string {
  return [
    `v${issue.versionNumber ?? 0}`,
    (issue.action ?? '').trim() || 'issued',
    (issue.actor ?? '').trim(),
    clockStamp(issue.createdAt),
  ]
    .filter(Boolean)
    .join(' · ');
}
