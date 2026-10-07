/**
 * PAINT THE PARTS · the painting session of one card: views, labels, materials, undo, autosave.
 *
 * Big pixel arrays live in a mutable session (one per card) and React re-renders off a version
 * counter (`useSyncExternalStore`). The session saves under ITS card: switching cards flushes the
 * old session to the old card, never to the new one.
 *
 * SAVE (decision 7 + review C): debounce after a gesture → upload the PNG of every dirty view →
 * SetDesignColourPlan under the rev we hold. The verb replaces the whole document, so on a rev
 * mismatch the band is re-read and ONLY our dirty views (and our colour rows) are laid over the
 * fresh document, once; a second conflict stops at `unsaved` — nothing is overwritten silently.
 */
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import type {
  GetDesignBandResponse,
  common_DesignColourMap,
  common_DesignFabricUse,
  common_DesignPartsPieces,
} from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useSnackBarStore } from 'lib/stores/store';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';

import { assetFull, assetThumb } from '../assets/model';
import {
  PLAN_BYTES_MAX,
  PLAN_CLOTHS_MAX,
  PLAN_MAPS_MAX,
  PLAN_PALETTE_MAX,
  readColourPlan,
  sendableMaps,
  writeCloth,
  writeMap,
  type ColourPlanDoc,
  type PlanCloth,
  type PlanMap,
} from '../colour-plan/model';
import { uploadRaster } from '../modals/use-edit-layer';
import { bindingsOf, boundAsset, type ClothSlot, type MaterialSlot } from '../pattern/slot-fabrics';
import { trimPictogramKind, type TrimPictogramKind } from '../pattern/trim-pictograms';
import { benchSides, renderSheetViews } from '../render/model';
import { designKeys } from '../use-design-band';
import {
  anyPainted,
  exportLabels,
  freeColourLabel,
  hardwareInstancesAll,
  hexOf,
  labelsFromMap,
  mapPixels,
  packHex,
  paintSize,
  redoDiff,
  slotLabels,
  undoDiff,
  type HardwareInstance,
} from './map-model';
import {
  concatIndices,
  clearOpenings,
  dropOpenings,
  openingRegion,
  adoptEdges,
  heldPartsFresh,
  partsAskKey,
  fixBands,
  fixSides,
  innerLayerPart,
  gestureLive,
  isUnnamed,
  keyedSuggestion,
  labelKeys,
  markFontPx,
  markPoints,
  marksTint,
  paintGesture,
  paintedPartNames,
  partIndices,
  partAcross,
  partNamesByLabel,
  partsOf,
  PARTS_ALGO_REV,
  PARTS_REGIONS_MAX,
  PARTS_REGIONS_MIN,
  type Gesture,
  type ViewParts,
} from './parts-model';
import {
  clothTilePx,
  HARDWARE_TINT,
  MOCKUP_REV,
  mockupPixels,
  NO_GARMENT,
  viewScale,
  type Garment,
  type MockupHardware,
  type MockupSkin,
  type Picture,
  type ViewScale,
} from './mockup';
import { hardwarePartsText, remainderCloth, remainderUse } from './plan-run';
import { analyseFlat, REGIONS_ALGO_REV, withOpenings, type FlatRegions } from './regions';
import { dec, num, strayMarks, type StrayMark } from './artworks';
import {
  carryOutcome,
  inkBox,
  mapDrawBox,
  transferMap,
  transferPoints,
  type FracBox,
} from './transfer';
import { viewLabel } from '../views';

/** `artwork` (R7): the armed artwork is placed on the flats as a box; the paint stays as is. */
export type PaintTool = 'click' | 'pen' | 'erase' | 'artwork';

export type PaintView = {
  view: string;
  baseMediaId: number;
  status: 'loading' | 'ready' | 'error';
  /**
   * The flat's regions as painting sees them: the cut (`cut`), grown again once the side's parts
   * are known so that only cloth takes the strip the closing ate — never an opening (v5).
   */
  flat: FlatRegions | null;
  /** v5 · the flat's regions as cut, before any parts: what the labeller is shown. */
  cut: FlatRegions | null;
  /** The flat's own pixels at canvas size — the paper under the paint. */
  pixels: ImageData | null;
  /** Natural size of the flat (aspect while loading). */
  aspect: number;
  labels: Uint32Array | null;
  dirty: boolean;
  /** The saved map our pixels stand on (0 = none). Another map there now = someone else's work. */
  mapBase: number;
  /** Bumped on every pixel change — the canvas redraws off it. */
  rev: number;
  /**
   * R9 fix 4 · bumped only when the LABEL RASTER (or what reads as hardware on it, or the ink the
   * export looks through) changes — never on a texture, a colour or a scale. The hardware caches
   * (instances, export) key on it.
   */
  labelRev: number;
  /** The model's parts over this flat's regions (auto parts); null = regions only (Ф1). */
  parts: ViewParts | null;
  /** The suggestion row `parts` came from (re-read only when it changes). */
  partsSig: string;
  /**
   * D2 · the pixels hold paint carried from a replaced flat: a DRAFT — never saved by opening the
   * page; the person's next gesture on the side saves it. Openings are cleared as parts arrive.
   */
  carried?: boolean;
  /** The pieces list's rev `parts` were named under (c9, M6): another rev now → asked again. */
  partsPiecesRev?: number;
};

/**
 * One thing to paint with: a slot's bound cloth, a free colour, or (R9) a hardware slot — its
 * colourway picture or none (then the slot's pictogram on the tile, words in the run).
 */
export type PaintMaterial = {
  label: string;
  kind: 'slot' | 'colour';
  /** R9 · `hardware` paints over cloth and is never painted over by it. */
  family: 'cloth' | 'hardware';
  name: string;
  bomItemId: number;
  /** Texture picture (slot) or ''. */
  url: string;
  /** The colour (colour label) or ''. */
  colourHex: string;
  /** The cloth's repeat in mm (0 = a swatch picture). */
  repeatMm: number;
  /** R9 · the hardware slot's pictogram (the tile's face without a picture). */
  pictogram?: TrimPictogramKind;
};

export type PaintSaveState = 'idle' | 'pending' | 'saving' | 'unsaved' | 'error';

/**
 * A material's look on the canvas: its picture (aspect kept) laid at its repeat, or a colour.
 * R9 · `hardware`: the picture is fitted to each instance's box instead (or the neutral tint).
 */
export type PaintSkin = {
  tile: ImageData | null;
  hex: string;
  repeatMm?: number;
  hardware?: boolean;
};

const DEBOUNCE_MS = 1200;
/** The canvas's copy of a cloth picture: its long side, px (the mockup reads it at 1024). */
const TILE = 256;

/** T29 · one artwork mark's move from its old picture onto a side's flat — tried once a session. */
const markKey = (m: StrayMark, pictureId: number) =>
  `art:${m.placement.id ?? 0}:${m.picture.id ?? 0}>${pictureId}`;

async function pixelsOf(url: string, w?: number, h?: number): Promise<ImageData> {
  const blob = await fetchMediaBlob(url);
  // Exact bytes: a map's labels must come back to the hex they were saved as.
  const bmp = await createImageBitmap(blob, {
    colorSpaceConversion: 'none',
    premultiplyAlpha: 'none',
  });
  const size = w && h ? { w, h } : paintSize(bmp.width, bmp.height);
  const canvas = document.createElement('canvas');
  canvas.width = size.w;
  canvas.height = size.h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bmp, 0, 0, size.w, size.h);
  bmp.close();
  return ctx.getImageData(0, 0, size.w, size.h);
}

