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
} from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

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
import { bindingsOf, type ClothSlot } from '../pattern/slot-fabrics';
import { benchSides, renderSheetViews } from '../render/model';
import { designKeys } from '../use-design-band';
import {
  anyPainted,
  freeColourLabel,
  hexOf,
  labelsFromMap,
  mapPixels,
  packHex,
  paintSize,
  redoDiff,
  slotLabels,
  undoDiff,
} from './map-model';
import {
  concatIndices,
  gestureLive,
  keyedSuggestion,
  markFontPx,
  markPoints,
  marksTint,
  paintGesture,
  paintedPartNames,
  partIndices,
  partAcross,
  partNamesByLabel,
  partsOf,
  PARTS_REGIONS_MAX,
  PARTS_REGIONS_MIN,
  type Gesture,
  type ViewParts,
} from './parts-model';
import { mockupPixels, mockupTilePx, type MockupSkin } from './mockup';
import { analyseFlat, REGIONS_ALGO_REV, type FlatRegions } from './regions';

/** `artwork` (R7): the armed artwork is placed on the flats as a box; the paint stays as is. */
export type PaintTool = 'click' | 'pen' | 'erase' | 'artwork';

export type PaintView = {
  view: string;
  baseMediaId: number;
  status: 'loading' | 'ready' | 'error';
  /** A saved map stands for a flat that is no longer in this slot; the first gesture starts anew. */
  stale: boolean;
  flat: FlatRegions | null;
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
  /** The model's parts over this flat's regions (auto parts); null = regions only (Ф1). */
  parts: ViewParts | null;
  /** The suggestion row `parts` came from (re-read only when it changes). */
  partsSig: string;
};

/** One thing to paint with: a slot's bound cloth or a free colour. */
export type PaintMaterial = {
  label: string;
  kind: 'slot' | 'colour';
  name: string;
  bomItemId: number;
  /** Texture picture (slot) or ''. */
  url: string;
  /** The colour (colour label) or ''. */
  colourHex: string;
};

export type PaintSaveState = 'idle' | 'pending' | 'saving' | 'unsaved' | 'error';

/** A material's look on the canvas: a small RGBA tile, or a flat colour. */
export type PaintSkin = { tile: ImageData | null; hex: string };

const DEBOUNCE_MS = 1200;
const TILE = 128;

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

