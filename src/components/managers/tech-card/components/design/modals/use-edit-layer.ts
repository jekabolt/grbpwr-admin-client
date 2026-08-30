import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { adminService } from 'api/api';
import type { common_DesignEditLayer, common_MediaFull } from 'api/proto-http/admin';
import { useCallback, useMemo } from 'react';

import { designKeys } from '../use-design-band';

/**
 * THE EDIT LAYER'S DATA SEAM — the three RPCs the band's read layer deliberately does not carry.
 *
 * `useDesignWrites` covers the band's own writes; the layer verbs are separate for the reason the
 * contract states in as many words: `GetDesignBand` lists the layers WITHOUT their strokes, because
 * the cap is 512 KB PER LAYER and a card may hold several. So the editor fetches the ONE layer it
 * is about to open, and only when it opens it. That is a read with a different lifetime from the
 * band's, and folding it into the band query would make every open of the tab cost megabytes to
 * draw a list of thumbnails.
 *
 * THE COMPARE-AND-SET IS THE WHOLE PROTOCOL. Both writers echo the `rev` they believed they were
 * acting on and a mismatch is `Aborted: layer_rev_mismatch`. It is not a formality on the flatten
 * either — `expected_rev` there guards the INTENTION, not the rendering: without it a colleague
 * saves r4 while somebody who last saw r3 presses flatten, and r4 is materialised under an
 * intention that never saw it. So every response's rev is handed back to the caller and nothing
 * here retries a mismatch: a retry would overwrite the other person's work with a stale intent.
 */

export type LayerHandle = { id: number; rev: number };

/** The layers the band already listed, indexed by the media they trace. Strokes are NOT here. */
export function findLayerForMedia(
  layers: common_DesignEditLayer[] | undefined,
  mediaId: number,
): common_DesignEditLayer | undefined {
  if (!mediaId) return undefined;
  return (layers ?? []).find((l) => (l.baseMediaId ?? 0) === mediaId);
}

export function useDesignEditLayer(techCardId: number, layerId: number) {
  return useQuery({
    queryKey: designKeys.layer(layerId),
    queryFn: () => adminService.GetDesignEditLayer({ techCardId, layerId }),
    // A layer id of 0 is «this drawing has never been saved» — a real state, not a pending read.
    enabled: layerId > 0 && techCardId > 0,
    // Read once per opening: the editor is the only writer of the thing it is reading, and a
    // refetch mid-gesture would fight the strokes under the pointer.
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
}

export function useEditLayerWrites(techCardId: number) {
  const qc = useQueryClient();

  const invalidate = useCallback(() => {
    // The BAND, not the layer: `layer_rev` on a bench picture and the layer list both live there,
    // and the stale-plate badge on ARTIFACTS is computed from them.
    qc.invalidateQueries({ queryKey: designKeys.band(techCardId) });
  }, [qc, techCardId]);

  /**
   * Store the strokes. `layer_id = 0` WITH `base_media_id = 0` gives birth to a clean vector base —
   * the «draw it» door out of an empty studio, which has no picture underneath it at all.
   */
  const saveLayer = useMutation({
    mutationFn: (input: {
      layerId: number;
      baseMediaId: number;
      expectedRev: number;
      strokes: string;
    }) =>
      adminService.SaveDesignEditLayer({
        techCardId,
        layerId: input.layerId,
        baseMediaId: input.baseMediaId,
        expectedRev: input.expectedRev,
        strokes: input.strokes,
      }),
    onSuccess: invalidate,
  });

  /**
   * File an ALREADY-RASTERISED image as a picture carrying `derived_from`, `source_class` and
   * `layer_rev`.
   *
   * THE CLIENT RASTERISES AND THE SERVER RECORDS THE PROVENANCE — there is no vector renderer
   * anywhere in the backend and the strokes are this client's own format, so the only place that
   * can honestly turn them into pixels is the canvas that drew them.
   */
  const flattenLayer = useMutation({
    mutationFn: (input: { layerId: number; expectedRev: number; mediaId: number }) =>
      adminService.FlattenDesignEditLayer({
        techCardId,
        layerId: input.layerId,
        expectedRev: input.expectedRev,
        mediaId: input.mediaId,
      }),
    onSuccess: invalidate,
  });

  return useMemo(
    () => ({ saveLayer, flattenLayer, invalidate }),
    [saveLayer, flattenLayer, invalidate],
  );
}

/**
 * The raster goes up VERBATIM, and that is why this does not call `useUploadMedia`.
 *
 * The shared hook hard-codes `preserve_original: false` — deliberately, with its own comment: the
 * media manager's ordinary path re-encodes and derives thumbnails, and switching it globally would
 * silently change the weight and format of everything anybody uploads. A flattened vector edit is
 * the one thing that must NOT take that path: it is a line drawing, a lossy re-encode rings every
 * hard edge on it, and the plate's `content_hash` — which a minted sheet pins and the stale badge
 * compares against — should be the hash of the bytes this editor actually produced.
 */
export async function uploadRaster(dataUrl: string): Promise<common_MediaFull> {
  const response = await adminService.UploadContentImage({
    rawB64Image: dataUrl,
    preserveOriginal: true,
  });
  const media = response.media;
  if (!media?.id) throw new Error('the raster went up but came back without an id');
  return media;
}

/**
 * The server's refusals for this feature, in words a person can act on.
 *
 * Read the same way the mint's are: by CODE, because the codes are the vocabulary. The absent
 * handler is spelled out separately — grpc-gateway answers an unregistered path with 501 and a
 * proxy may turn that into 404, and «the drawing did not save» over a missing binary sends somebody
 * hunting for a bug in their own strokes.
 */
export function layerRefusalText(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  const raw = error instanceof Error ? error.message : '';
  const has = (code: string) => raw.includes(code);

  if (status === 404 || status === 501 || has('Unimplemented'))
    return 'this server has no vector editor yet — the layer routes are not deployed. Nothing was saved; download the SVG if you need to keep this drawing.';
  if (status === 409 || has('layer_rev_mismatch'))
    return 'somebody saved this drawing while it was open. Nothing was written — reopen the layer to see their version, then redraw on top of it. Your strokes are still on screen until you close this.';
  if (has('strokes_too_large'))
    return 'too many strokes for one layer (the ceiling is 512 KB). Split the drawing across two layers rather than thinning it — thinning silently moves lines somebody drew on purpose.';
  if (has('empty_layer'))
    return 'there is nothing on this layer to flatten. Draw at least one line first.';
  if (status === 400 || has('InvalidArgument'))
    return raw || 'the server refused the raster — it must be an image this installation holds.';
  return raw || 'the drawing did not go through';
}