/** The marks picture the model reads (as `f0/som.py marks()`), as a PNG data URL. */
function marksPng(flat: FlatRegions, seeds: Int32Array): string {
  const canvas = document.createElement('canvas');
  canvas.width = flat.w;
  canvas.height = flat.h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.putImageData(new ImageData(marksTint(flat), flat.w, flat.h), 0, 0);
  const px = markFontPx(flat.w, flat.h);
  ctx.font = `${px}px Menlo, Monaco, 'Courier New', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, Math.round(px / 3.5));
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = 'rgb(220,0,0)';
  for (let r = 1; r < seeds.length; r += 1) {
    const s = seeds[r];
    if (s < 0) continue;
    const x = (s % flat.w) + 0.5;
    const y = ((s / flat.w) | 0) + 0.5;
    ctx.strokeText(String(r), x, y);
    ctx.fillText(String(r), x, y);
  }
  return canvas.toDataURL('image/png');
}

/** A cloth's picture for the mockup: its own pixels, the long side capped at 1024. */
async function clothPixels(url: string): Promise<ImageData> {
  const blob = await fetchMediaBlob(url);
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, 1024 / Math.max(1, bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

/** The whole picture, as the mockup lays it (aspect kept, not cropped), long side ≤ TILE. */
async function tileOf(url: string): Promise<ImageData> {
  const blob = await fetchMediaBlob(url);
  const bmp = await createImageBitmap(blob);
  const s = Math.min(1, TILE / Math.max(1, bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * s));
  const h = Math.max(1, Math.round(bmp.height * s));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  ctx.drawImage(bmp, 0, 0, w, h);
  bmp.close();
  return ctx.getImageData(0, 0, w, h);
}

function pngOf(rgba: Uint8ClampedArray, w: number, h: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0);
  return canvas.toDataURL('image/png');
}

function refusalText(e: unknown): string {
  const status = (e as { status?: number } | null)?.status;
  const raw = e instanceof Error ? e.message : '';
  if (status === 404 || status === 501 || raw.includes('Unimplemented'))
    return 'this server has no colour plan yet';
  return raw || 'the parts did not save';
}

const isRevMismatch = (e: unknown): boolean => {
  const status = (e as { status?: number } | null)?.status;
  const raw = e instanceof Error ? e.message : String(e ?? '');
  return status === 409 || raw.includes('colour_plan_rev_mismatch') || raw.includes('Aborted');
};

export class PaintSession {
  readonly techCardId: number;
  private qc: QueryClient;
  private listeners = new Set<() => void>();
  private version = 0;

  views = new Map<string, PaintView>();
  materials: PaintMaterial[] = [];
  skins = new Map<string, PaintSkin>();
  colours: { label: string; colourHex: string }[] = [];
  /** Colour labels created or changed here since the last successful save — the only rows we own. */
  private dirtyColours = new Set<string>();
  private lastSlots: readonly ClothSlot[] | undefined;
  private lastHardware: readonly MaterialSlot[] | undefined;
  private lastColorway = 0;
  /** R9 · hardware label (packed) → its slot. */
  private hardwareSlots = new Map<number, MaterialSlot>();
  /** R9 · instances per side and label, keyed by the side's rev. */
  private instances = new Map<string, { rev: number; all: Map<number, HardwareInstance[]> }>();
  /** R9 · the labels as the model's map carries them, per side (keyed by its rev). */
  private exported = new Map<string, { rev: number; labels: Uint32Array }>();
  /** R9 · the exported colour maps of one exact set of maps → their media (one press, one id). */
  private exportCache = new Map<
    string,
    Map<string, { mediaId: number; palette: common_DesignColourMap['palette'] }>
  >();
  /** R9 · the drawn exported maps (PNG data URLs by view) of one signature. */
  private exportDrawn = new Map<
    string,
    Promise<Map<string, { png: string; palette: PlanMap['palette'] }>>
  >();
  armed = '';
  tool: PaintTool = 'click';
  /** R7 · the artwork asset a drag on a side places (0 = none armed). */
  armedArtwork = 0;
  save: PaintSaveState = 'idle';
  saveError = '';

  private undoStack: Gesture[] = [];
  private redoStack: Gesture[] = [];
  /** Auto parts asked once per (the sides' flats, cutter) in this session. */
  private asked = new Set<string>();
  /** The card-level auto parts asked and refused: one `parts · retry` for the block. */
  partsFailed = '';
  /** QW5 · the card-level auto parts are being asked right now (`naming…`). */
  naming = false;
  /** Bumped whenever any side's parts change: GENERATE re-checks it before it launches. */
  partsGen = 0;
  /** QW2 · what the card's size chart says of the garment (the scale of every side). */
  garment: Garment = NO_GARMENT;
  private scales = new Map<string, { key: string; scale: ViewScale }>();
  private remainderAt = { key: '', label: '' };
  private labelSets = new Map<string, { rev: number; set: Set<string> }>();
  /**
   * GENERATE is preparing (flush → mockups → launch): no gesture, no colour change, no undo — the
   * maps and the plan the run is built from must not move underneath it.
   */
  frozen = false;
  /** The cloth mockups of one exact set of outgoing maps → their media, reused on a retry so
   *  the same press keeps the same recipe and idempotency key. Only a full set is kept. */
  private mockCache = new Map<string, Map<string, number>>();
  /** The drawn mockups (PNG data URLs by view) of one signature — the press and the preview. */
  private mockDrawn = new Map<string, Promise<Map<string, string>>>();
  /** Uploaded mockups' pictures by media id (WHAT THE MODEL GETS thumbnails). */
  mockUrls = new Map<number, string>();
  /** The part under the pointer (R17): the same part is tinted on every side; `only` (⇧, QW6)
   *  keeps it on this side. */
  hovered: { view: string; group: number; only: boolean } | null = null;
  /** `paintedPartNames` per side, keyed by what it was read from. */
  private namesCache = new Map<string, { key: string; names: Map<number, string[]> }>();
  /** Sides a part click just painted by name (R9) — lit for a moment. */
  flash = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inflight: Promise<boolean> | null = null;
  private again = false;
  /** The newest plan we know: our own save's answer, or the band's, whichever rev is higher. */
  private echo: ColourPlanDoc | null = null;
  private band: GetDesignBandResponse | null = null;
  private slotLabel = new Map<number, string>();
  private skinLoading = new Set<string>();
  /**
   * T28 · sides whose saved map stands on a replaced flat, while its paint is carried onto the new
   * one (`transfer.ts`). Such a side stays `loading` — not paintable — until the paint lands.
   */
  private moving = new Set<PaintView>();
  /** Sides whose artwork marks are moving to a new flat (T29). */
  private artMoving = new Set<PaintView>();
  /**
   * The carries of this round, for ONE line once the last one lands: view → paint moved (null = no
   * paint was carried), artwork marks moved, marks that could not be moved.
   */
  private moved = new Map<string, { paint: boolean | null; art: number; artLeft: number }>();
  /** `view:map:old>new` / `art:mark:old>new` carried in this session — tried once, never twice. */
  private carried = new Set<string>();

  constructor(techCardId: number, qc: QueryClient) {
    this.techCardId = techCardId;
    this.qc = qc;
  }

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };
  getVersion = () => this.version;
  private bump() {
    this.version += 1;
    for (const fn of this.listeners) fn();
  }

  /**
   * Label hex → the part names painted with it, read from the SAVED maps the run sends: a side
   * counts only while its pixels are exactly that map (not dirty, standing on that map's media,
   * over that flat) and it has named parts. Sides in sheet order (front → back → sides).
   */
  partNames(): Map<string, string> {
    const plan = this.plan();
    if (!plan || !this.band) return new Map();
    const order = renderSheetViews(this.band);
    const maps = [...sendableMaps(this.band, plan)].sort(
      (a, b) => order.indexOf(a.view) - order.indexOf(b.view),
    );
    const sides: Map<number, string[]>[] = [];
    for (const m of maps) {
      const v = this.views.get(m.view);
      if (!v || v.status !== 'ready' || v.dirty || !v.labels || !v.flat || !v.parts) continue;
      if (v.mapBase !== m.mediaId || v.baseMediaId !== m.baseMediaId) continue;
      const key = `${v.baseMediaId}|${m.mediaId}|${v.rev}|${v.partsSig}`;
      let hit = this.namesCache.get(v.view);
      if (hit?.key !== key) {
        hit = { key, names: paintedPartNames({ labels: v.labels, flat: v.flat, parts: v.parts }) };
        this.namesCache.set(v.view, hit);
      }
      sides.push(hit.names);
    }
    return partNamesByLabel(sides);
  }

  /** The plan the screen stands on (saved). */
  plan(): ColourPlanDoc | undefined {
    const fromBand = this.band ? readColourPlan(this.band) : undefined;
    if (fromBand === undefined) return this.echo ?? undefined;
    if (this.echo && this.echo.rev >= fromBand.rev) return this.echo;
    return fromBand;
  }

  /** The plan exists on this server at all (old binaries have no colour plan). */
  serves(): boolean {
    return !!this.band && this.band.colourPlan !== undefined;
  }

  canUndo = () => this.undoStack.length > 0;
  canRedo = () => this.redoStack.length > 0;
  /** A save is actually in flight or due (never only the flats loading: nothing is written then). */
  busy = () => this.save === 'pending' || this.save === 'saving' || this.timer !== null;
  /** Artwork marks of a replaced flat are moving (they are written as they land). */
  movingArt = () => this.artMoving.size > 0;

  /* ─────────────────────────── sync with the band ─────────────────────────── */

  sync(
    band: GetDesignBandResponse,
    slots: readonly ClothSlot[] | undefined,
    colorwayId: number,
    hardware?: readonly MaterialSlot[],
  ) {
    // M6 · the pieces list is drawn off the session (`pieces()`): a new list or a new read waiting
    // on the designer redraws the block even when nothing else moved.
    const piecesWas = JSON.stringify(this.band?.partsPieces ?? null);
    this.band = band;
    this.lastSlots = slots;
    this.lastHardware = hardware;
    this.lastColorway = colorwayId;
    let changed = piecesWas !== JSON.stringify(band.partsPieces ?? null);
    const list = (slots ?? []).filter((s) => s.bomItemId > 0);
    const hw = (hardware ?? []).filter(
      (s) => s.bomItemId > 0 && !list.some((c) => c.bomItemId === s.bomItemId),
    );
    // R9 · cloths first: appending hardware never re-steps a cloth label (saved maps hold).
    this.slotLabel = slotLabels(
      list.map((s) => s.bomItemId),
      hw.map((s) => s.bomItemId),
    );
    const hwWas = [...this.hardwareSlots.keys()].join(',');
    this.hardwareSlots = new Map();
    for (const s of hw) {
      const hex = this.slotLabel.get(s.bomItemId);
      if (hex) this.hardwareSlots.set(packHex(hex), s);
    }
    if (hwWas !== [...this.hardwareSlots.keys()].join(',')) {
      for (const v of this.views.values()) {
        v.rev += 1;
        v.labelRev += 1;
      }
      changed = true;
    }

    // Free colours: the plan's colour rows, plus colours added here and not yet painted.
    const plan = this.plan();
    for (const c of plan?.cloths ?? []) {
      if (c.assetId !== 0 || !c.colourHex) continue;
      const have = this.colours.find((x) => x.label === c.hex);
      if (!have) {
        this.colours.push({ label: c.hex, colourHex: c.colourHex });
        changed = true;
      } else if (!this.dirtyColours.has(c.hex) && have.colourHex !== c.colourHex) {
        // Not ours to keep: the canvas shows what GENERATE will send.
        have.colourHex = c.colourHex;
        this.skins.set(c.hex, { tile: null, hex: c.colourHex });
        for (const v of this.views.values()) v.rev += 1;
        changed = true;
      }
    }

    const materials: PaintMaterial[] = [];
    for (const { slot, asset } of bindingsOf(band, colorwayId, list)) {
      const label = this.slotLabel.get(slot.bomItemId);
      if (!label) continue;
      materials.push({
        label,
        kind: 'slot',
        family: 'cloth',
        name: slot.name,
        bomItemId: slot.bomItemId,
        url: assetThumb(asset),
        colourHex: (asset.colourHex ?? '').trim(),
        repeatMm: asset.repeatMm ?? 0,
      });
    }
    for (const c of this.colours)
      materials.push({
        label: c.label,
        kind: 'colour',
        family: 'cloth',
        name: c.colourHex,
        bomItemId: 0,
        url: '',
        colourHex: c.colourHex,
        repeatMm: 0,
      });
    // R9 · the hardware slots after the cloths, bound or not: a slot with no picture in this
    // colourway is armable too (the run sends it in words).
    for (const slot of hw) {
      const label = this.slotLabel.get(slot.bomItemId);
      if (!label) continue;
      const asset = boundAsset(band, colorwayId, slot.bomItemId);
      materials.push({
        label,
        kind: 'slot',
        family: 'hardware',
        name: slot.name,
        bomItemId: slot.bomItemId,
        url: asset ? assetThumb(asset) : '',
        colourHex: '',
        repeatMm: 0,
        pictogram: trimPictogramKind(slot),
      });
    }
    const sig = (m: PaintMaterial[]) =>
      m.map((x) => `${x.label}${x.family}${x.url}${x.colourHex}${x.repeatMm}`).join('|');
    if (sig(materials) !== sig(this.materials)) {
      this.materials = materials;
      changed = true;
    }
    if (!this.armed || !this.materials.some((m) => m.label === this.armed)) {
      const first = this.materials[0]?.label ?? '';
      if (first !== this.armed) {
        this.armed = first;
        changed = true;
      }
    }
    for (const m of this.materials) this.loadSkin(m);
    // Unbound painted slots still show: in their label colour (hardware: the neutral tint).
    for (const [, label] of this.slotLabel)
      if (!this.skins.has(label))
        this.skins.set(
          label,
          this.isHardware(packHex(label))
            ? { tile: null, hex: HARDWARE_TINT, hardware: true }
            : { tile: null, hex: label },
        );

    // Views: every side holding a flat.
    const seen = new Set<string>();
    const sides = benchSides(band);
    // T29 · artwork marks left on a side's previous flat, moved with its paint when the side opens.
    const strays = strayMarks(
      band,
      sides.map((side) => ({
        view: side.view,
        pictureId: side.picture?.id || side.slot?.pictureId || 0,
        mapBaseMediaId: plan?.maps.find((m) => m.view === side.view)?.baseMediaId ?? 0,
      })),
    );
    for (const side of sides) {
      const media = side.picture?.media;
      const id = media?.id ?? 0;
      const url = media?.media?.fullSize?.mediaUrl || media?.media?.compressed?.mediaUrl || '';
      if (id <= 0 || !url) continue;
      seen.add(side.view);
      const had = this.views.get(side.view);
      if (had && had.baseMediaId === id) continue;
      if (had?.dirty) void this.flush();
      const fw = media?.media?.fullSize?.width ?? 0;
      const fh = media?.media?.fullSize?.height ?? 0;
      this.openView(
        side.view,
        id,
        url,
        plan,
        fw > 0 && fh > 0 ? fw / fh : 0.6,
        side.picture?.id || side.slot?.pictureId || 0,
        strays.get(side.view) ?? [],
      );
      changed = true;
    }
    for (const view of [...this.views.keys()])
      if (!seen.has(view)) {
        this.views.delete(view);
        changed = true;
      }
    if (changed) this.prune();
    if (this.dropStaleParts()) changed = true;
    for (const v of this.views.values()) if (this.takeParts(v)) changed = true;
    if (this.hovered && !this.views.get(this.hovered.view)?.parts) {
      this.hovered = null;
      changed = true;
    }
    if (changed) this.bump();
    this.suggestCard();
  }

  /* ─────────────────────────── auto parts ─────────────────────────── */

  /** The band's suggestion row for this side's flat and this cutter. */
  private bandParts(v: PaintView) {
    return (this.band?.partsSuggestions ?? []).find(
      (s) =>
        s.view === v.view &&
        (s.baseMediaId ?? 0) === v.baseMediaId &&
        (s.algoRev ?? '') === PARTS_ALGO_REV,
    );
  }

  /**
   * What a side's laid parts depend on: its own row, and (f5) the card's whole answer and the join
   * list's layers — the L/R twins' keys and the inner layer come from them. Keys `namesCache` too.
   */
  private partsSigOf(
    row: Parameters<typeof partsOf>[0],
    rows: readonly Parameters<typeof partsOf>[0][],
  ): string {
    return JSON.stringify([
      row.parts,
      row.splitNeeded,
      [...labelKeys(rows)],
      innerLayerPart(rows, undefined),
    ]);
  }

  /** The band's rows of this cutter and labeller. */
  private bandRows() {
    return (this.band?.partsSuggestions ?? []).filter((s) => (s.algoRev ?? '') === PARTS_ALGO_REV);
  }

  /**
   * A row laid over the flat, then the Ф1 L/R check on the drawing (`fixSides`), then the f3 band
   * check (`fixBands`: a wide "binding" is an opening or a part's inside) — last, so an inside takes
   * its owner's name and key after the L/R swap (fixSides never moves an inside). f5: `rows` are the
   * card's whole answer — its inner layer part (or the join list's layer) takes a binding's blob.
   */
  private laid(
    row: Parameters<typeof partsOf>[0],
    flat: FlatRegions,
    seeds: Int32Array,
    view: string,
    rows: readonly Parameters<typeof partsOf>[0][],
  ): ViewParts | null {
    const parts = partsOf(row, flat, seeds, view);
    // M6: PARTS reads nothing of the join list — the inner layer is a part the labeller named.
    const layer = innerLayerPart(rows, undefined);
    return (
      parts && adoptEdges(fixBands(fixSides(view, parts, flat, labelKeys(rows)), flat, layer), flat)
    );
  }

  /**
   * M6 · the rev of the card's PIECES list now (0 = none): the labeller names only from it, so parts
   * answer for the rev they were named under (c9).
   */
  private piecesRev(): number {
    return this.band?.partsPieces?.rev ?? 0;
  }

  /** M6 · the card's pieces list (the closed names of PARTS), or undefined before the first read. */
  pieces(): common_DesignPartsPieces | undefined {
    return this.band?.partsPieces;
  }

  /**
   * M6 · the list as the server answered it, into the cached band. A new rev drops the band's rows
   * (they were named under the old one) until the band is read again — they would otherwise be laid
   * as answers for the new list.
   */
  private putPieces(p: common_DesignPartsPieces | undefined) {
    if (!p) return;
    this.qc.setQueryData<GetDesignBandResponse>(designKeys.band(this.techCardId), (old) => {
      if (!old) return old;
      const was = old.partsPieces;
      if (was && (was.rev ?? 0) > (p.rev ?? 0)) return old;
      const same = (was?.rev ?? 0) === (p.rev ?? 0);
      return { ...old, partsPieces: p, partsSuggestions: same ? old.partsSuggestions : [] };
    });
  }

  /**
   * M6 · the designer's list (`rename parts`): saved whole under `expectedRev` — the rev the draft
   * was made on (CAS); the parts are named again under the new rev. `settle` answers a pending read
   * of changed flats (its names = take, the list's own = keep). Throws the server's refusal (a list
   * that moved under the draft: Aborted).
   */
  async savePieces(names: string[], expectedRev: number, settle = false): Promise<void> {
    try {
      const res = await adminService.SetDesignPartsPieces({
        techCardId: this.techCardId,
        expectedRev,
        names,
        settleProposal: settle,
      });
      this.putPieces(res.pieces);
    } finally {
      // A refused rev: the list moved under the draft — read it again so the row shows the new one.
      void this.qc.invalidateQueries({ queryKey: designKeys.band(this.techCardId) });
    }
  }

  /**
   * The side has the card-level answer (Ф2.1 topology) for TODAY's join list; an older side-by-side
   * one is stale. The band shows only rows named under the list's current rev (server
   * `designPartsCurrentRows`); parts held in memory count only while the list has not moved since.
   */
  private partsFresh(v: PaintView): boolean {
    const row = this.bandParts(v);
    if (row && keyedSuggestion(row)) return true;
    return heldPartsFresh(v.parts, v.partsPiecesRev, this.piecesRev());
  }

  /**
   * Lay the band's suggestion for this flat over its regions. True when it changed. A stale row
   * (no `part_key`) still names the parts until the card-level answer comes, never over it.
   */
  private takeParts(v: PaintView): boolean {
    if (v.status !== 'ready' || !v.cut) return false;
    const row = this.bandParts(v);
    if (!row) return false;
    if (v.parts?.keyed && !keyedSuggestion(row)) return false;
    const rows = this.bandRows();
    const sig = this.partsSigOf(row, rows);
    if (sig === v.partsSig) return false;
    v.partsSig = sig;
    this.lay(v, this.laid(row, v.cut, v.parts?.seeds ?? markPoints(v.cut), v.view, rows));
    v.partsPiecesRev = this.piecesRev();
    this.partsGen += 1;
    this.clearOpenPaint(v);
    return true;
  }

  /**
   * The side's parts (null = none) and, v5, its regions grown again around them: only cloth takes
   * the strip the closing ate, an opening keeps only its own pixels (`withOpenings`).
   */
  private lay(v: PaintView, parts: ViewParts | null) {
    v.parts = parts;
    const flat = v.cut && parts ? withOpenings(v.cut, (r) => openingRegion(parts, r)) : v.cut;
    if (flat !== v.flat) {
      v.flat = flat;
      v.rev += 1;
      v.labelRev += 1;
    }
  }

  /**
   * D2 · paint never stands on an opening (M5: a hole is never cloth) — carried paint, and a map
   * saved before the hole was known (or painted while it was being named). Carried paint is saved
   * only if the person already kept it; their own map is saved again without the hole.
   */
  private clearOpenPaint(v: PaintView) {
    if (!v.labels || !v.flat || clearOpenings(v.labels, v.flat, v.parts) === 0) return;
    v.rev += 1;
    v.labelRev += 1;
    this.undoStack = this.undoStack.filter((g) => !g.some((st) => st.view === v.view));
    this.redoStack = this.redoStack.filter((g) => !g.some((st) => st.view === v.view));
    if (!v.carried) v.dirty = true;
    if (v.dirty) this.schedule();
  }

  /**
   * c9 · parts named under another pieces list (M6) are dropped (not painted through) the moment
   * the list moves: the band shows only rows of the current list, and a new answer is asked for.
   */
  private dropStaleParts(): boolean {
    const rev = this.piecesRev();
    let changed = false;
    for (const v of this.views.values())
      if (v.parts && v.partsPiecesRev !== undefined && v.partsPiecesRev !== rev) {
        this.lay(v, null);
        v.partsSig = '';
        v.partsPiecesRev = undefined;
        this.partsGen += 1;
        changed = true;
      }
    return changed;
  }

  /**
   * Ф2.1: once every side holding a flat is cut (or failed to load), ONE call names the parts of
   * all of them together — one part, one key, across the sides. Sides cut into fewer than 2 or more
   * than 60 regions are not sent. Asked once per set of flats in this session.
   */
  private suggestCard(again = false, force = false) {
    if (!this.band || this.naming) return;
    const all = [...this.views.values()];
    if (all.some((v) => v.status === 'loading')) return;
    const sides = all.filter(
      (v): v is PaintView & { cut: FlatRegions } =>
        v.status === 'ready' && !!v.cut && this.namable(v),
    );
    if (sides.length === 0 || (!force && sides.every((v) => this.partsFresh(v)))) return;
    const askRev = this.piecesRev();
    const key = partsAskKey(sides, askRev);
    if (this.asked.has(key) && !again) return;
    this.asked.add(key);
    this.partsFailed = '';
    this.naming = true;
    this.bump();
    const current = () => sides.every((v) => this.views.get(v.view) === v);
    let listMoved = false;
    void (async () => {
      try {
        const seeds = sides.map((v) => v.parts?.seeds ?? markPoints(v.cut));
        const media = await Promise.all(
          sides.map((v, i) => uploadRaster(marksPng(v.cut, seeds[i]))),
        );
        // The uploads took a while: a side changed (its own sync asks anew) or the answer came.
        if (!current()) return;
        if (!force && sides.every((v) => this.partsFresh(v))) {
          for (const v of sides) this.takeParts(v);
          return;
        }
        const res = await adminService.SuggestDesignPartsCard({
          techCardId: this.techCardId,
          algoRev: PARTS_ALGO_REV,
          force,
          views: sides.map((v, i) => ({
            view: v.view,
            baseMediaId: v.baseMediaId,
            marksMediaId: media[i].id ?? 0,
            regionCount: v.cut.count,
          })),
        });
        // M6 · the answer is named under the pieces list it carries — the server may have read
        // the list right now (a new card, new flats). The list moved under us otherwise (a save in
        // this or another tab while the model named): this answer is for the old one (asked anew).
        const namedRev = res.pieces?.rev ?? 0;
        const now = this.piecesRev();
        if (now !== askRev && now !== namedRev) {
          listMoved = true;
          return;
        }
        // The list the answer was named under, even if nothing of it can be laid (Codex M6): the
        // designer must be able to correct the names that failed. Laid below in this same tick, so
        // the sides carry `namedRev` before the band re-syncs.
        this.putPieces(res.pieces);
        let got = 0;
        for (const s of res.suggestions ?? []) {
          const i = sides.findIndex((v) => v.view === s.view);
          const v = sides[i];
          // Numbers mean something only for the cut that drew them: a suggestion for another
          // flat or algo rev would paint unrelated regions.
          if (!v || this.views.get(v.view) !== v) continue;
          if ((s.baseMediaId ?? 0) !== v.baseMediaId || s.algoRev !== PARTS_ALGO_REV) continue;
          const parts = this.laid(s, v.cut, seeds[i], v.view, res.suggestions ?? []);
          if (!parts) continue;
          this.lay(v, parts);
          v.partsSig = this.partsSigOf(s, res.suggestions ?? []);
          v.partsPiecesRev = namedRev;
          this.partsGen += 1;
          this.clearOpenPaint(v);
          got += 1;
        }
        if (got === 0) {
          if (!current()) return;
          throw new Error('the assistant answered nothing usable');
        }
        void this.qc.invalidateQueries({ queryKey: designKeys.band(this.techCardId) });
      } catch (e) {
        if (!current()) return;
        this.partsFailed = (e instanceof Error && e.message) || 'the parts were not named';
      } finally {
        this.naming = false;
        this.bump();
        if (listMoved) this.suggestCard();
      }
    })();
  }

  /**
   * QW5 · a side the model can name: cut into 1..60 regions (f6: one region is named too). Others
   * are the pen's only.
   */
  namable(v: PaintView): boolean {
    return !!v.cut && v.cut.count >= PARTS_REGIONS_MIN && v.cut.count <= PARTS_REGIONS_MAX;
  }

  /** f6 · the cutter found no region at all on a loaded side: said as it is, not «pen only». */
  cutFailed(v: PaintView): boolean {
    return v.status === 'ready' && !!v.cut && v.cut.count === 0;
  }

  /** `parts · retry` (one for the block). */
  retryParts() {
    if (!this.partsFailed) return;
    this.partsFailed = '';
    this.bump();
    this.suggestCard(true);
  }

  /** QW7 · `name again` (M6: inside `rename parts`): the model is asked again for every side, past its cache. */
  canNameAgain(): boolean {
    return (
      !this.naming &&
      !this.partsFailed &&
      [...this.views.values()].some((v) => v.status === 'ready' && this.namable(v) && !!v.parts)
    );
  }
  nameAgain() {
    if (!this.canNameAgain()) return;
    this.suggestCard(true, true);
  }

  /**
   * The part under the pointer moved (R17); -1 / null = none. Other sides tint the same part,
   * unless `only` (⇧, QW6).
   */
  setHover(view: string | null, group = -1, only = false) {
    const next = view && group >= 0 ? { view, group, only } : null;
    const was = this.hovered;
    if (was?.view === next?.view && was?.group === next?.group && was?.only === next?.only) return;
    this.hovered = next;
    this.bump();
  }

  /* ─────────────────────────── QW1 · QW2 · the cloth as the run lays it ─────────────────────────── */

  /** The card's size chart read (QW2): every side's scale follows it. */
  setGarment(g: Garment) {
    if (g.chestMm === this.garment.chestMm && g.lengthMm === this.garment.lengthMm) return;
    this.garment = g;
    for (const v of this.views.values()) v.rev += 1;
    this.bump();
  }

  /** mm per px of one side (cached per flat and garment). */
  scaleOf(v: PaintView): ViewScale | null {
    if (!v.flat) return null;
    const key = `${v.baseMediaId}|${this.garment.chestMm}|${this.garment.lengthMm}`;
    const hit = this.scales.get(v.view);
    if (hit?.key === key) return hit.scale;
    const scale = viewScale(v.view, v.flat, this.garment);
    this.scales.set(v.view, { key, scale });
    return scale;
  }

  /** A material's tile width on a side, px (the mockup's own rule). */
  tilePx(label: string, v: PaintView): number {
    const scale = this.scaleOf(v);
    return clothTilePx(this.skins.get(label)?.repeatMm ?? 0, scale?.mmPerPx ?? 1);
  }

  private labelsOn(v: PaintView): Set<string> {
    if (!v.labels) return new Set();
    const hit = this.labelSets.get(v.view);
    if (hit?.rev === v.rev) return hit.set;
    const set = this.labelsIn(v.labels);
    this.labelSets.set(v.view, { rev: v.rev, set });
    return set;
  }

  /**
   * QW1 · the label whose cloth fills the unpainted garment — the REMAINDER the run sends — or
   * '' (nothing painted, or every cloth painted).
   */
  remainder(): string {
    if (!this.band) return '';
    const painted = new Set<string>();
    const revs: string[] = [];
    for (const v of this.views.values()) {
      if (v.status !== 'ready') continue;
      revs.push(`${v.view}:${v.rev}`);
      for (const hex of this.labelsOn(v)) painted.add(hex);
    }
    const key = `${revs.join(',')}|${this.lastColorway}|${this.materials.map((m) => m.label).join(',')}`;
    if (this.remainderAt.key === key) return this.remainderAt.label;
    const r = remainderCloth({
      band: this.band,
      slots: this.lastSlots,
      colorwayId: this.lastColorway,
      painted,
      isHardware: (hex) => this.isHardware(packHex(hex)),
    });
    this.remainderAt = { key, label: r?.label ?? '' };
    return this.remainderAt.label;
  }

  /** The same part on every side with parts (R17), the given group first. */
  private across(view: string, group: number, only = false) {
    const sides = [...this.views.values()]
      .filter((v) => v.status === 'ready' && !!v.flat && !!v.labels)
      .map((v) => ({ view: v.view, parts: v.parts }));
    return partAcross(sides, view, group, only);
  }

  /** The groups on `view` that are the part hovered on ANOTHER side, and its name. */
  echoOf(view: string): { groups: number[]; label: string } | null {
    const h = this.hovered;
    if (!h || h.view === view || h.only) return null;
    const hit = this.across(h.view, h.group).find((x) => x.view === view);
    const v = this.views.get(view);
    if (!hit || !v?.parts) return null;
    return { groups: hit.groups, label: v.parts.groups[hit.groups[0]]?.label ?? '' };
  }

  /* ─────────────────────────── R9 · hardware as parts ─────────────────────────── */

  /** A label (packed) of a hardware slot of this card. */
  isHardware = (v: number): boolean => this.hardwareSlots.has(v);

  /** The hardware slot's name of a label hex ('' = not hardware). */
  hardwareName(hex: string): string {
    return this.hardwareSlots.get(packHex(hex))?.name ?? '';
  }

  /**
   * The hardware instances of `hex` on a side. R9 fix 4 · every hardware label of the side comes
   * out of ONE pass (`hardwareInstancesAll`), cached per side on its `labelRev`; a label absent
   * from the side answers from the map.
   */
  instancesOf(v: PaintView, hex: string): HardwareInstance[] {
    const packed = packHex(hex);
    if (!v.labels || !v.flat || !this.isHardware(packed)) return [];
    const hit = this.instances.get(v.view);
    if (hit?.rev === v.labelRev) return hit.all.get(packed) ?? [];
    const all = hardwareInstancesAll(v.labels, this.isHardware, v.flat.w, v.flat.h);
    this.instances.set(v.view, { rev: v.labelRev, all });
    return all.get(packed) ?? [];
  }

  /** The painted count of a hardware label on every loaded side (the tile's ` · N`). */
  hardwareCount(hex: string): number {
    let n = 0;
    for (const v of this.views.values())
      if (v.status === 'ready') n += this.instancesOf(v, hex).length;
    return n;
  }

  /**
   * The labels as the model's map carries them: every hardware component takes the cloth around
   * it (`exportLabels`). The side's own labels when it holds no hardware (cached per rev).
   */
  exportOf(v: PaintView): Uint32Array | null {
    if (!v.labels || !v.flat) return null;
    const hit = this.exported.get(v.view);
    if (hit?.rev === v.labelRev) return hit.labels;
    const any = [...this.labelsOn(v)].some((hex) => this.isHardware(packHex(hex)));
    const labels = any
      ? exportLabels(v.labels, v.flat.ink, v.flat.w, v.flat.h, this.isHardware)
      : v.labels;
    this.exported.set(v.view, { rev: v.labelRev, labels });
    return labels;
  }

  /** The armed material is a hardware slot (a click then floods the button, `hardwareAt`). */
  armedHardware(): boolean {
    return !!this.armed && this.isHardware(packHex(this.armed));
  }

  /**
   * The hardware of a side as the canvas draws it: every instance with its slot's picture as the
   * palette holds it (null = the neutral tint).
   */
  hardwareLayer(v: PaintView): MockupHardware[] {
    const out: MockupHardware[] = [];
    if (!v.labels) return out;
    for (const hex of this.labelsOn(v)) {
      if (!this.isHardware(packHex(hex))) continue;
      const tile = this.skins.get(hex)?.tile ?? null;
      const picture = tile ? { rgba: tile.data, w: tile.width, h: tile.height } : null;
      for (const instance of this.instancesOf(v, hex)) out.push({ instance, picture });
    }
    return out;
  }

  /**
   * Label hex → the `parts` of its hardware use: the named parts its instances sit on, then the
   * count on each side (sheet order). Only labels painted somewhere.
   */
  hardwareParts(): Map<string, string> {
    const out = new Map<string, string>();
    if (!this.band) return out;
    const order = renderSheetViews(this.band);
    const sides = [...this.views.values()]
      .filter((v) => v.status === 'ready' && !!v.flat)
      .sort((a, b) => order.indexOf(a.view) - order.indexOf(b.view));
    for (const [packed] of this.hardwareSlots) {
      const hex = hexOf(packed);
      const places: string[] = [];
      const counts: { view: string; n: number }[] = [];
      for (const v of sides) {
        const list = this.instancesOf(v, hex);
        if (list.length === 0) continue;
        counts.push({ view: v.view, n: list.length });
        for (const inst of list) {
          const region = v.flat?.labels[inst.idx[0]] ?? 0;
          const g = region && v.parts ? v.parts.regionGroup[region] : -1;
          const label = g >= 0 ? v.parts?.groups[g]?.label ?? '' : '';
          if (label && !isUnnamed({ key: '', label })) places.push(label);
        }
      }
      if (counts.length > 0) out.set(hex, hardwarePartsText(places, counts));
    }
    return out;
  }

  private loadSkin(m: PaintMaterial) {
    const key = `${m.label}|${m.url}|${m.colourHex}|${m.repeatMm}`;
    const hardware = m.family === 'hardware';
    if (m.kind === 'colour' || !m.url) {
      this.skins.set(
        m.label,
        hardware
          ? { tile: null, hex: HARDWARE_TINT, hardware }
          : { tile: null, hex: m.colourHex || m.label },
      );
      return;
    }
    if (this.skinLoading.has(key)) return;
    this.skinLoading.add(key);
    const had = this.skins.get(m.label);
    const hex = hardware ? HARDWARE_TINT : m.colourHex || '#dddddd';
    this.skins.set(m.label, {
      tile: had?.tile ?? null,
      hex,
      repeatMm: m.repeatMm,
      hardware,
    });
    tileOf(m.url)
      .then((tile) => {
        this.skins.set(m.label, { tile, hex, repeatMm: m.repeatMm, hardware });
        for (const v of this.views.values()) v.rev += 1;
        this.bump();
      })
      .catch(() => {
        /* the colour stands in for the texture */
      });
  }

  private openView(
    view: string,
    baseMediaId: number,
    url: string,
    plan: ColourPlanDoc | undefined,
    aspect: number,
    pictureId: number,
    strays: readonly StrayMark[],
  ) {
    const v: PaintView = {
      view,
      baseMediaId,
      status: 'loading',
      flat: null,
      cut: null,
      pixels: null,
      aspect,
      labels: null,
      dirty: false,
      mapBase: 0,
      rev: 0,
      labelRev: 0,
      parts: null,
      partsSig: '',
    };
    this.views.set(view, v);
    const saved = plan?.maps.find((m) => m.view === view);
    v.mapBase = saved?.mediaId ?? 0;
    // T28 · the side holds another flat than the one its map was painted on: the paint moves.
    const carry = !!saved && saved.baseMediaId !== baseMediaId;
    // T29 · marks of this side's artwork still standing on a previous flat move in the same round.
    const marks =
      pictureId > 0 ? strays.filter((x) => !this.carried.has(markKey(x, pictureId))) : [];
    for (const m of marks) this.carried.add(markKey(m, pictureId));
    const round = carry || marks.length > 0;
    if (round) this.moving.add(v);
    if (marks.length > 0) this.artMoving.add(v);
    void (async () => {
      try {
        const img = await pixelsOf(url);
        const flat = analyseFlat(img.data, img.width, img.height);
        let labels = new Uint32Array(img.width * img.height);
        if (saved && !carry && !saved.gone) {
          if (!saved.url) throw new Error('the saved map has no picture');
          const map = await pixelsOf(saved.url);
          labels = labelsFromMap(
            map.data,
            map.width,
            map.height,
            img.width,
            img.height,
            saved.palette.map((s) => s.hex),
          );
        }
        let moved = false;
        let mapBox: FracBox | null = null;
        if (saved && carry) {
          try {
            if (saved.gone || !saved.url) throw new Error('the old map has no picture');
            const map = await pixelsOf(saved.url);
            mapBox = mapDrawBox({ rgba: map.data, w: map.width, h: map.height });
            const got = transferMap(
              {
                rgba: map.data,
                w: map.width,
                h: map.height,
                palette: saved.palette.map((s) => s.hex),
              },
              flat,
            );
            if (got && got.painted > 0) {
              labels = got.labels;
              moved = true;
            }
          } catch {
            /* unreadable now (maybe only for now): the saved map stays, the side opens unpainted */
          }
        }
        if (this.views.get(view) !== v) return;
        v.flat = flat;
        v.cut = flat;
        v.pixels = img;
        v.aspect = img.width / img.height;
        v.labels = labels;
        v.status = 'ready';
        v.rev += 1;
        v.labelRev += 1;
        // D2 · the carried paint is a DRAFT: opening the page never writes paint. It is saved with
        // the side's next own gesture (it then stands in `labels`, which the save writes whole).
        // Nothing carried: the saved map is kept (a passing read failure must not delete
        // somebody's paint) unless it is confirmed gone; the side's next own gesture replaces it.
        if (carry) {
          const out = carryOutcome(moved, !!saved?.gone);
          v.carried = out.draft;
          v.dirty = out.dirty;
          const key = `${view}:${saved?.mediaId ?? 0}:${saved?.baseMediaId ?? 0}>${baseMediaId}`;
          if (!this.carried.has(key)) {
            this.carried.add(key);
            this.told(view).paint = moved;
          }
        }
        this.takeParts(v);
        if (marks.length > 0) {
          this.bump();
          const got = await this.moveMarks(
            marks,
            pictureId,
            flat,
            mapBox && saved ? { box: mapBox, mediaId: saved.baseMediaId } : null,
            () => this.views.get(view) === v,
          );
          if (got.art > 0 || got.artLeft > 0) {
            const t = this.told(view);
            t.art += got.art;
            t.artLeft += got.artLeft;
          }
        }
      } catch {
        // A view whose saved painting could not be read is NOT paintable: painting over it would
        // save a blank over somebody's work.
        if (this.views.get(view) === v) v.status = 'error';
      } finally {
        this.artMoving.delete(v);
        if (round) this.landed(v);
      }
      this.bump();
      if (this.views.get(view) === v) this.suggestCard();
    })();
  }

  /**
   * T28 · one carry landed (or was abandoned). When it was the last: ONE save for every carried
   * side (the session's own path: CAS, one re-read on a conflict) and ONE line for the round.
   */
  private landed(v: PaintView) {
    this.moving.delete(v);
    if (this.moving.size > 0) return;
    const told = [...this.moved];
    this.moved.clear();
    if ([...this.views.values()].some((x) => x.dirty)) void this.flush();
    if (told.length === 0) return;
    // One phrase per side: what moved, then what is left to the person. Sides saying the same
    // thing share it: «front, back: flats changed · paint and artwork moved».
    const phrase = (t: { paint: boolean | null; art: number; artLeft: number }) => {
      const went = [t.art > 0 ? 'artwork' : ''].filter(Boolean);
      return [
        // D2 · carried paint is a draft until the person paints the side.
        t.paint === true ? 'paint draft' : '',
        went.length > 0 ? `${went.join(' and ')} moved` : '',
        t.paint === false ? 'repaint' : '',
        t.artLeft > 0 ? 'place artwork again' : '',
      ]
        .filter(Boolean)
        .join(' · ');
    };
    const groups = new Map<string, string[]>();
    for (const [view, t] of told) {
      const p = phrase(t);
      if (!p) continue;
      groups.set(p, [...(groups.get(p) ?? []), viewLabel(view)]);
    }
    if (groups.size === 0) return;
    const text = [...groups]
      .map(
        ([p, views]) =>
          `${views.join(', ')}: ${views.length === 1 ? 'flat' : 'flats'} changed · ${p}`,
      )
      .join(' · ');
    useSnackBarStore.getState().showMessage(text, 'success');
  }

  private told(view: string) {
    let t = this.moved.get(view);
    if (!t) {
      t = { paint: null, art: 0, artLeft: 0 };
      this.moved.set(view, t);
    }
    return t;
  }

  /**
   * T29 · artwork marks still on a side's previous flat move onto the flat standing there now: the
   * points (fractions of the old picture) are aligned box to box exactly as the paint is — the old
   * frame's box is the old map's ink box when the map was painted on that picture, else the
   * old picture's own ink box (`regions.ts`). The mark keeps its id, asset and note (the verb moves
   * a mark when given its id). Anything unreadable leaves the mark where it is — never deleted.
   */
  private async moveMarks(
    marks: readonly StrayMark[],
    pictureId: number,
    flat: FlatRegions,
    map: { box: FracBox; mediaId: number } | null,
    /** False once the side moved on to yet another flat: a late write would pin the mark to a
     *  picture no side holds any more — the newer round moves it instead. */
    current: () => boolean,
  ): Promise<{ art: number; artLeft: number }> {
    const newBox = inkBox(flat);
    const boxes = new Map<number, Promise<FracBox | null>>();
    const oldBox = (m: StrayMark): Promise<FracBox | null> => {
      const media = m.picture.media;
      if (map && (media?.id ?? 0) === map.mediaId) return Promise.resolve(map.box);
      const id = m.picture.id ?? 0;
      let got = boxes.get(id);
      if (!got) {
        const url = media?.media?.fullSize?.mediaUrl || media?.media?.compressed?.mediaUrl || '';
        got = url
          ? pixelsOf(url).then((img) => inkBox(analyseFlat(img.data, img.width, img.height)))
          : Promise.resolve(null);
        boxes.set(id, got);
      }
      return got;
    };
    let art = 0;
    let artLeft = 0;
    for (const m of marks) {
      const p = m.placement;
      try {
        const ann = p.annotation;
        const pts = (ann?.points ?? []).map((q) => ({ x: num(q.x), y: num(q.y) }));
        const ob = await oldBox(m);
        const moved = pts.length > 0 ? transferPoints(ob, newBox, pts) : null;
        // No id would CREATE a second mark instead of moving this one.
        if (!ann || !moved || (p.id ?? 0) <= 0) throw new Error('nothing to align');
        if (!current()) break;
        const hasLabel = !!ann.labelX?.value && !!ann.labelY?.value;
        const label = hasLabel
          ? transferPoints(ob, newBox, [{ x: num(ann.labelX), y: num(ann.labelY) }])?.[0]
          : undefined;
        await adminService.SetDesignAssetPlacement({
          techCardId: this.techCardId,
          placementId: p.id ?? 0,
          assetId: p.assetId ?? 0,
          pictureId,
          annotation: {
            ...ann,
            points: moved.map((q) => ({ x: dec(q.x), y: dec(q.y) })),
            ...(label ? { labelX: dec(label.x), labelY: dec(label.y) } : {}),
          },
          note: p.note ?? '',
        });
        art += 1;
      } catch {
        artLeft += 1;
      }
    }
    if (art > 0) void this.qc.invalidateQueries({ queryKey: designKeys.band(this.techCardId) });
    return { art, artLeft };
  }

  /* ─────────────────────────── gestures ─────────────────────────── */

  setTool(t: PaintTool) {
    if (t === this.tool) return;
    this.tool = t;
    this.bump();
  }

  arm(label: string) {
    this.armed = label;
    if (this.tool === 'erase' || this.tool === 'artwork') this.tool = 'click';
    this.bump();
  }

  /** R7 · arms an artwork tile: the `artwork` tool takes over the sides. 0 disarms. */
  armArtwork(assetId: number) {
    this.armedArtwork = Math.max(0, assetId);
    this.tool = assetId > 0 ? 'artwork' : this.tool === 'artwork' ? 'click' : this.tool;
    this.bump();
  }

  /** A new free colour; armed at once. */
  addColour(colourHex: string): string {
    if (this.frozen) return '';
    const taken = [...this.slotLabel.values(), ...this.colours.map((c) => c.label)];
    for (const v of this.views.values())
      if (v.labels) for (const hex of this.labelsIn(v.labels)) taken.push(hex);
    const label = freeColourLabel(taken);
    if (!label) return '';
    this.colours.push({ label, colourHex });
    this.dirtyColours.add(label);
    // With the cloths, before the hardware (the order `sync` lays).
    const colour: PaintMaterial = {
      label,
      kind: 'colour',
      family: 'cloth',
      name: colourHex,
      bomItemId: 0,
      url: '',
      colourHex,
      repeatMm: 0,
    };
    const cut = this.materials.findIndex((m) => m.family === 'hardware');
    this.materials =
      cut < 0
        ? [...this.materials, colour]
        : [...this.materials.slice(0, cut), colour, ...this.materials.slice(cut)];
    this.skins.set(label, { tile: null, hex: colourHex });
    this.armed = label;
    if (this.tool === 'erase' || this.tool === 'artwork') this.tool = 'click';
    this.bump();
    return label;
  }

  /** Change a free colour (its label stays; the plan row follows on the next save). */
  setColour(label: string, colourHex: string) {
    if (this.frozen) return;
    const c = this.colours.find((x) => x.label === label);
    if (!c || c.colourHex === colourHex) return;
    c.colourHex = colourHex;
    this.dirtyColours.add(label);
    this.materials = this.materials.map((m) =>
      m.label === label ? { ...m, colourHex, name: colourHex } : m,
    );
    this.skins.set(label, { tile: null, hex: colourHex });
    for (const v of this.views.values()) {
      v.rev += 1;
    }
    this.schedule();
    this.bump();
  }

  private labelsIn(labels: Uint32Array): Set<string> {
    const s = new Set<number>();
    for (let i = 0; i < labels.length; i += 1) if (labels[i]) s.add(labels[i]);
    return new Set([...s].map(hexOf));
  }

  /** Paint pixels of a view with the armed material (or erase). */
  apply(view: string, idx: Int32Array | null) {
    if (idx && idx.length > 0) this.applyMany([{ view, idx }]);
  }

  /**
   * A part click (R17): the part under the pointer and the same part — by its `part_key`, or by
   * name on older answers — on every other side that has parts, one gesture (one undo). The other
   * sides painted light up a moment.
   */
  paintPart(view: string, group: number, at: { x: number; y: number }, only = false) {
    const v = this.views.get(view);
    if (!v?.parts || !v.flat || !v.labels) return;
    const targets: { view: string; idx: Int32Array }[] = [];
    for (const hit of this.across(view, group, only)) {
      const o = this.views.get(hit.view);
      if (!o?.parts || !o.flat || !o.labels) continue;
      const { flat, labels, parts } = o;
      const chunks = hit.groups.map((g, i) =>
        partIndices(labels, flat, parts, g, o === v && i === 0 ? at : undefined),
      );
      targets.push({ view: hit.view, idx: concatIndices(chunks) });
    }
    const touched = this.applyMany(targets);
    const others = touched.filter((x) => x !== view);
    if (others.length === 0) return;
    for (const x of others) this.flash.add(x);
    setTimeout(() => {
      for (const x of others) this.flash.delete(x);
      this.bump();
    }, 700);
    this.bump();
  }

  private paintedAt = new Map<string, { rev: number; any: boolean }>();

  /** Is anything painted on any side (cached per side's rev). */
  anyPaint(): boolean {
    for (const v of this.views.values()) {
      if (v.status !== 'ready' || !v.labels) continue;
      let hit = this.paintedAt.get(v.view);
      if (hit?.rev !== v.rev) {
        hit = { rev: v.rev, any: anyPainted(v.labels) };
        this.paintedAt.set(v.view, hit);
      }
      if (hit.any) return true;
    }
    return false;
  }

  /** `clear`: every side back to paper, one gesture (one ⌘Z brings it all back). */
  clear() {
    const targets: { view: string; idx: Int32Array }[] = [];
    for (const v of this.views.values()) {
      if (v.status !== 'ready' || !v.labels) continue;
      const idx: number[] = [];
      for (let i = 0; i < v.labels.length; i += 1) if (v.labels[i]) idx.push(i);
      if (idx.length > 0) targets.push({ view: v.view, idx: Int32Array.from(idx) });
    }
    this.applyMany(targets, 0);
  }

  /** One gesture over several sides. Returns the sides it changed. */
  private applyMany(targets: { view: string; idx: Int32Array }[], paint?: number): string[] {
    if (this.frozen) return [];
    const value = paint ?? (this.tool === 'erase' ? 0 : this.armed ? packHex(this.armed) : 0);
    if (paint === undefined && this.tool !== 'erase' && !value) return [];
    // R9 · one precedence, here only: a cloth or free-colour gesture skips hardware pixels; a
    // hardware gesture overwrites anything; erase and clear (value 0) remove anything.
    const keepHardware = value !== 0 && !this.isHardware(value);
    const ready = targets.flatMap((t) => {
      const v = this.views.get(t.view);
      if (!v || v.status !== 'ready' || !v.labels) return [];
      const labels = v.labels;
      // Ф1 · an opening has no cloth: paint never lands on it (erase still clears it).
      let idx = value && v.flat ? dropOpenings(t.idx, v.flat, v.parts) : t.idx;
      if (keepHardware && this.hardwareSlots.size > 0)
        idx = idx.filter((i) => !this.isHardware(labels[i]));
      return idx.length > 0 ? [{ view: t.view, base: v.baseMediaId, labels, idx }] : [];
    });
    const gesture = paintGesture(ready, value);
    if (gesture.length === 0) return [];
    this.undoStack.push(gesture);
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
    const touched = [...new Set(gesture.map((s) => s.view))];
    for (const view of touched) {
      const v = this.views.get(view);
      if (!v) continue;
      v.dirty = true;
      v.rev += 1;
      v.labelRev += 1;
    }
    this.schedule();
    this.bump();
    return touched;
  }

  private live = (g: Gesture) => gestureLive(g, (view) => this.views.get(view));

  /** Drop every gesture that stands on a side replaced or gone since (whole gestures only). */
  private prune() {
    this.undoStack = this.undoStack.filter(this.live);
    this.redoStack = this.redoStack.filter(this.live);
  }

  private replay(g: Gesture, back: boolean) {
    const steps = back ? [...g].reverse() : g;
    for (const s of steps) {
      const v = this.views.get(s.view);
      if (!v?.labels) continue;
      if (back) undoDiff(v.labels, s.diff);
      else redoDiff(v.labels, s.diff);
      v.dirty = true;
      v.rev += 1;
      v.labelRev += 1;
    }
    this.schedule();
    this.bump();
  }

  undo() {
    if (this.frozen) return;
    let g = this.undoStack.pop();
    while (g && !this.live(g)) g = this.undoStack.pop();
    if (!g) return this.bump();
    this.replay(g, true);
    this.redoStack.push(g);
  }

  redo() {
    if (this.frozen) return;
    let g = this.redoStack.pop();
    while (g && !this.live(g)) g = this.redoStack.pop();
    if (!g) return this.bump();
    this.replay(g, false);
    this.undoStack.push(g);
  }

  /* ─────────────────────────── save ─────────────────────────── */

  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.saveNow();
    }, DEBOUNCE_MS);
    if (this.save !== 'saving') this.save = 'pending';
  }

  /** Save now whatever is dirty. Resolves true when nothing is left unsaved. */
  flush(): Promise<boolean> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    return this.saveNow();
  }

  /** `unsaved` / `error` → try again on the person's word. */
  /**
   * `unsaved · retry`: re-read the plan, take everybody else's colours, move OUR dirty colours off
   * any label the fresh plan now uses (pixels remapped), then save on top of the fresh plan.
   */
  async retry() {
    const key = designKeys.band(this.techCardId);
    try {
      await this.qc.refetchQueries({ queryKey: key, exact: true });
    } catch {
      /* the save below reports */
    }
    const band = this.qc.getQueryData<GetDesignBandResponse>(key);
    if (band) {
      const fresh = readColourPlan(band);
      if (fresh && (!this.echo || fresh.rev >= this.echo.rev)) this.echo = null;
      const taken = new Set((fresh?.cloths ?? []).map((c) => c.hex));
      const remap = new Map<number, number>();
      for (const c of this.colours) {
        if (!this.dirtyColours.has(c.label) || !taken.has(c.label)) continue;
        const all = [
          ...this.slotLabel.values(),
          ...this.colours.map((x) => x.label),
          ...taken,
          ...[...remap.values()].map(hexOf),
        ];
        const next = freeColourLabel(all);
        if (!next) continue;
        remap.set(packHex(c.label), packHex(next));
        this.dirtyColours.delete(c.label);
        this.dirtyColours.add(next);
        this.skins.set(next, { tile: null, hex: c.colourHex });
        if (this.armed === c.label) this.armed = next;
        c.label = next;
      }
      if (remap.size > 0) {
        for (const v of this.views.values()) {
          if (!v.labels) continue;
          let hit = false;
          for (let i = 0; i < v.labels.length; i += 1) {
            const to = remap.get(v.labels[i]);
            if (to !== undefined) {
              v.labels[i] = to;
              hit = true;
            }
          }
          if (hit) {
            v.dirty = true;
            v.rev += 1;
            v.labelRev += 1;
          }
        }
        // Old diffs name the old labels.
        this.undoStack = [];
        this.redoStack = [];
        this.materials = [];
      }
      // Colours of ours that the fresh plan rewrote but we never touched follow the plan.
      this.sync(band, this.lastSlots, this.lastColorway, this.lastHardware);
    }
    this.save = 'pending';
    void this.flush();
  }

  private saveNow(): Promise<boolean> {
    if (this.inflight) {
      this.again = true;
      return this.inflight.then(() => this.saveNow());
    }
    const dirty = [...this.views.values()].filter((v) => v.dirty && v.status === 'ready');
    const colourDirty = this.dirtyColours.size > 0;
    if (dirty.length === 0 && !colourDirty) {
      if (this.save !== 'unsaved' && this.save !== 'error') this.save = 'idle';
      this.bump();
      return Promise.resolve(true);
    }
    this.save = 'saving';
    this.bump();
    this.inflight = this.write(dirty).finally(() => {
      this.inflight = null;
    });
    return this.inflight.then((ok) => {
      if (this.again && ok) {
        this.again = false;
        return this.saveNow();
      }
      this.again = false;
      return ok;
    });
  }

  /* ─────────────────────────── the cloth mockups (T13) ─────────────────────────── */

  /** Freeze / unfreeze painting while GENERATE prepares. */
  setFrozen(on: boolean) {
    if (this.frozen === on) return;
    this.frozen = on;
    this.bump();
  }

  /**
   * The outgoing maps still stand exactly as the session holds them: the plan at `rev`, every map
   * the saved one of its side, over the same flat, nothing painted since.
   */
  sendsAsSaved(maps: readonly common_DesignColourMap[], rev: number | undefined): boolean {
    const plan = this.plan();
    if (!plan || plan.rev !== rev) return false;
    return maps.every((m) => {
      const v = this.views.get(m.view ?? '');
      const saved = plan.maps.find((x) => x.view === m.view);
      return (
        !!v &&
        v.status === 'ready' &&
        !v.dirty &&
        v.mapBase === (m.mediaId ?? 0) &&
        v.baseMediaId === (m.baseMediaId ?? 0) &&
        saved?.mediaId === (m.mediaId ?? 0)
      );
    });
  }

  /** mm per px of every side of `maps`, read once — a press draws and signs off this snapshot. */
  scaleSnapshot(maps: readonly common_DesignColourMap[]): Map<string, number> {
    const out = new Map<string, number>();
    for (const m of maps) {
      const v = this.views.get(m.view ?? '');
      out.set(m.view ?? '', (v && this.scaleOf(v)?.mmPerPx) || 1);
    }
    return out;
  }

  /** The signature of the mockups of these maps with these uses (cloths, repeats, scales). */
  private mockSig(
    maps: readonly common_DesignColourMap[],
    uses: readonly common_DesignFabricUse[],
    scales: ReadonlyMap<string, number>,
    hardware: ReadonlyMap<string, number>,
    remainder: number,
  ): string {
    const assets = new Map((this.band?.assets ?? []).map((a) => [a.id ?? 0, a]));
    const look = (u: common_DesignFabricUse | undefined) => {
      const a = (u?.assetId ?? 0) > 0 ? assets.get(u?.assetId ?? 0) : undefined;
      return [
        u?.assetId ?? 0,
        a?.mediaId ?? 0,
        u?.colourHex ?? '',
        u?.repeatMm || a?.repeatMm || 0,
      ];
    };
    const useOf = (hex: string) => uses.find((u) => (u.mapHex ?? '').toLowerCase() === hex);
    return JSON.stringify([
      MOCKUP_REV,
      REGIONS_ALGO_REV,
      look(remainderUse(uses, remainder)),
      // R9 · each hardware label with the picture its use sends (its place is in the map's raster).
      [...hardware].map(([hex, k]) => [hex, uses[k]?.assetId ?? 0, uses[k]?.mediaId ?? 0]),
      maps.map((m) => {
        // M5 · the remainder never fills an opening: the side's holes are part of the drawing.
        const holes = this.views.get(m.view ?? '')?.flat?.openings;
        return [
          m.view,
          m.mediaId,
          m.baseMediaId,
          scales.get(m.view ?? '') ?? 0,
          holes ? [...holes].flatMap((o, r) => (o ? [r] : [])) : [],
          (m.palette ?? []).map((sw) => {
            const hex = (sw.hex ?? '').toLowerCase();
            return [hex, ...look(useOf(hex))];
          }),
        ];
      }),
    ]);
  }

  /**
   * Draw one cloth mockup per map (`mockup.ts`): each label filled with the cloth its fabric use
   * names (the asset's picture at its true repeat on that side's scale, or the free colour), the
   * unpainted garment with the REMAINDER (the use without a mapHex, QW1). PNG data URLs by view;
   * rejects when a side is not drawn exactly as its map. Kept per signature (the press and the
   * WHAT THE MODEL GETS preview share one drawing).
   */
  private drawMockups(
    maps: readonly common_DesignColourMap[],
    uses: readonly common_DesignFabricUse[],
    scales: ReadonlyMap<string, number>,
    sig: string,
    hardware: ReadonlyMap<string, number>,
    remainder: number,
  ): Promise<Map<string, string>> {
    const hit = this.mockDrawn.get(sig);
    if (hit) return hit;
    const band = this.band;
    const assets = new Map((band?.assets ?? []).map((a) => [a.id ?? 0, a]));
    const pictures = new Map<string, Promise<ImageData>>();
    const skinOf = async (use: common_DesignFabricUse, mmPerPx: number) => {
      const asset = (use.assetId ?? 0) > 0 ? assets.get(use.assetId ?? 0) : undefined;
      const url = asset ? assetFull(asset) : '';
      if (url) {
        let pic = pictures.get(url);
        if (!pic) {
          pic = clothPixels(url);
          pictures.set(url, pic);
        }
        const img = await pic;
        return {
          kind: 'tile',
          rgba: img.data,
          w: img.width,
          h: img.height,
          tilePx: clothTilePx(use.repeatMm || asset?.repeatMm || 0, mmPerPx),
        } as MockupSkin;
      }
      const c = (use.colourHex ?? '').trim();
      return c ? ({ kind: 'colour', hex: c } as MockupSkin) : null;
    };
    // R9 fix 3 · the REMAINDER by its index from `paintRun`, never «the first use without a
    // mapHex»: with only hardware painted every cloth lacks one, and the first would skin the
    // whole garment (a satin lapel included). -1 → the flat itself stands there.
    const rest = remainderUse(uses, remainder);
    // R9 · a hardware use's picture (only when its use sends one), fitted into each instance.
    const pictureOf = async (use: common_DesignFabricUse | undefined): Promise<Picture | null> => {
      const asset = use && (use.mediaId ?? 0) > 0 ? assets.get(use.assetId ?? 0) : undefined;
      const url = asset ? assetFull(asset) : '';
      if (!url) return null;
      let pic = pictures.get(url);
      if (!pic) {
        pic = clothPixels(url);
        pictures.set(url, pic);
      }
      const img = await pic;
      return { rgba: img.data, w: img.width, h: img.height };
    };
    const job = (async () => {
      if (!band) throw new Error('no band');
      const out = new Map<string, string>();
      for (const m of maps) {
        const view = m.view ?? '';
        const v = this.views.get(view);
        if (!v || v.status !== 'ready' || v.dirty || !v.labels || !v.flat || !v.pixels)
          throw new Error(`${view} is not drawn as saved`);
        if (v.baseMediaId !== (m.baseMediaId ?? 0) || v.mapBase !== (m.mediaId ?? 0))
          throw new Error(`${view} stands on another map`);
        // A copy: the drawing below spans awaits, and nothing it reads may move under it. R9 · the
        // labels with every hardware instance given the cloth around it (the button sits on it).
        const flat = v.flat;
        const labels = (this.exportOf(v) ?? v.labels).slice();
        const instances = [...hardware].map(([hex, k]) => ({
          list: this.instancesOf(v, hex),
          use: uses[k],
        }));
        const pixels = v.pixels.data.slice();
        const mmPerPx = scales.get(view) ?? 1;
        const skins = new Map<number, MockupSkin>();
        for (const sw of m.palette ?? []) {
          const hex = (sw.hex ?? '').toLowerCase();
          const use = uses.find((u) => (u.mapHex ?? '').toLowerCase() === hex);
          const skin = use ? await skinOf(use, mmPerPx) : null;
          if (skin) skins.set(packHex(hex), skin);
        }
        const remainder = rest ? await skinOf(rest, mmPerPx) : null;
        const layer: MockupHardware[] = [];
        for (const { list, use } of instances) {
          if (list.length === 0) continue;
          const picture = await pictureOf(use);
          for (const instance of list) layer.push({ instance, picture });
        }
        const rgba = mockupPixels(flat, labels, pixels, skins, remainder, layer);
        out.set(view, pngOf(rgba, flat.w, flat.h));
      }
      return out;
    })();
    this.mockDrawn.set(sig, job);
    // A failed drawing is not kept: the next press draws again.
    job.catch(() => {
      if (this.mockDrawn.get(sig) === job) this.mockDrawn.delete(sig);
    });
    return job;
  }

  /** QW10 · the mockups these maps would take, drawn (not uploaded) — view → PNG data URL. */
  async mockupPreviews(
    maps: readonly common_DesignColourMap[],
    uses: readonly common_DesignFabricUse[],
    hardware: ReadonlyMap<string, number> = new Map(),
    remainder = -1,
  ): Promise<Map<string, string>> {
    try {
      const scales = this.scaleSnapshot(maps);
      return await this.drawMockups(
        maps,
        uses,
        scales,
        this.mockSig(maps, uses, scales, hardware, remainder),
        hardware,
        remainder,
      );
    } catch {
      return new Map();
    }
  }

  /**
   * At GENERATE (frozen, after the save settled): one cloth mockup per outgoing map, drawn and
   * uploaded. View → media id, all of them, or `error` (QW4: the run then does not start — no
   * quiet run without mockups). A full answer is kept per canonical signature (map media, flats,
   * scales, per-label cloth + repeat, the remainder, algo): the same press again reuses it — the
   * same ids, the same recipe, the same idempotency key. A failure is never kept.
   */
  async mockups(
    maps: readonly common_DesignColourMap[],
    uses: readonly common_DesignFabricUse[],
    scales: ReadonlyMap<string, number> = this.scaleSnapshot(maps),
    hardware: ReadonlyMap<string, number> = new Map(),
    remainder = -1,
  ): Promise<{ ids: Map<string, number>; error: string }> {
    const sig = this.mockSig(maps, uses, scales, hardware, remainder);
    const hit = this.mockCache.get(sig);
    if (hit) return { ids: hit, error: '' };
    try {
      const drawn = await this.drawMockups(maps, uses, scales, sig, hardware, remainder);
      const ids = new Map<string, number>();
      for (const m of maps) {
        const view = m.view ?? '';
        const png = drawn.get(view);
        if (!png) throw new Error(`${view} has no mockup`);
        const media = await uploadRaster(png);
        const id = media.id ?? 0;
        if (id <= 0) throw new Error('the mockup did not upload');
        ids.set(view, id);
        const url = media.media?.thumbnail?.mediaUrl || media.media?.fullSize?.mediaUrl || png;
        this.mockUrls.set(id, url);
      }
      this.mockCache.set(sig, ids);
      return { ids, error: '' };
    } catch (e) {
      return { ids: new Map(), error: (e instanceof Error && e.message) || 'mockup failed' };
    }
  }

  /**
   * R9 · the colour maps as the model gets them (drawn, not uploaded): every hardware pixel of the
   * saved map given the cloth around it (`exportLabels`), the ink black, a palette of the cloths
   * only. Per signature (the saved maps' media), so the preview and the press share one drawing.
   */
  private drawExports(
    maps: readonly common_DesignColourMap[],
  ): Promise<Map<string, { png: string; palette: PlanMap['palette'] }>> {
    const sig = JSON.stringify([
      REGIONS_ALGO_REV,
      [...this.hardwareSlots.keys()],
      maps.map((m) => [m.view, m.mediaId, m.baseMediaId]),
    ]);
    const hit = this.exportDrawn.get(sig);
    if (hit) return hit;
    const job = (async () => {
      const out = new Map<string, { png: string; palette: PlanMap['palette'] }>();
      for (const m of maps) {
        const view = m.view ?? '';
        const v = this.views.get(view);
        if (!v || v.status !== 'ready' || v.dirty || !v.labels || !v.flat)
          throw new Error(`${view} is not drawn as saved`);
        if (v.baseMediaId !== (m.baseMediaId ?? 0) || v.mapBase !== (m.mediaId ?? 0))
          throw new Error(`${view} stands on another map`);
        const labels = this.exportOf(v) ?? v.labels;
        const { rgba, palette } = mapPixels(labels, v.flat.ink, v.flat.w, v.flat.h);
        out.set(view, { png: pngOf(rgba, v.flat.w, v.flat.h), palette });
      }
      return out;
    })();
    this.exportDrawn.set(sig, job);
    job.catch(() => {
      if (this.exportDrawn.get(sig) === job) this.exportDrawn.delete(sig);
    });
    return job;
  }

  /** R9 · the exported maps' previews (WHAT THE MODEL GETS), view → PNG data URL. */
  async exportPreviews(maps: readonly common_DesignColourMap[]): Promise<Map<string, string>> {
    try {
      const drawn = await this.drawExports(maps);
      return new Map([...drawn].map(([view, d]) => [view, d.png]));
    } catch {
      return new Map();
    }
  }

  /**
   * R9 · at GENERATE (frozen, after the save settled): the maps that carry hardware, exported and
   * uploaded — view → the media and palette the run sends instead of the saved map. A full answer
   * is kept per maps (the same press again: the same ids, the same idempotency key); a failure is
   * never kept, and the run does not start (as a failed mockup).
   */
  async exportMaps(maps: readonly common_DesignColourMap[]): Promise<{
    maps: Map<string, { mediaId: number; palette: common_DesignColourMap['palette'] }>;
    error: string;
  }> {
    const sig = JSON.stringify(maps.map((m) => [m.view, m.mediaId, m.baseMediaId]));
    const hit = this.exportCache.get(sig);
    if (hit) return { maps: hit, error: '' };
    try {
      const drawn = await this.drawExports(maps);
      const out = new Map<
        string,
        { mediaId: number; palette: common_DesignColourMap['palette'] }
      >();
      for (const m of maps) {
        const view = m.view ?? '';
        const d = drawn.get(view);
        if (!d) throw new Error(`${view} has no map`);
        const media = await uploadRaster(d.png);
        const id = media.id ?? 0;
        if (id <= 0) throw new Error('the colour map did not upload');
        out.set(view, {
          mediaId: id,
          palette: d.palette.map((sw) => ({ hex: sw.hex, px: sw.px })),
        });
      }
      this.exportCache.set(sig, out);
      return { maps: out, error: '' };
    } catch (e) {
      return { maps: new Map(), error: (e instanceof Error && e.message) || 'map export failed' };
    }
  }

  /** Dirty views whose saved map was replaced by somebody else since our pixels were based on it. */
  private drifted(plan: ColourPlanDoc, dirty: PaintView[]): PaintView[] {
    return dirty.filter(
      (v) => (plan.maps.find((m) => m.view === v.view)?.mediaId ?? 0) !== v.mapBase,
    );
  }

  private async write(dirty: PaintView[]): Promise<boolean> {
    const card = this.techCardId;
    const before = this.plan();
    const moved = before ? this.drifted(before, dirty) : [];
    if (moved.length > 0)
      return this.fail(
        'unsaved',
        `somebody repainted ${moved.map((v) => v.view).join(', ')} — reload the card to see it`,
      );
    const ownColours = new Map(
      this.colours.filter((c) => this.dirtyColours.has(c.label)).map((c) => [c.label, c.colourHex]),
    );
    // Snapshot and clear: a gesture during the upload marks its view dirty again.
    const fresh: { view: string; map: PlanMap | null }[] = [];
    try {
      for (const v of dirty) {
        v.dirty = false;
        if (!v.labels || !v.flat) continue;
        if (!anyPainted(v.labels)) {
          fresh.push({ view: v.view, map: null });
          continue;
        }
        // R9 · the saved map keeps hardware over the ink (a rivet drawn as one dot is all ink).
        const { rgba, palette } = mapPixels(
          v.labels,
          v.flat.ink,
          v.flat.w,
          v.flat.h,
          this.isHardware,
        );
        if (palette.length > PLAN_PALETTE_MAX)
          throw new Error(`a view carries at most ${PLAN_PALETTE_MAX} materials`);
        const media = await uploadRaster(pngOf(rgba, v.flat.w, v.flat.h));
        fresh.push({
          view: v.view,
          map: {
            mediaId: media.id ?? 0,
            view: v.view,
            baseMediaId: v.baseMediaId,
            palette,
            url: media.media?.fullSize?.mediaUrl ?? '',
            gone: false,
          },
        });
      }
    } catch (e) {
      for (const v of dirty) v.dirty = true;
      return this.fail('error', e instanceof Error ? e.message : 'the colour map did not upload');
    }

    const compose = (base: ColourPlanDoc) => {
      const mine = new Set(fresh.map((f) => f.view));
      const maps = [
        ...base.maps.filter((m) => !mine.has(m.view)),
        ...fresh.flatMap((f) => (f.map ? [f.map] : [])),
      ];
      const painted = new Set(maps.flatMap((m) => m.palette.map((s) => s.hex)));
      // Every row of `base` stays as it is (the server only refuses rows no map paints); ONLY our
      // dirty colour rows overlay it, and a colour of ours painted but rowless gets its row.
      const cloths: PlanCloth[] = base.cloths
        .filter((c) => painted.has(c.hex))
        .map((c) =>
          ownColours.has(c.hex)
            ? {
                hex: c.hex,
                assetId: 0,
                colourHex: ownColours.get(c.hex) ?? '',
                words: '',
                parts: '',
              }
            : c,
        );
      for (const c of this.colours)
        if (painted.has(c.label) && !cloths.some((r) => r.hex === c.label))
          cloths.push({
            hex: c.label,
            assetId: 0,
            colourHex: ownColours.get(c.label) ?? c.colourHex,
            words: '',
            parts: '',
          });
      return { maps, cloths };
    };

    const attempt = async (base: ColourPlanDoc) => {
      const doc = compose(base);
      if (doc.maps.length > PLAN_MAPS_MAX)
        throw new Error(`a card carries at most ${PLAN_MAPS_MAX} colour maps`);
      if (doc.cloths.length > PLAN_CLOTHS_MAX)
        throw new Error(`a colour plan carries at most ${PLAN_CLOTHS_MAX} materials`);
      const payload = { maps: doc.maps.map(writeMap), cloths: doc.cloths.map(writeCloth) };
      if (JSON.stringify(payload).length > PLAN_BYTES_MAX)
        throw new Error('the colour plan is too large');
      const res = await adminService.SetDesignColourPlan({
        techCardId: card,
        expectedRev: base.rev,
        ...payload,
      });
      const stored = res.plan
        ? readColourPlan({ colourPlan: res.plan } as GetDesignBandResponse)
        : undefined;
      this.echo = stored ?? { rev: base.rev + 1, maps: doc.maps, cloths: doc.cloths };
    };

    const base = this.plan();
    if (!base) {
      for (const v of dirty) v.dirty = true;
      return this.fail('error', 'this server has no colour plan yet');
    }
    try {
      try {
        await attempt(base);
      } catch (e) {
        if (!isRevMismatch(e)) throw e;
        // Somebody saved in between: re-read; lay ONLY our views over theirs, once, and only when
        // their cloth rows are exactly the ones we stood on — otherwise stop at `unsaved`.
        const key = designKeys.band(card);
        await this.qc.refetchQueries({ queryKey: key, exact: true });
        const band = this.qc.getQueryData<GetDesignBandResponse>(key);
        const freshPlan = band ? readColourPlan(band) : undefined;
        if (!freshPlan) throw e;
        if (band) this.band = band;
        const sig = (d: ColourPlanDoc) =>
          JSON.stringify([...d.cloths].sort((a, b) => (a.hex < b.hex ? -1 : 1)).map(writeCloth));
        if (sig(freshPlan) !== sig(base) || this.drifted(freshPlan, dirty).length > 0) {
          for (const v of dirty) v.dirty = true;
          return this.fail(
            'unsaved',
            'somebody changed this card’s materials — retry to lay yours over',
          );
        }
        try {
          await attempt(freshPlan);
        } catch (e2) {
          if (isRevMismatch(e2)) {
            for (const v of dirty) v.dirty = true;
            return this.fail(
              'unsaved',
              'somebody else is saving this card’s parts — retry to lay yours over',
            );
          }
          throw e2;
        }
      }
    } catch (e) {
      for (const v of dirty) v.dirty = true;
      return this.fail('error', refusalText(e));
    }
    for (const [label, hex] of ownColours)
      if (this.colours.find((c) => c.label === label)?.colourHex === hex)
        this.dirtyColours.delete(label);
    for (const f of fresh) {
      const v = this.views.get(f.view);
      if (v) v.mapBase = f.map?.mediaId ?? 0;
    }
    void this.qc.invalidateQueries({ queryKey: designKeys.band(card) });
    const left = [...this.views.values()].some((v) => v.dirty);
    this.save = left || this.timer ? 'pending' : 'idle';
    this.saveError = '';
    this.bump();
    return !left;
  }

  private fail(state: 'error' | 'unsaved', message: string): boolean {
    this.save = state;
    this.saveError = message;
    this.bump();
    return false;
  }

  /** Leaving the screen or the card: whatever is pending goes to THIS card now. */
  dispose() {
    if (this.timer || [...this.views.values()].some((v) => v.dirty)) void this.flush();
  }
}

/** The painting session of this card (flushed to its own card when the card changes). */
export function usePaint(
  techCardId: number,
  band: GetDesignBandResponse,
  slots: readonly ClothSlot[] | undefined,
  colorwayId: number,
  /** R9 · the card's paintable hardware slots (`isPaintableHardware`), in pack order. */
  hardware?: readonly MaterialSlot[],
): PaintSession {
  const qc = useQueryClient();
  const session = useMemo(() => new PaintSession(techCardId, qc), [techCardId, qc]);
  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => {
    session.sync(band, slots, colorwayId, hardware);
  }, [session, band, slots, colorwayId, hardware]);
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
  return session;
}

/**
 * QW10 · per outgoing map: its picture, the mockup it takes (uploaded, else drawn here — the very
 * drawing the press uploads; only while `open`), and the scale when it is a guess.
 */
export function useMapLooks(
  session: PaintSession,
  maps: readonly common_DesignColourMap[] | undefined,
  uses: readonly common_DesignFabricUse[] | undefined,
  open: boolean,
  /** R9 · hardware label → its use's index (`paintRun`), and the views whose map is exported. */
  hardware?: { labels: ReadonlyMap<string, number>; views: readonly string[]; remainder: number },
): Map<string, { map: string; mockup: string; scale: string }> {
  const [drawn, setDrawn] = useState<Map<string, string>>(() => new Map());
  const [exported, setExported] = useState<Map<string, string>>(() => new Map());
  // M5 · named parts move the openings, and with them the drawing.
  const partsGen = session.partsGen;
  useEffect(() => {
    if (!open || !maps || maps.length === 0) return;
    let live = true;
    void session
      .mockupPreviews(maps, uses ?? [], hardware?.labels, hardware?.remainder ?? -1)
      .then((m) => {
        if (live) setDrawn(m);
      });
    const views = new Set(hardware?.views ?? []);
    const out = maps.filter((m) => views.has(m.view ?? ''));
    if (out.length > 0)
      void session.exportPreviews(out).then((m) => {
        if (live) setExported(m);
      });
    return () => {
      live = false;
    };
  }, [open, maps, uses, session, partsGen, hardware]);
  const version = session.getVersion();
  return useMemo(() => {
    const out = new Map<string, { map: string; mockup: string; scale: string }>();
    const plan = session.plan();
    for (const m of maps ?? []) {
      const view = m.view ?? '';
      const v = session.views.get(view);
      const scale = v ? session.scaleOf(v) : null;
      out.set(view, {
        // R9 · a map with hardware goes out exported (its buttons in the cloth around them).
        map: exported.get(view) ?? plan?.maps.find((x) => x.mediaId === m.mediaId)?.url ?? '',
        mockup: session.mockUrls.get(m.mockupMediaId ?? 0) ?? drawn.get(view) ?? '',
        scale: scale?.estimated ? `scale ≈ ${scale.acrossMm} mm (est.)` : '',
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, maps, version, drawn, exported]);
}
