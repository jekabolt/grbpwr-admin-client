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
import type { GetDesignBandResponse } from 'api/proto-http/admin';
import { adminService } from 'api/api';
import { fetchMediaBlob } from 'lib/features/media-blob';
import { useEffect, useMemo, useSyncExternalStore } from 'react';

import { assetThumb } from '../assets/model';
import {
  PLAN_BYTES_MAX,
  PLAN_CLOTHS_MAX,
  PLAN_MAPS_MAX,
  PLAN_PALETTE_MAX,
  readColourPlan,
  writeCloth,
  writeMap,
  type ColourPlanDoc,
  type PlanCloth,
  type PlanMap,
} from '../colour-plan/model';
import { uploadRaster } from '../modals/use-edit-layer';
import { bindingsOf, type ClothSlot } from '../pattern/slot-fabrics';
import { benchSides } from '../render/model';
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
  gestureLive,
  groupsNamed,
  markFontPx,
  markPoints,
  marksTint,
  paintGesture,
  partIndices,
  partsOf,
  PARTS_REGIONS_MAX,
  PARTS_REGIONS_MIN,
  type Gesture,
  type ViewParts,
} from './parts-model';
import { analyseFlat, REGIONS_ALGO_REV, type FlatRegions } from './regions';

export type PaintTool = 'click' | 'pen' | 'erase';

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
  /** Auto parts asked and refused: `parts · retry` by the side's caption. */
  partsFailed: string;
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
  save: PaintSaveState = 'idle';
  saveError = '';

  private undoStack: Gesture[] = [];
  private redoStack: Gesture[] = [];
  /** Auto parts asked once per (view, flat, cutter) in this session. */
  private asked = new Set<string>();
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
    if (changed) this.bump();
    for (const v of this.views.values()) this.suggestParts(v);
  }

  /* ─────────────────────────── auto parts ─────────────────────────── */

  private partsKey = (v: PaintView) => `${v.view}|${v.baseMediaId}|${REGIONS_ALGO_REV}`;

  /** The band's suggestion row for this side's flat and this cutter. */
  private bandParts(v: PaintView) {
    return (this.band?.partsSuggestions ?? []).find(
      (s) =>
        s.view === v.view &&
        (s.baseMediaId ?? 0) === v.baseMediaId &&
        (s.algoRev ?? '') === REGIONS_ALGO_REV,
    );
  }

  /** Lay the band's suggestion for this flat over its regions. True when it changed. */
  private takeParts(v: PaintView): boolean {
    if (v.status !== 'ready' || !v.flat) return false;
    const row = this.bandParts(v);
    if (!row) return false;
    const sig = JSON.stringify([row.parts, row.splitNeeded]);
    if (sig === v.partsSig) return false;
    v.partsSig = sig;
    v.parts = partsOf(row, v.flat, v.parts?.seeds ?? markPoints(v.flat));
    v.partsFailed = '';
    return true;
  }

  /** A side ready, cut into 2..60 regions and without parts: ask the model, once. */
  private suggestParts(v: PaintView, again = false) {
    if (v.status !== 'ready' || !v.flat || v.parts || !this.band) return;
    if (v.flat.count < PARTS_REGIONS_MIN || v.flat.count > PARTS_REGIONS_MAX) return;
    const key = this.partsKey(v);
    if (this.asked.has(key) && !again) return;
    this.asked.add(key);
    const flat = v.flat;
    void (async () => {
      try {
        const seeds = markPoints(flat);
        const media = await uploadRaster(marksPng(flat, seeds));
        // The upload took a while: the side may have changed or its parts arrived meanwhile.
        if (this.views.get(v.view) !== v || v.parts || this.bandParts(v)) {
          if (this.views.get(v.view) === v && !v.parts && this.takeParts(v)) this.bump();
          return;
        }
        const res = await adminService.SuggestDesignParts({
          techCardId: this.techCardId,
          view: v.view,
          baseMediaId: v.baseMediaId,
          marksMediaId: media.id ?? 0,
          regionCount: flat.count,
          algoRev: REGIONS_ALGO_REV,
          force: false,
        });
        if (this.views.get(v.view) !== v) return;
        const s = res.suggestion;
        v.parts = s ? partsOf(s, flat, seeds) : null;
        if (!v.parts) throw new Error('the assistant answered nothing usable');
        v.partsSig = JSON.stringify([s?.parts, s?.splitNeeded]);
        v.partsFailed = '';
        void this.qc.invalidateQueries({ queryKey: designKeys.band(this.techCardId) });
      } catch (e) {
        if (this.views.get(v.view) !== v) return;
        v.partsFailed = (e instanceof Error && e.message) || 'the parts were not named';
      }
      this.bump();
    })();
  }

  /** `parts · retry`. */
  retryParts(view: string) {
    const v = this.views.get(view);
    if (!v?.partsFailed) return;
    v.partsFailed = '';
    this.bump();
    this.suggestParts(v, true);
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
      partsFailed: '',
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
        this.suggestParts(v);
      } catch {
        // A view whose saved painting could not be read is NOT paintable: painting over it would
        // save a blank over somebody's work.
        if (this.views.get(view) === v) v.status = 'error';
      }
      this.bump();
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
    if (this.tool === 'erase') this.tool = 'click';
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
    if (this.tool === 'erase') this.tool = 'click';
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
   * A part click: the part under the pointer, and — by its name (R9) — the same part on every
   * other side that has parts, one gesture (one undo). The other sides painted light up a moment.
   */
  paintPart(view: string, group: number, at: { x: number; y: number }) {
    const v = this.views.get(view);
    if (!v?.parts || !v.flat || !v.labels) return;
    const targets = [{ view, idx: partIndices(v.labels, v.flat, v.parts, group, at) }];
    const label = v.parts.groups[group]?.label ?? '';
    for (const o of this.views.values()) {
      if (o === v || o.status !== 'ready' || !o.parts || !o.flat || !o.labels) continue;
      for (const g of groupsNamed(o.parts, label))
        targets.push({ view: o.view, idx: partIndices(o.labels, o.flat, o.parts, g) });
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

  /** One gesture over several sides. Returns the sides it changed. */
  private applyMany(targets: { view: string; idx: Int32Array }[]): string[] {
    const value = this.tool === 'erase' ? 0 : this.armed ? packHex(this.armed) : 0;
    if (this.tool !== 'erase' && !value) return [];
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
