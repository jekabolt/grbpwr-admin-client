import type {
  GetDesignBandResponse,
  common_AdminColorwayRef,
  common_DesignPicture,
  common_MediaFull,
} from 'api/proto-http/admin';
import { useTechCard } from 'components/managers/tech-cards/components/useTechCardQuery';
import { useMemo, useState, type JSX } from 'react';
import SelectComponent from 'ui/components/select';
import Text from 'ui/components/text';

import { colorwayOf } from '../../bench-kinds';
import { colorwayLabel } from '../../colorway-picker';
import { PictureTile } from '../../picture-tile';
import { FieldRow } from '../../render/field-row';
import { SAMPLE_WORD, mediaThumb, outputsOfKind } from '../../render/model';
import { isPictureHidden } from '../../visibility';

/**
 * ═══ TILE 1 · THE PRODUCT — FABRIC RENDERS OF ONE OF THIS CARD'S COLOURWAYS (C-09) ══════════════
 *
 * Owner: «продукт колорвей из наших колорвеев из фабрик рендер — required field». Two steps:
 *
 *   COLOURWAY  [ ROSSO · 3 renders ▾ ]
 *   [render] [render] [render]               ← that colourway's fabric renders; 1..4 are worn
 *
 * THE SERVER'S RULE, MIRRORED (G-02, Codex 10, `product_not_colorway_render`): with
 * `options.product_colorway_id = X`, every `role=product` picture must be a picture of kind
 * `render` of colourway X on the band — a whole-card output whose own colourway is X, or a plate
 * on X's render bench. `productRendersOf` is exactly that pool (minus what cannot be an input:
 * hidden, display-only, no picture to draw), so a pick made here is one the door accepts, and a
 * render of another colourway can never ride under X's name.
 *
 * ONE COLOURWAY PER RUN. Changing the colourway drops the picks of the old one (they would be
 * refused) and wears the newest render of the new one, so the required field is answered by one
 * press; more renders — layered garments, a second view — are further presses, up to `max`.
 *
 * «SAMPLE» (colourway 0, the render step's own word for it) is offered only when the card has
 * renders filed under no colourway (every render made before the colourway axis). It sends `product_colorway_id: 0`, which claims nothing, and the
 * server checks nothing — the honest answer for a render that belongs to no colourway.
 *
 * The draft is the panel's (C-08's contract): the renders in pick order and the colourway id.
 */
export type ColourwayRenderPickerProps = {
  band: GetDesignBandResponse;
  techCardId: number;
  value: readonly common_MediaFull[];
  colorwayId: number;
  max: number;
  onChange: (next: { renders: readonly common_MediaFull[]; colorwayId: number }) => void;
  disabled?: boolean;
};

const isRender = (p?: common_DesignPicture | null) =>
  (p?.kind ?? '').trim().toLowerCase() === 'render';

/** A picture that may leave as an input: shown, not display-only, with an address to draw. */
const usable = (p?: common_DesignPicture | null): p is common_DesignPicture =>
  !!p && !isPictureHidden(p) && !p.displayOnly && !!p.media && !!mediaThumb(p.media);

/**
 * THE RENDERS COLOURWAY `cw` MAY BE WORN FROM — the pool of `designRefuseTryonProductNotColourwayRender`:
 * the render bench of `cw` first (the plates a person chose), then the whole-card render outputs
 * of `cw`, newest run first. One entry per media id (the wire is keyed by media).
 */
export function productRendersOf(band: GetDesignBandResponse, cw: number): common_MediaFull[] {
  const want = colorwayOf({ colorwayId: cw });
  const seen = new Set<number>();
  const out: common_MediaFull[] = [];
  const take = (p: common_DesignPicture) => {
    const id = p.media?.id ?? 0;
    if (id <= 0 || seen.has(id)) return;
    seen.add(id);
    out.push(p.media!);
  };
  for (const slot of band.bench ?? []) {
    const p = slot.picture;
    if (!usable(p) || !isRender(p)) continue;
    /* A plate belongs to the colourway of the render bench it stands on (its own picture may be
       unattributed); the server also accepts it under the picture's own named colourway. «Sample»
       is only what no bench and no picture names. */
    const slotIsRender = (slot.kind ?? '').trim().toLowerCase() === 'render';
    const home = slotIsRender ? colorwayOf(slot) : colorwayOf(p);
    if (home === want || (want > 0 && colorwayOf(p) === want)) take(p);
  }
  for (const { picture } of outputsOfKind(band, 'render', want)) {
    if (usable(picture) && isRender(picture) && colorwayOf(picture) === want) take(picture);
  }
  return out;
}

export type ProductColorway = { id: number; label: string; renders: number };

/**
 * The colourways the select offers, in the card's own order, each with its render count;
 * «sample» (id 0) first, and only when it has renders.
 */