async function tileOf(url: string): Promise<ImageData> {
  const blob = await fetchMediaBlob(url);
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = TILE;
  canvas.height = TILE;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no 2d context');
  const s = Math.max(TILE / bmp.width, TILE / bmp.height);
  ctx.drawImage(
    bmp,
    (TILE - bmp.width * s) / 2,
    (TILE - bmp.height * s) / 2,
    bmp.width * s,
    bmp.height * s,
  );
  bmp.close();
  return ctx.getImageData(0, 0, TILE, TILE);
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
  private lastColorway = 0;
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
  /** The part under the pointer (R17): the same part is tinted on every side. */
  hovered: { view: string; group: number } | null = null;
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
  busy = () => this.save === 'pending' || this.save === 'saving' || this.timer !== null;

  /* ─────────────────────────── sync with the band ─────────────────────────── */

  sync(band: GetDesignBandResponse, slots: readonly ClothSlot[] | undefined, colorwayId: number) {
    this.band = band;
    this.lastSlots = slots;
    this.lastColorway = colorwayId;
    let changed = false;
    const list = (slots ?? []).filter((s) => s.bomItemId > 0);
    this.slotLabel = slotLabels(list.map((s) => s.bomItemId));

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
        name: slot.name,
        bomItemId: slot.bomItemId,
        url: assetThumb(asset),
        colourHex: (asset.colourHex ?? '').trim(),
      });
    }
    for (const c of this.colours)
      materials.push({
        label: c.label,
        kind: 'colour',
        name: c.colourHex,
        bomItemId: 0,
        url: '',
        colourHex: c.colourHex,
      });
    const sig = (m: PaintMaterial[]) => m.map((x) => `${x.label}${x.url}${x.colourHex}`).join('|');
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
    // Unbound painted slots still show: in their label colour.
    for (const [, label] of this.slotLabel)
      if (!this.skins.has(label)) this.skins.set(label, { tile: null, hex: label });

    // Views: every side holding a flat.
    const seen = new Set<string>();
    for (const side of benchSides(band)) {
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
      this.openView(side.view, id, url, plan, fw > 0 && fh > 0 ? fw / fh : 0.6);
      changed = true;
    }
    for (const view of [...this.views.keys()])
      if (!seen.has(view)) {
        this.views.delete(view);
        changed = true;
      }
    if (changed) this.prune();
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
        (s.algoRev ?? '') === REGIONS_ALGO_REV,
    );
  }

  /** The side has the card-level answer (Ф2.1 topology); an older side-by-side one is stale. */
  private partsFresh(v: PaintView): boolean {
    const row = this.bandParts(v);
    return (!!row && keyedSuggestion(row)) || !!v.parts?.keyed;
  }

  /**
   * Lay the band's suggestion for this flat over its regions. True when it changed. A stale row
   * (no `part_key`) still names the parts until the card-level answer comes, never over it.
   */
  private takeParts(v: PaintView): boolean {
    if (v.status !== 'ready' || !v.flat) return false;
    const row = this.bandParts(v);
    if (!row) return false;
    if (v.parts?.keyed && !keyedSuggestion(row)) return false;
    const sig = JSON.stringify([row.parts, row.splitNeeded]);
    if (sig === v.partsSig) return false;
    v.partsSig = sig;
    v.parts = partsOf(row, v.flat, v.parts?.seeds ?? markPoints(v.flat), v.view);
    return true;
  }

  /**
   * Ф2.1: once every side holding a flat is cut (or failed to load), ONE call names the parts of
   * all of them together — one part, one key, across the sides. Sides cut into fewer than 2 or more
   * than 60 regions are not sent. Asked once per set of flats in this session.
   */
  private suggestCard(again = false) {
    if (!this.band) return;
    const all = [...this.views.values()];
    if (all.some((v) => v.status === 'loading')) return;
    const sides = all.filter(
      (v): v is PaintView & { flat: FlatRegions } =>
        v.status === 'ready' &&
        !!v.flat &&
        v.flat.count >= PARTS_REGIONS_MIN &&
        v.flat.count <= PARTS_REGIONS_MAX,
    );
    if (sides.length === 0 || sides.every((v) => this.partsFresh(v))) return;
    const key = `${sides
      .map((v) => `${v.view}:${v.baseMediaId}`)
      .sort()
      .join('|')}|${REGIONS_ALGO_REV}`;
    if (this.asked.has(key) && !again) return;
    this.asked.add(key);
    this.partsFailed = '';
    const current = () => sides.every((v) => this.views.get(v.view) === v);
    void (async () => {
      try {
        const seeds = sides.map((v) => v.parts?.seeds ?? markPoints(v.flat));
        const media = await Promise.all(
          sides.map((v, i) => uploadRaster(marksPng(v.flat, seeds[i]))),
        );
        // The uploads took a while: a side changed (its own sync asks anew) or the answer came.
        if (!current()) return;
        if (sides.every((v) => this.partsFresh(v))) {
          for (const v of sides) this.takeParts(v);
          return;
        }
        const res = await adminService.SuggestDesignPartsCard({
          techCardId: this.techCardId,
          algoRev: REGIONS_ALGO_REV,
          force: false,
          views: sides.map((v, i) => ({
            view: v.view,
            baseMediaId: v.baseMediaId,
            marksMediaId: media[i].id ?? 0,
            regionCount: v.flat.count,
          })),
        });
        let got = 0;
        for (const s of res.suggestions ?? []) {
          const i = sides.findIndex((v) => v.view === s.view);
          const v = sides[i];
          // Numbers mean something only for the cut that drew them: a suggestion for another
          // flat or algo rev would paint unrelated regions.
          if (!v || this.views.get(v.view) !== v) continue;
          if ((s.baseMediaId ?? 0) !== v.baseMediaId || s.algoRev !== REGIONS_ALGO_REV) continue;
          const parts = partsOf(s, v.flat, seeds[i], v.view);
          if (!parts) continue;
          v.parts = parts;
          v.partsSig = JSON.stringify([s.parts, s.splitNeeded]);
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
        this.bump();
      }
    })();
  }

  /** `parts · retry` (one for the block). */
  retryParts() {
    if (!this.partsFailed) return;
    this.partsFailed = '';
    this.bump();
    this.suggestCard(true);
  }

  /**
   * The part under the pointer moved (R17); -1 / null = none. Other sides tint the same part.
   */
  setHover(view: string | null, group = -1) {
    const next = view && group >= 0 ? { view, group } : null;
    const was = this.hovered;
    if (was?.view === next?.view && was?.group === next?.group) return;
    this.hovered = next;
    this.bump();
  }

  /** The same part on every side with parts (R17), the given group first. */
  private across(view: string, group: number) {
    const sides = [...this.views.values()]
      .filter((v) => v.status === 'ready' && !!v.flat && !!v.labels)
      .map((v) => ({ view: v.view, parts: v.parts }));
    return partAcross(sides, view, group);
  }

  /** The groups on `view` that are the part hovered on ANOTHER side, and its name. */
  echoOf(view: string): { groups: number[]; label: string } | null {
    const h = this.hovered;
    if (!h || h.view === view) return null;
    const hit = this.across(h.view, h.group).find((x) => x.view === view);
    const v = this.views.get(view);
    if (!hit || !v?.parts) return null;
    return { groups: hit.groups, label: v.parts.groups[hit.groups[0]]?.label ?? '' };
  }

  private loadSkin(m: PaintMaterial) {
    const key = `${m.label}|${m.url}|${m.colourHex}`;
    if (m.kind === 'colour' || !m.url) {
      this.skins.set(m.label, { tile: null, hex: m.colourHex || m.label });
      return;
    }
    if (this.skinLoading.has(key)) return;
    this.skinLoading.add(key);
    if (!this.skins.has(m.label))
      this.skins.set(m.label, { tile: null, hex: m.colourHex || '#dddddd' });
    tileOf(m.url)
      .then((tile) => {
        this.skins.set(m.label, { tile, hex: m.colourHex || '#dddddd' });
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
  ) {
    const v: PaintView = {
      view,
      baseMediaId,
      status: 'loading',
      stale: false,
      flat: null,
      pixels: null,
      aspect,
      labels: null,
      dirty: false,
      mapBase: 0,
      rev: 0,
      parts: null,
      partsSig: '',
    };
    this.views.set(view, v);
    const saved = plan?.maps.find((m) => m.view === view);
    v.mapBase = saved?.mediaId ?? 0;
    void (async () => {
      try {
        const img = await pixelsOf(url);
        const flat = analyseFlat(img.data, img.width, img.height);
        let labels = new Uint32Array(img.width * img.height);
        if (saved && saved.baseMediaId === baseMediaId && !saved.gone) {
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
        } else if (saved) v.stale = true;
        if (this.views.get(view) !== v) return;
        v.flat = flat;
        v.pixels = img;
        v.aspect = img.width / img.height;
        v.labels = labels;
        v.status = 'ready';
        v.rev += 1;
        this.takeParts(v);
      } catch {
        // A view whose saved painting could not be read is NOT paintable: painting over it would
        // save a blank over somebody's work.
        if (this.views.get(view) === v) v.status = 'error';
      }
      this.bump();
      if (this.views.get(view) === v) this.suggestCard();
    })();
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
    const taken = [...this.slotLabel.values(), ...this.colours.map((c) => c.label)];
    for (const v of this.views.values())
      if (v.labels) for (const hex of this.labelsIn(v.labels)) taken.push(hex);
    const label = freeColourLabel(taken);
    if (!label) return '';
    this.colours.push({ label, colourHex });
    this.dirtyColours.add(label);
    this.materials = [
      ...this.materials,
      { label, kind: 'colour', name: colourHex, bomItemId: 0, url: '', colourHex },
    ];
    this.skins.set(label, { tile: null, hex: colourHex });
    this.armed = label;
    if (this.tool === 'erase' || this.tool === 'artwork') this.tool = 'click';
    this.bump();
    return label;
  }

  /** Change a free colour (its label stays; the plan row follows on the next save). */
  setColour(label: string, colourHex: string) {
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
  paintPart(view: string, group: number, at: { x: number; y: number }) {
    const v = this.views.get(view);
    if (!v?.parts || !v.flat || !v.labels) return;
    const targets: { view: string; idx: Int32Array }[] = [];
    for (const hit of this.across(view, group)) {
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
    const value = paint ?? (this.tool === 'erase' ? 0 : this.armed ? packHex(this.armed) : 0);
    if (paint === undefined && this.tool !== 'erase' && !value) return [];
    const ready = targets.flatMap((t) => {
      const v = this.views.get(t.view);
      return v && v.status === 'ready' && v.labels && t.idx.length > 0
        ? [{ view: t.view, base: v.baseMediaId, labels: v.labels, idx: t.idx }]
        : [];
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
      v.stale = false;
      v.dirty = true;
      v.rev += 1;
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
    }
    this.schedule();
    this.bump();
  }

  undo() {
    let g = this.undoStack.pop();
    while (g && !this.live(g)) g = this.undoStack.pop();
    if (!g) return this.bump();
    this.replay(g, true);
    this.redoStack.push(g);
  }

  redo() {
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
          }
        }
        // Old diffs name the old labels.
        this.undoStack = [];
        this.redoStack = [];
        this.materials = [];
      }
      // Colours of ours that the fresh plan rewrote but we never touched follow the plan.
      this.sync(band, this.lastSlots, this.lastColorway);
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

  /**
   * At GENERATE, after the save settled: one cloth mockup per outgoing map (`mockup.ts`), each
   * label filled with the cloth its fabric use names (the asset's picture at its true repeat, or
   * the free colour), uploaded. View → media id. Throws when any side cannot be drawn exactly as
   * its map (unsaved, another flat, another map) or any upload fails — the caller then launches
   * WITHOUT mockups; a mockup never blocks the run.
   */
  async mockups(
    maps: readonly common_DesignColourMap[],
    uses: readonly common_DesignFabricUse[],
  ): Promise<Map<string, number>> {
    const band = this.band;
    if (!band) throw new Error('no band');
    const assets = new Map((band.assets ?? []).map((a) => [a.id ?? 0, a]));
    const pictures = new Map<string, Promise<ImageData>>();
    const out = new Map<string, number>();
    for (const m of maps) {
      const view = m.view ?? '';
      const v = this.views.get(view);
      if (!v || v.status !== 'ready' || v.dirty || !v.labels || !v.flat || !v.pixels)
        throw new Error(`${view} is not drawn as saved`);
      if (v.baseMediaId !== (m.baseMediaId ?? 0) || v.mapBase !== (m.mediaId ?? 0))
        throw new Error(`${view} stands on another map`);
      const { flat, labels, pixels } = v;
      const skins = new Map<number, MockupSkin>();
      for (const sw of m.palette ?? []) {
        const hex = (sw.hex ?? '').toLowerCase();
        const use = uses.find((u) => (u.mapHex ?? '').toLowerCase() === hex);
        if (!use) continue;
        const asset = (use.assetId ?? 0) > 0 ? assets.get(use.assetId ?? 0) : undefined;
        const url = asset ? assetFull(asset) : '';
        if (url) {
          let pic = pictures.get(url);
          if (!pic) {
            pic = clothPixels(url);
            pictures.set(url, pic);
          }
          const img = await pic;
          skins.set(packHex(hex), {
            kind: 'tile',
            rgba: img.data,
            w: img.width,
            h: img.height,
            tilePx: mockupTilePx(use.repeatMm || asset?.repeatMm || 0, flat.w),
          });
        } else {
          const c = (use.colourHex ?? '').trim();
          if (c) skins.set(packHex(hex), { kind: 'colour', hex: c });
        }
      }
      const rgba = mockupPixels(flat, labels, pixels.data, skins);
      const media = await uploadRaster(pngOf(rgba, flat.w, flat.h));
      const id = media.id ?? 0;
      if (id <= 0) throw new Error('the mockup did not upload');
      out.set(view, id);
    }
    return out;
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
        const { rgba, palette } = mapPixels(v.labels, v.flat.ink, v.flat.w, v.flat.h);
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
): PaintSession {
  const qc = useQueryClient();
  const session = useMemo(() => new PaintSession(techCardId, qc), [techCardId, qc]);
  useEffect(() => () => session.dispose(), [session]);
  useEffect(() => {
    session.sync(band, slots, colorwayId);
  }, [session, band, slots, colorwayId]);
  useSyncExternalStore(session.subscribe, session.getVersion, session.getVersion);
  return session;
}