export function productColorwaysOf(
  band: GetDesignBandResponse,
  colorways: readonly common_AdminColorwayRef[],
): ProductColorway[] {
  const out: ProductColorway[] = [];
  const none = productRendersOf(band, 0).length;
  if (none) out.push({ id: 0, label: SAMPLE_WORD, renders: none });
  for (const ref of colorways) {
    const id = ref.colorwayId ?? 0;
    if (id <= 0 || out.some((c) => c.id === id)) continue;
    out.push({ id, label: colorwayLabel(ref), renders: productRendersOf(band, id).length });
  }
  return out;
}

const rendersWord = (n: number) => (n ? `${n} render${n === 1 ? '' : 's'}` : 'no renders yet');

export function ColourwayRenderPicker({
  band,
  techCardId,
  value,
  colorwayId,
  max,
  onChange,
  disabled,
}: ColourwayRenderPickerProps): JSX.Element {
  const { data: techCard, isLoading } = useTechCard(techCardId > 0 ? techCardId : undefined);
  const colorways = useMemo(
    () => productColorwaysOf(band, techCard?.colorways ?? []),
    [band, techCard?.colorways],
  );
  /* «Which colourway is open» is the draft's once a render is worn; before that (and after the
     last one is dropped) a fresh form has chosen nothing — `0` alone cannot tell «none yet» from
     «no colourway», so the first choice is remembered here. */
  const [touched, setTouched] = useState(false);
  const shown = value.length > 0 || touched ? colorwayId : null;
  const renders = useMemo(
    () => (shown === null ? [] : productRendersOf(band, shown)),
    [band, shown],
  );
  const picked = value.map((m) => m.id ?? 0);
  const full = picked.length >= max;

  const pickColourway = (id: number) => {
    setTouched(true);
    if (id === shown) return;
    const first = productRendersOf(band, id)[0];
    onChange({ renders: first ? [first] : [], colorwayId: id });
  };
  const toggle = (media: common_MediaFull) => {
    const id = media.id ?? 0;
    const next = picked.includes(id)
      ? value.filter((m) => (m.id ?? 0) !== id)
      : full
        ? value
        : [...value, media];
    onChange({ renders: next, colorwayId: shown ?? 0 });
  };

  const noRenders = !isLoading && colorways.every((c) => c.renders === 0);

  return (
    <div className='flex flex-col gap-4' data-colourway-render-picker={shown ?? ''}>
      <FieldRow label='Colourway' className='py-2'>
        <div className='ml-auto w-[280px] max-w-full'>
          <SelectComponent
            name='playground-product-colourway'
            value={shown === null ? undefined : String(shown)}
            placeholder={isLoading ? 'reading the colourways…' : 'pick a colourway'}
            disabled={disabled || isLoading || noRenders}
            items={colorways.map((c) => ({
              value: String(c.id),
              label: `${c.label} · ${rendersWord(c.renders)}`,
              disabled: c.renders === 0,
            }))}
            fullWidth
            onValueChange={(next: string) => {
              const id = Number(next);
              if (next !== '' && Number.isFinite(id) && id >= 0) pickColourway(id);
            }}
          />
        </div>
      </FieldRow>

      {noRenders ? (
        <Text size='micro' variant='label' component='p' className='normal-case'>
          This card has no fabric renders yet. Make one on FABRIC RENDER, then pick it here.
        </Text>
      ) : (
        shown !== null && (
          <div className='flex flex-col gap-2'>
            <div
              className='flex flex-wrap items-start gap-2.5'
              role='group'
              aria-label='fabric renders of this colourway'
            >
              {renders.map((m, i) => {
                const id = m.id ?? 0;
                const at = picked.indexOf(id);
                const on = at >= 0;
                const dead = disabled || (!on && full);
                return (
                  <div key={id} className='w-[88px] shrink-0' data-product-render={id}>
                    <PictureTile
                      url={mediaThumb(m)}
                      alt={`render ${i + 1} of this colourway`}
                      aspect='4/5'
                      fit='cover'
                      selected={on}
                      dim={!on && full}
                      badge={on ? String(at + 1) : undefined}
                      className='w-full bg-bgColor'
                      onOpen={dead ? undefined : () => toggle(m)}
                      onSelect={
                        dead
                          ? undefined
                          : {
                              onClick: () => toggle(m),
                              ariaLabel: on
                                ? `take render ${i + 1} off the model`
                                : `put render ${i + 1} on the model`,
                              title: on ? 'take it off' : 'wear it',
                            }
                      }
                      selectLabel={on ? 'drop' : 'wear'}
                    />
                  </div>
                );
              })}
            </div>
            {/* The count is the section header's («2/4»); a caption here would say it twice. */}
            {renders.length === 0 && (
              <Text size='micro' variant='label' component='p' className='normal-case'>
                No render of this colourway to wear yet.
              </Text>
            )}
          </div>
        )
      )}
    </div>
  );
}
